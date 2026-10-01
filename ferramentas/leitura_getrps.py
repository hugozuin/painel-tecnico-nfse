"""Lê o getRps.js da lib do PlugNotas sem executá-lo (ele depende de banco e
de módulos que não estão nos insumos) e extrai, para cada chave do objeto que
a função devolve, os campos do JSON que ela lê e marcas do que faz com eles:
só o primeiro serviço, soma dos serviços, data, arredondamento ou valor
condicional.

O getRps.js é genérico para todos os padrões. Nas funções auxiliares com
ramos por padrão, vale o último retorno, porque o Nacional não está em
nenhum dos ramos. O uso do getRps.js nas emissões do Nacional não está
confirmado; o gerador o usa só onde as props não cobrem a tag."""

import re

RAIZES_INTERNAS = ("internal", "_id", "id", "padrao", "retorno")
CADEIA = r"((?:\??\.[A-Za-z_]\w*|\??\.?\[\d+\])+)"
METODOS = r"(\.(?:toISOString|reduce|length|slice|map|toFixed|toString|padStart|includes|toLowerCase|toUpperCase|substring|trim))+$"


def normalizar(cadeia, prefixo=""):
    caminho = re.sub(r"\?", "", cadeia)
    caminho = re.sub(r"\.?\[(\d+)\]", "[]", caminho).lstrip(".")
    return re.sub(METODOS, "", prefixo + caminho)


def maximais(caminhos):
    return sorted(c for c in caminhos if not any(outro != c and outro.startswith((c + ".", c + "[")) for outro in caminhos))


class LeituraGetRps:
    def __init__(self, conteudo):
        self.linhas = conteudo.splitlines()
        self.funcoes = self.ler_funcoes()

    def ler_funcoes(self):
        inicios = []
        for numero, linha in enumerate(self.linhas):
            achado = re.match(r"^(?:const|let|async function|function|module\.exports)\b\s*(\w*)", linha)
            if achado:
                inicios.append((achado.group(1), numero))
        inicios.append(("", len(self.linhas)))
        return {nome: (inicio, "\n".join(self.linhas[inicio:fim])) for (nome, inicio), (_, fim) in zip(inicios, inicios[1:])}

    def apelidos(self, corpo, parametros):
        mapa = dict(parametros)
        for _ in range(3):
            for nome, expressao in re.findall(r"(?:const|let)\s+(\w+)\s*=\s*([^\n]+)", corpo):
                encontrados = self.caminhos_diretos(expressao, mapa)
                if len(encontrados) == 1 and "=>" not in expressao and "find" not in expressao:
                    mapa.setdefault(nome, encontrados[0][0])
            for nomes, origem in re.findall(r"const\s*\{([^}]+)\}\s*=\s*(\w+)", corpo):
                if origem in mapa:
                    for nome in [parte.strip() for parte in nomes.split(",") if parte.strip()]:
                        mapa.setdefault(nome, f"{mapa[origem]}.{nome}")
        return mapa

    def caminhos_diretos(self, expressao, mapa):
        encontrados = []
        for raiz, cadeia in re.findall(rf"\b(nfse|\w+)\??{CADEIA}", expressao):
            if raiz == "nfse":
                caminho = normalizar(cadeia)
            elif raiz in mapa:
                caminho = normalizar(cadeia, mapa[raiz] + ("" if cadeia.startswith("[") else "."))
            else:
                continue
            if not caminho or caminho == "servico" or caminho.split(".")[0].split("[")[0] in RAIZES_INTERNAS:
                continue
            encontrados.append((caminho, "[0]" in cadeia or (raiz != "nfse" and "[]" in mapa.get(raiz, ""))))
        for nome, caminho in mapa.items():
            if re.search(rf"\b{re.escape(nome)}\b(?!\s*(?:\??\.|\[|:|\())", expressao):
                encontrados.append((caminho, "[]" in caminho))
        return encontrados

    def ler_expressao(self, expressao, mapa, profundidade=0):
        expressao = re.sub(r"isFromPadr\w*\(\s*\{[^}]*\}\s*\)", "", expressao)
        caminhos, marcas = set(), set()
        for parametro in re.findall(r"nfse\??\.servico\??\.reduce\(\s*\(\s*\w+\s*,\s*(\w+)\s*\)", expressao):
            mapa = {**mapa, parametro: "servico[]"}
            marcas.add("soma")
        for caminho, primeiro in self.caminhos_diretos(expressao, mapa):
            caminhos.add(caminho)
            if primeiro and "soma" not in marcas:
                marcas.add("primeiroServico")
        if re.search(r"toFixed\(|fixDecimals|roundingStrategy", expressao):
            marcas.add("arredondamento")
        if re.search(r"formatDate|moment|format\(", expressao):
            marcas.add("data")
        if re.search(r"\?\s*[^.?\s]", expressao) and re.search(r"\s:\s", expressao):
            marcas.add("condicional")
        if profundidade < 3:
            for nome in re.findall(r"\b(\w+)\s*\(", expressao):
                if nome in self.funcoes and nome != "getRps":
                    trecho, corpo = self.corpo_para_o_nacional(nome)
                    internos, marcas_internas = self.ler_expressao(trecho, self.apelidos(corpo, {}), profundidade + 1)
                    caminhos |= internos
                    marcas |= marcas_internas
        return caminhos, marcas

    def corpo_para_o_nacional(self, nome):
        corpo = self.funcoes[nome][1]
        if re.search(r"isFromPadr|\.padrao\b", corpo):
            retornos = re.findall(r"\breturn\b([\s\S]*?)(?=\n\s*(?:return\b|\}\s*$|if\b)|\Z)", corpo)
            if retornos:
                return retornos[-1], corpo
        return corpo, corpo

    def ler(self):
        if "getRps" not in self.funcoes:
            return {}
        inicio, corpo = self.funcoes["getRps"]
        linhas = corpo.splitlines()
        abertura = next((i for i, linha in enumerate(linhas) if re.match(r"^\s{2}return\s*\{", linha)), None)
        if abertura is None:
            return {}
        locais = dict(re.findall(r"^\s{2}const\s+(\w+)\s*=\s*([\s\S]*?)(?=\n\s{2}(?:const|return)\b)", corpo, flags=re.M))
        blocos = []
        for indice in range(abertura + 1, len(linhas)):
            linha = linhas[indice]
            if re.match(r"^\s{2}\}", linha):
                break
            achado = re.match(r"^\s{4}(\w+)\s*(:?)", linha)
            if achado and not linha.lstrip().startswith("..."):
                blocos.append([achado.group(1), inicio + indice + 1, [linha], achado.group(2) == ":"])
            elif blocos:
                blocos[-1][2].append(linha)
        resultado = {}
        for chave, numero, texto_bloco, explicito in blocos:
            expressao = "\n".join(texto_bloco)
            if not explicito:
                expressao = locais.get(chave, chave)
            expressao += "".join("\n" + definicao for nome, definicao in locais.items()
                                 if nome != chave and re.search(rf"\b{nome}\b", expressao))
            lista = re.search(r"\.map\(\s*\(?\s*(\w+)", expressao)
            if lista:
                raiz_da_lista = self.caminhos_diretos(expressao.split(".map(")[0] + ".map", {})
                base = raiz_da_lista[0][0].rsplit(".map", 1)[0] + "[]" if raiz_da_lista else ""
                for subchave, subexpressao in re.findall(r"^\s{6,12}(\w+):\s*([^\n]+)", expressao, flags=re.M):
                    caminhos, marcas = self.ler_expressao(subexpressao, {lista.group(1): base})
                    self.registrar(resultado, f"{chave}[].{subchave}", numero, caminhos, marcas)
                continue
            caminhos, marcas = self.ler_expressao(expressao, {})
            self.registrar(resultado, chave, numero, caminhos, marcas)
        return resultado

    @staticmethod
    def registrar(resultado, chave, numero, caminhos, marcas):
        if not caminhos:
            return
        resultado[chave.lower()] = {
            "chave": chave,
            "linha": f"getRps.js:{numero}",
            "json": maximais(caminhos),
            "marcas": sorted(marcas),
        }


def ler_getrps(arquivo):
    return LeituraGetRps(arquivo.read_text(encoding="utf-8")).ler()
