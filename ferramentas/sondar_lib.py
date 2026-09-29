"""Executa as props da lib do Nacional do PlugNotas (buildTx2/padrao-NACIONAL)
num processo Node (executar_lib.cjs) e descobre, por sondagem, o que cada chave
faz: de que campo do JSON sai, se copia, arredonda, formata data ou concatena,
que tabela de conversão aplica e em que condições é gravada.

A sondagem monta notas sintéticas a partir da documentação da API, com um
valor sentinela em cada campo, e varia um campo por vez, sem e com
versaoEsquema RTC007. A convenção de chamada (que parte do JSON vai para cada
função) é suposta, porque o index.js que chama as props não está nos insumos;
a conferência de notas a confirma."""

import json
import re
import subprocess
from itertools import combinations
from pathlib import Path

EXECUTOR = Path(__file__).with_name("executar_lib.cjs")
MARCA_ARREDONDAMENTO = "⟦R⟧"
MARCA_DATA = re.compile("⟦D:([^:⟧]*):([^⟧]*)⟧")
RAIZES_DAS_CHAMADAS = ("prestador.", "tomador.", "intermediario.", "servico[].", "deducao[].")
CAMPO_DO_ESQUEMA = "versaoEsquema"
ESQUEMA_RTC007 = "RTC007"
AUSENTE = "ausente"


def aplicar_lib(pasta_props, notas, marcado=False):
    processo = subprocess.run(
        ["node", str(EXECUTOR), str(pasta_props), "marcado" if marcado else "real"],
        input=json.dumps(notas, ensure_ascii=False), capture_output=True, text=True, encoding="utf-8")
    if processo.returncode != 0:
        linhas = processo.stderr.strip().splitlines()
        erro = next((linha for linha in linhas if re.match(r"^\w*Error\b", linha)), linhas[-1] if linhas else "sem mensagem")
        raise RuntimeError(f"falha ao executar a lib: {erro}")
    return [achatar_saida(resultado) for resultado in json.loads(processo.stdout)]


def achatar_saida(resultado):
    valores = {}
    for grupo, conteudo in resultado.items():
        if grupo == "erros":
            continue
        lista = isinstance(conteudo, list)
        prefixo = f"{grupo}[]." if lista else ""
        for item in conteudo if lista else [conteudo]:
            for chave, valor in (item or {}).items():
                if isinstance(valor, list):
                    for elemento in valor:
                        for subchave, subvalor in (elemento or {}).items():
                            valores.setdefault(f"{prefixo}{chave}[].{subchave}", []).append(subvalor)
                else:
                    valores.setdefault(prefixo + chave, []).append(valor)
    return {"valores": valores, "erros": resultado.get("erros", [])}


def atribuir(alvo, caminho, valor):
    partes = caminho.split(".")
    for indice, parte in enumerate(partes):
        ultima = indice == len(partes) - 1
        nome = parte[:-2] if parte.endswith("[]") else parte
        if parte.endswith("[]"):
            colecao = alvo.setdefault(nome, [] if ultima else [{}])
            if ultima:
                colecao.append(valor)
                return
            alvo = colecao[0]
        elif ultima:
            alvo[nome] = valor
        else:
            alvo = alvo.setdefault(nome, {})


def montar_nota(valores):
    nota = {}
    for caminho, valor in valores.items():
        atribuir(nota, caminho, valor)
    return nota


def sentinela(indice, tipo):
    if tipo == "boolean":
        return True
    if tipo == "integer":
        return 810000 + indice
    if tipo == "number":
        return 820000 + indice + 0.25
    return f"S{indice:04d}Z"


def texto(valor):
    if isinstance(valor, bool):
        return str(valor).lower()
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor)


def rotulo(valor):
    return AUSENTE if valor == AUSENTE else texto(valor)


def resumo(valores):
    if not valores:
        return ""
    return texto(valores[0]) if len(valores) == 1 else [texto(valor) for valor in valores]


def converter(valor, tipo):
    if tipo in ("integer", "number") and re.fullmatch(r"-?\d+(\.\d+)?", valor):
        return int(valor) if tipo == "integer" and "." not in valor else float(valor)
    return valor


def dominio(campo):
    tipo = campo.get("tipo", "string")
    if tipo == "boolean":
        return [True, False]
    valores = [converter(valor, tipo) for valor in campo.get("valores", [])]
    if tipo in ("integer", "number") and 0 not in valores:
        valores.append(0)
    return valores


def modo_da_saida(saida, marca):
    conteudo = texto(saida)
    if conteudo == marca:
        return {"modo": "copia"}
    data = MARCA_DATA.search(conteudo)
    if data:
        return {"modo": "data", "formato": data.group(1), "fuso": data.group(2)}
    if MARCA_ARREDONDAMENTO in conteudo:
        return {"modo": "arredondamento"}
    return {"modo": "transformado"}


def linhas_das_chaves(pasta_props):
    linhas = {}
    for arquivo in sorted(pasta_props.rglob("*.js")):
        relativo = arquivo.relative_to(pasta_props).as_posix()
        for numero, linha in enumerate(arquivo.read_text(encoding="utf-8").splitlines(), 1):
            achado = re.match(r"^\s*([A-Z]\w*)\s*:", linha)
            if achado:
                linhas.setdefault(achado.group(1), f"{relativo}:{numero}")
    return linhas


def campos_sondaveis(campos_documentados, campos_extras):
    campos = {caminho: campo for caminho, campo in campos_documentados.items() if caminho.startswith(RAIZES_DAS_CHAMADAS)}
    for caminho in campos_extras:
        if caminho.startswith(RAIZES_DAS_CHAMADAS):
            campos.setdefault(caminho, {"tipo": "string"})
    return {
        caminho: campo for caminho, campo in campos.items()
        if not any(outro.startswith((caminho + ".", caminho + "[")) for outro in campos)
    }


class Sondagem:
    def __init__(self, pasta_props, campos):
        self.pasta_props = pasta_props
        self.campos = campos
        ordem = sorted(campos)
        self.marcas = {caminho: sentinela(indice, campos[caminho].get("tipo", "string")) for indice, caminho in enumerate(ordem)}
        self.textos = {texto(marca): caminho for caminho, marca in self.marcas.items() if not isinstance(marca, bool)}
        self.padrao_marcas = re.compile("|".join(re.escape(marca) for marca in sorted(self.textos, key=len, reverse=True)))

    def campos_na_saida(self, valor):
        return {self.textos[achado] for achado in self.padrao_marcas.findall(texto(valor))}

    def tem_marca(self, valores):
        return any(self.padrao_marcas.search(texto(valor)) for valor in valores or [])

    def ligacoes(self, saida):
        encontradas = {}
        for chave, valores in saida["valores"].items():
            for valor in valores:
                for caminho in self.campos_na_saida(valor):
                    encontradas.setdefault((chave, caminho), modo_da_saida(valor, texto(self.marcas[caminho])))
        return encontradas

    def cenario(self, esquema, variaveis):
        base = dict(self.marcas)
        if esquema:
            base[CAMPO_DO_ESQUEMA] = esquema
        variantes = [(None, None)]
        textuais = []
        for caminho in variaveis:
            variantes.append((caminho, AUSENTE))
            variantes.extend((caminho, valor) for valor in dominio(self.campos[caminho]))
            if self.campos[caminho].get("tipo") in ("integer", "number"):
                valor = (self.campos[caminho].get("valores") or ["1"])[0]
                textuais += [(caminho, valor), (caminho, converter(valor, "integer"))]

        def nota(caminho, valor):
            valores = dict(base)
            if caminho is not None:
                if valor == AUSENTE:
                    valores.pop(caminho, None)
                else:
                    valores[caminho] = valor
            return montar_nota(valores)

        saidas = aplicar_lib(self.pasta_props, [nota(c, v) for c, v in variantes + textuais], marcado=True)
        principais, por_texto = saidas[:len(variantes)], saidas[len(variantes):]
        achados = [self.ligacoes(saida) for saida in principais]
        return {
            "origens": self.origens(variantes, principais, achados),
            "tabelas": self.tabelas(variantes, principais),
            "exigeNumero": self.exige_numero(variantes, principais, textuais, por_texto)
        }

    def origens(self, variantes, principais, achados):
        origens = {}
        for par in set().union(*achados):
            na_base = par in achados[0]
            mudancas = {}
            for (campo, valor), achadas in zip(variantes[1:], achados[1:]):
                if campo != par[1] and (par in achadas) != na_base:
                    mudancas.setdefault(campo, []).append(rotulo(valor))
            modo = achados[0].get(par) or next(achadas[par] for achadas in achados if par in achadas)
            origens[par] = {**modo, "condicoes": [
                {"tipo": "exceto" if na_base else "quando", "campo": campo, "valores": valores}
                for campo, valores in sorted(mudancas.items())
            ]}
        for chave, valores in principais[0]["valores"].items():
            for valor in valores:
                contidos = self.campos_na_saida(valor)
                if len(contidos) > 1:
                    for caminho in contidos:
                        origens[(chave, caminho)]["modo"] = "concatenacao"
        for chave, campos in self.somas(variantes, principais).items():
            for caminho in campos:
                origens[(chave, caminho)] = {"modo": "soma", "condicoes": []}
        return origens

    def somas(self, variantes, principais):
        base = principais[0]["valores"]
        encontradas = {}
        for chave, valores in base.items():
            if len(valores) != 1 or self.tem_marca(valores):
                continue
            numero = re.sub(f"^{MARCA_ARREDONDAMENTO}", "", texto(valores[0]))
            if not re.fullmatch(r"-?\d+(\.\d+)?", numero):
                continue
            dependencias = [
                campo for (campo, valor), saida in zip(variantes[1:], principais[1:])
                if valor == AUSENTE and isinstance(self.marcas.get(campo), (int, float)) and not isinstance(self.marcas.get(campo), bool)
                and saida["valores"].get(chave) != valores
            ]
            if not 2 <= len(dependencias) <= 6:
                continue
            for tamanho in range(len(dependencias), 1, -1):
                for grupo in combinations(dependencias, tamanho):
                    if abs(sum(self.marcas[campo] for campo in grupo) - float(numero)) < 0.001:
                        encontradas[chave] = list(grupo)
                        break
                if chave in encontradas:
                    break
        return encontradas

    def tabelas(self, variantes, principais):
        base = principais[0]["valores"]
        alteradas = set()
        for (campo, _), saida in zip(variantes[1:], principais[1:]):
            for chave in set(saida["valores"]) | set(base):
                antes, depois = base.get(chave), saida["valores"].get(chave)
                if antes != depois and not self.tem_marca(antes) and not self.tem_marca(depois):
                    alteradas.add((chave, campo))
        tabelas = {}
        for chave, campo in alteradas:
            tabela = {rotulo(valor): resumo(saida["valores"].get(chave))
                      for (variado, valor), saida in zip(variantes[1:], principais[1:]) if variado == campo}
            if len({json.dumps(saida) for saida in tabela.values()}) > 1:
                tabelas[(chave, campo)] = tabela
        return tabelas

    def exige_numero(self, variantes, principais, textuais, por_texto):
        exige = set()
        for indice in range(0, len(textuais), 2):
            campo = textuais[indice][0]
            como_texto, como_numero = por_texto[indice]["valores"], por_texto[indice + 1]["valores"]
            for chave in set(como_texto) | set(como_numero):
                antes, depois = como_texto.get(chave) or [], como_numero.get(chave) or []
                if list(map(texto, antes)) != list(map(texto, depois)) and not self.tem_marca(depois):
                    exige.add((chave, campo))
        return exige


def combinar(cenarios, linhas):
    sem, com = cenarios[None], cenarios[ESQUEMA_RTC007]
    resultado = {}

    def registro(chave):
        return resultado.setdefault(chave, {"linha": linhas.get(chave.split(".")[-1], ""), "origens": [], "tabelas": [], "exigeNumero": []})

    for par in sorted(set(sem["origens"]) | set(com["origens"])):
        chave, campo = par
        origem = dict(sem["origens"].get(par) or com["origens"][par])
        condicoes = list(origem["condicoes"])
        if par not in com["origens"]:
            condicoes.append({"tipo": "exceto", "campo": CAMPO_DO_ESQUEMA, "valores": [ESQUEMA_RTC007]})
        elif par not in sem["origens"]:
            condicoes.append({"tipo": "quando", "campo": CAMPO_DO_ESQUEMA, "valores": [ESQUEMA_RTC007]})
        origem["condicoes"] = condicoes
        registro(chave)["origens"].append({"json": campo, **origem})

    for par in sorted(set(sem["tabelas"]) | set(com["tabelas"])):
        chave, campo = par
        tabela_sem, tabela_com = sem["tabelas"].get(par), com["tabelas"].get(par)
        if tabela_sem is not None and tabela_com is not None and tabela_sem != tabela_com:
            registro(chave)["tabelas"].append({"json": campo, "esquema": "semRTC007", "valores": tabela_sem})
            registro(chave)["tabelas"].append({"json": campo, "esquema": ESQUEMA_RTC007, "valores": tabela_com})
        elif tabela_sem is not None and campo.startswith("servico[].") and tabela_com is None:
            registro(chave)["tabelas"].append({"json": campo, "esquema": "semRTC007", "valores": tabela_sem})
        elif tabela_sem is not None:
            registro(chave)["tabelas"].append({"json": campo, "valores": tabela_sem})
        else:
            registro(chave)["tabelas"].append({"json": campo, "esquema": ESQUEMA_RTC007, "valores": tabela_com})

    for chave, campo in sorted(sem["exigeNumero"] | com["exigeNumero"]):
        if campo not in registro(chave)["exigeNumero"]:
            registro(chave)["exigeNumero"].append(campo)
    return resultado


def sondar(pasta_props, campos_documentados, campos_extras=()):
    pasta_props = Path(pasta_props)
    campos = campos_sondaveis(campos_documentados, campos_extras)
    sondagem = Sondagem(pasta_props, campos)
    todos = sorted(campos)
    do_servico = [caminho for caminho in todos if caminho.startswith("servico[].")]
    cenarios = {None: sondagem.cenario(None, todos), ESQUEMA_RTC007: sondagem.cenario(ESQUEMA_RTC007, do_servico)}
    return combinar(cenarios, linhas_das_chaves(pasta_props))
