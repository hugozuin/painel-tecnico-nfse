"""Gera os arquivos de definição do de-para e da relação IBS/CBS.

Todo o conteúdo sai de documentos e das fontes do PlugNotas, sem texto
escrito à mão:

  Anexo VI      leiaute da DPS/NFS-e e regras de negócio
  Anexo VII     tabela de indicadores de operação (indOp)
  Anexo VIII    correlação entre item da LC 116, NBS, indOp e cClassTrib
  api.json      documentação pública da API do PlugNotas (campos do JSON)
  lib props     buildTx2/padrao-NACIONAL: o que cada chave faz com o JSON
  getRps.js     fonte secundária, para tags que as props não cobrem
  notas         pares de JSON e XML do Nacional, para conferir as ligações
  Mapping.txt   apoio: campo do dataset do componente para o caminho no XML
  LoadEnvio     apoio: campo do TX2 para o campo do dataset

A ligação de cada tag segue esta ordem: conferência de notas, documentação da
API e, por último, inferência pelos nomes do componente, que é só apoio.

Os anexos são públicos e ficam em fontes/nacional. Lib, getRps, script,
mapeamento e notas são internos: entram só por parâmetro e não vão para o
repositório. O JSON gerado guarda nomes de campo, números de linha e
tabelas de valores, nunca trechos de código nem dados das notas.

Uso:
  python ferramentas/gerar_definicoes.py --anexos fontes/nacional \\
      --api <api.json> --lib <pasta props> --rps <getRps.js> \\
      --script <LoadEnvio.txt> --mapeamento <Mapping.txt> --notas <pasta>

Sem --lib, o de-para sai só com o lado do Nacional. Sem --notas, vale o
último relatório de conferência (ferramentas/conferencia-notas.json).
Requer Python 3.10+, openpyxl e Node.
"""

import argparse
import difflib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

from conferir_notas import conferir, dependencias_da_sondagem, ler_pares
from documentacao_api import ler_documentacao, tags_citadas
from leitura_getrps import ler_getrps
from sondar_lib import sondar

ANEXO_VI = "anexovi-leiautesrn_rtc_ibscbs-v1-04-00-2013-nt009.xlsx"
ANEXO_VI_ANTERIOR = "anexovi-leiautesrn_rtc_ibscbs-v1-03-00-2013-nt007.xlsx"
NOTA_TECNICA_009 = "nt-009-se-cgnfse-v1-0-1.pdf"
ANEXO_VII = "anexovii-indop_ibscbs_v1-02-00.xlsx"
ANEXO_VIII = "anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-01-00.xlsx"
PREFIXO_NFSE = "NFSe/infNFSe/"
RELATORIO_DA_CONFERENCIA = Path(__file__).with_name("conferencia-notas.json")

RAIZES_DA_LIB = {
    "prestador": "prestador",
    "tomador": "tomador",
    "intermediario": "intermediario",
    "deducao": "deducao[]",
    "ibscbs": "servico[].ibscbs",
    "servico": "servico[]",
}

DPS = "NFSe/infNFSe/DPS/infDPS/"
AJUSTE_BC = DPS + "valores/vAjusteBC/documentos/docAjusteBC/"
LOC_IMOVEIS = DPS + "IBSCBS/imovel/gUnidImob/gAjusteBCLocImoveis/"
EQUIVALENCIAS_DA_NT009 = (
    (DPS + "IBSCBS/finNFSe", DPS + "finNFSe", "2.2"),
    (DPS + "valores/vDedRed/documentos/docDedRed/tpDedRed", AJUSTE_BC + "tpAjusteBC", "2.3"),
    (DPS + "IBSCBS/valores/gReeRepRes/documentos/tpReeRepRes", AJUSTE_BC + "tpAjusteBC", "2.3"),
    (DPS + "valores/vDedRed/documentos/docDedRed/", AJUSTE_BC, "2.3"),
    (DPS + "IBSCBS/valores/gReeRepRes/documentos/", AJUSTE_BC, "2.3"),
    (DPS + "valores/vDedRed/documentos/docDedRed", AJUSTE_BC.rstrip("/"), "2.3"),
    (DPS + "IBSCBS/valores/gReeRepRes/documentos", AJUSTE_BC.rstrip("/"), "2.3"),
    (DPS + "valores/vDedRed/", DPS + "valores/vAjusteBC/", "2.3"),
    (DPS + "IBSCBS/valores/gReeRepRes/", DPS + "valores/vAjusteBC/", "2.3"),
    (DPS + "valores/vDedRed", DPS + "valores/vAjusteBC", "2.3"),
    (DPS + "IBSCBS/valores/gReeRepRes", DPS + "valores/vAjusteBC", "2.3"),
    (PREFIXO_NFSE + "valores/vCalcDR", PREFIXO_NFSE + "valores/vCalcAjusteBCISSQN", "2.3"),
    (PREFIXO_NFSE + "IBSCBS/valores/vCalcReeRepRes", PREFIXO_NFSE + "IBSCBS/valores/vCalcAjusteBCIBSCBS", "2.3"),
    (PREFIXO_NFSE + "IBSCBS/valores/vCalcDedRedIBSCBS", PREFIXO_NFSE + "IBSCBS/valores/vCalcAjusteBCLocImoveis", "2.3"),
    (DPS + "IBSCBS/valores/gDedRedIBSCBS/tpDedRedIBSCBS", LOC_IMOVEIS + "tpAjusteBCLocImoveis", "2.6"),
    (DPS + "IBSCBS/valores/gDedRedIBSCBS/xTpDedRedIBSCBS", LOC_IMOVEIS + "xTpAjusteBCLocImoveis", "2.6"),
    (DPS + "IBSCBS/valores/gDedRedIBSCBS/vlrDedRedIBSCBS", LOC_IMOVEIS + "vAjusteBCLocImoveis", "2.6"),
    (DPS + "IBSCBS/valores/gDedRedIBSCBS", LOC_IMOVEIS.rstrip("/"), "2.6"),
    (DPS + "IBSCBS/imovel/end", DPS + "IBSCBS/imovel/gUnidImob/end", "2.6"),
    (DPS + "IBSCBS/imovel/cCIB", DPS + "IBSCBS/imovel/gUnidImob/cCIB", "2.6"),
    (DPS + "IBSCBS/imovel/inscImobFisc", DPS + "IBSCBS/imovel/gUnidImob/inscImobFisc", "2.6"),
    (DPS + "IBSCBS/gLocBensMoveis", DPS + "IBSCBS/bensMoveis", "2.7"),
)

PREFIXOS_POR_RAIZ = {
    "tomador.": "/toma/",
    "prestador.": "/prest/",
    "intermediario.": "/interm/",
    "servico[].ibscbs.": "/IBSCBS/",
}

SETTERS = {
    "SetarCampoValorTamanhoObrigatorio": (0, 1, True),
    "SetarCampoValorTamanho": (0, 1, True),
    "SetarCampoValorCurrency": (0, 1, False),
    "SetarCampoValor": (0, 1, True),
    "SetarCampoTamanhoMinimo": (1, None, False),
}


def texto(valor):
    if valor is None:
        return ""
    conteudo = str(valor).replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    return "\n".join(linha.rstrip() for linha in conteudo.split("\n")).strip()


def vazio(valor):
    return texto(valor) in ("", "-")


def grade_com_mesclagens(aba):
    grade = [[celula.value for celula in linha] for linha in aba.iter_rows()]
    for faixa in aba.merged_cells.ranges:
        origem = grade[faixa.min_row - 1][faixa.min_col - 1]
        for linha in range(faixa.min_row - 1, faixa.max_row):
            for coluna in range(faixa.min_col - 1, faixa.max_col):
                if linha < len(grade) and coluna < len(grade[linha]):
                    grade[linha][coluna] = origem
    return grade


def caminho_normalizado(caminho):
    limpo = texto(caminho).replace(" ", "")
    if limpo and not limpo.endswith("/"):
        limpo += "/"
    return limpo


def titulo_da_descricao(descricao):
    corrido = re.sub(r"\s+", " ", descricao).strip()
    if ":" in corrido:
        corrido = corrido.split(":", 1)[0]
    else:
        sentenca = re.match(r"(.+?\.)(\s|$)", corrido)
        if sentenca:
            corrido = sentenca.group(1)
    corrido = corrido.strip().rstrip(" .;")
    return corrido if len(corrido) <= 120 else corrido[:117].rstrip() + "…"


def ler_leiaute(pasta_anexos):
    livro = openpyxl.load_workbook(pasta_anexos / ANEXO_VI, data_only=True)
    grade = grade_com_mesclagens(livro["LEIAUTE DPS_NFS-e - RT"])
    entradas = []
    for linha in grade[1:]:
        campo = texto(linha[2])
        if not campo or campo == "-":
            continue
        descricao = texto(linha[7])
        entradas.append({
            "id": texto(linha[0]),
            "tag": campo,
            "caminho": caminho_normalizado(linha[1]),
            "elemento": texto(linha[3]),
            "tipo": texto(linha[4]),
            "ocorrencia": texto(linha[5]),
            "tamanho": texto(linha[6]),
            "titulo": campo if vazio(descricao) else titulo_da_descricao(descricao),
            "descricao": "" if vazio(descricao) else descricao,
            "notas": "" if vazio(linha[8]) else texto(linha[8]),
            "regras": [],
        })
    return entradas


def ler_regras(pasta_anexos):
    livro = openpyxl.load_workbook(pasta_anexos / ANEXO_VI, data_only=True)
    grade = grade_com_mesclagens(livro["RN DPS_NFS-e"])
    regras = {}
    caminho_atual = campo_atual = ""
    for linha in grade[3:]:
        if not vazio(linha[1]) or not vazio(linha[2]):
            caminho_atual = caminho_normalizado(linha[1])
            campo_atual = texto(linha[2])
        regra = texto(linha[3])
        if vazio(regra) or not campo_atual:
            continue
        registro = {
            "codigo": "" if vazio(linha[7]) else texto(linha[7]),
            "regra": regra,
            "mensagem": "" if vazio(linha[8]) else texto(linha[8]),
            "aplicacao": "" if vazio(linha[5]) else texto(linha[5]),
            "efeito": "" if vazio(linha[6]) else texto(linha[6]),
            "nivel": "" if vazio(linha[9]) else texto(linha[9]),
            "observacao": "" if len(linha) < 15 or vazio(linha[14]) else texto(linha[14]),
        }
        lista = regras.setdefault(caminho_atual + campo_atual, [])
        if registro not in lista:
            lista.append(registro)
    return regras


def aproximar_caminho(chave, entradas):
    tag = chave.rstrip("/").rsplit("/", 1)[-1]
    candidatos = sorted(
        ((difflib.SequenceMatcher(None, chave, e["caminho"] + e["tag"]).ratio(), indice)
         for indice, e in enumerate(entradas) if e["tag"] == tag),
        reverse=True,
    )
    if not candidatos or candidatos[0][0] < 0.75:
        return None
    if len(candidatos) > 1 and candidatos[0][0] - candidatos[1][0] < 0.05:
        return None
    return entradas[candidatos[0][1]]


def ler_mapeamento(arquivo):
    campos = {}
    secao = ""
    for linha in arquivo.read_text(encoding="latin-1").splitlines():
        limpa = linha.strip()
        if limpa.startswith("["):
            secao = limpa.strip("[]")
            continue
        if secao != "DPS" or not limpa or limpa.startswith(";") or "=" not in limpa:
            continue
        chave, caminho = limpa.split("=", 1)
        partes = caminho.strip().replace("@", "").split("/")
        campos[chave.strip()] = PREFIXO_NFSE + "/".join(partes[:-1]) + "/" + partes[-1]
    return campos


def sem_comentarios(linha):
    resultado = []
    em_texto = False
    posicao = 0
    while posicao < len(linha):
        caractere = linha[posicao]
        if caractere == "'":
            em_texto = not em_texto
        elif not em_texto and linha.startswith("//", posicao):
            break
        resultado.append(caractere)
        posicao += 1
    return "".join(resultado)


def argumentos_da_chamada(conteudo, inicio):
    nivel = 0
    em_texto = False
    atual = []
    argumentos = []
    for posicao in range(inicio, len(conteudo)):
        caractere = conteudo[posicao]
        if caractere == "'":
            em_texto = not em_texto
        if not em_texto:
            if caractere == "(":
                nivel += 1
                if nivel == 1:
                    continue
            elif caractere == ")":
                nivel -= 1
                if nivel == 0:
                    argumentos.append("".join(atual).strip())
                    return argumentos
            elif caractere == "," and nivel == 1:
                argumentos.append("".join(atual).strip())
                atual = []
                continue
        atual.append(caractere)
    return argumentos


def campos_tx2(expressao):
    return re.findall(r"CampoTecno\w*\('(\w+)'\)", expressao)


def ler_script(arquivo):
    linhas = [sem_comentarios(linha) for linha in arquivo.read_text(encoding="latin-1").splitlines()]
    conteudo = "\n".join(linhas)
    sem_textos = re.sub(r"'[^']*'", lambda achado: " " * len(achado.group(0)), conteudo)
    inicio_linha = [0]
    for linha in linhas:
        inicio_linha.append(inicio_linha[-1] + len(linha) + 1)

    def numero_da_linha(posicao):
        baixo, alto = 0, len(inicio_linha) - 1
        while baixo < alto:
            meio = (baixo + alto + 1) // 2
            if inicio_linha[meio] <= posicao:
                baixo = meio
            else:
                alto = meio - 1
        return baixo + 1

    marcas = []
    pilha = []
    fim_do_bloco = {}
    for achado in re.finditer(r"\b(begin|case|try|end)\b", sem_textos, flags=re.IGNORECASE):
        palavra = achado.group(1).lower()
        if palavra == "end":
            if pilha:
                fim_do_bloco[pilha.pop()[1]] = achado.end()
        else:
            pilha.append((palavra, achado.start()))
        marcas.append((achado.start(), tuple(pilha)))

    def pilha_em(posicao):
        baixo, alto, resposta = 0, len(marcas) - 1, ()
        while baixo <= alto:
            meio = (baixo + alto) // 2
            if marcas[meio][0] < posicao:
                resposta = marcas[meio][1]
                baixo = meio + 1
            else:
                alto = meio - 1
        return resposta

    def alcanca(posicao_atribuicao, posicao_uso):
        origem = pilha_em(posicao_atribuicao)
        destino = pilha_em(posicao_uso)
        comum = 0
        while comum < min(len(origem), len(destino)) and origem[comum] == destino[comum]:
            comum += 1
        if comum == len(origem) or comum >= len(destino):
            return True
        if comum > 0 and origem[comum - 1][0] == "case":
            return False
        bloco_origem, bloco_destino = origem[comum], destino[comum]
        if bloco_origem[0] == "begin" and bloco_destino[0] == "begin":
            fim = fim_do_bloco.get(bloco_origem[1])
            if fim is not None and re.fullmatch(r"\s*;?\s*else\s*", sem_textos[fim:bloco_destino[1]]):
                return False
        return True

    def envolve(posicao_atribuicao, posicao_uso):
        origem = pilha_em(posicao_atribuicao)
        return pilha_em(posicao_uso)[:len(origem)] == origem

    def guarda(posicao):
        numero = numero_da_linha(posicao)
        antes = sem_textos[inicio_linha[numero - 1]:posicao]
        anterior = ""
        for indice in range(numero - 2, max(numero - 6, -1), -1):
            if linhas[indice].strip():
                anterior = linhas[indice]
                break
        mesma_linha = re.search(r"\bif\b(.*)\bthen\b", antes)
        if mesma_linha:
            return mesma_linha.group(1)
        if re.search(r"\belse\b", antes) or re.match(r"\s*[\d', ]+:(?!=)", antes):
            return ""
        linha_anterior = re.search(r"\bif\b(.*)\bthen\s*$", anterior)
        if linha_anterior:
            return linha_anterior.group(1)
        if re.search(r"\belse\s*$", anterior) or re.match(r"\s*[\d', ]+:\s*$", anterior):
            return ""
        return None

    atribuicoes = [
        (achado.start(), achado.group(1), achado.end())
        for achado in re.finditer(r"\b(\w+)\s*:=\s*(?:(?!\belse\b|\bend\b)[^;])*", sem_textos, flags=re.IGNORECASE)
    ]

    def campos_do_trecho(trecho, posicao):
        campos = campos_tx2(trecho)
        for variavel in re.findall(r"CampoTecno\w*\(\s*(_\w+)\s*\)", trecho):
            anteriores = [item for item in atribuicoes if item[1] == variavel and item[0] < posicao]
            if anteriores:
                literal = re.search(r":=\s*'(\w+)'", conteudo[anteriores[-1][0]:anteriores[-1][2]])
                if literal:
                    campos.append(literal.group(1))
        return campos

    def origem_da_variavel(variavel, antes_de, profundidade=0):
        alcancam = [
            item for item in atribuicoes
            if item[1] == variavel and item[0] < antes_de and alcanca(item[0], antes_de)
        ]
        dominante = None
        for indice in range(len(alcancam) - 1, -1, -1):
            atual = alcancam[indice]
            if not envolve(atual[0], antes_de):
                continue
            if guarda(atual[0]) is None:
                dominante = indice
                break
            if indice > 0:
                anterior = alcancam[indice - 1]
                entre = sem_textos[anterior[2]:atual[0]]
                if (re.fullmatch(r"\s*;?\s*else\s*", entre) and envolve(anterior[0], antes_de)
                        and guarda(anterior[0])):
                    dominante = indice - 1
                    break
        escolhidas = alcancam[dominante:] if dominante is not None else alcancam

        campos = []
        for inicio, _, fim in escolhidas:
            trecho = conteudo[inicio:fim]
            campos.extend(campos_do_trecho(trecho, inicio))
            condicao = guarda(inicio)
            if condicao:
                campos.extend(campos_tx2(condicao))
            if condicao is not None or profundidade >= 3:
                continue
            citadas = set(re.findall(r"\b(_\w+|v[A-Z]\w*)\b", trecho.split(":=", 1)[-1]))
            for outra in sorted(citadas - {variavel}):
                if re.search(rf"CampoTecno\w*\(\s*{re.escape(outra)}\s*\)", trecho):
                    continue
                campos.extend(origem_da_variavel(outra, inicio, profundidade + 1))
        return list(dict.fromkeys(campos))

    def cabecalho_envolvente(posicao):
        numero = numero_da_linha(posicao)
        recuo = len(linhas[numero - 1]) - len(linhas[numero - 1].lstrip())
        for anterior in range(numero - 1, max(numero - 40, 0), -1):
            linha = linhas[anterior - 1]
            if not linha.strip():
                continue
            recuo_anterior = len(linha) - len(linha.lstrip())
            if recuo_anterior >= recuo:
                continue
            trecho = "\n".join(linhas[anterior - 1:numero - 1]) if re.match(r"\s*(else\s+)?(if|case)\b", linha) else linha
            achado = re.search(r"\b(if|case)\b(.*?)\b(then|of)\b", trecho, flags=re.DOTALL)
            if achado:
                return achado.group(2), inicio_linha[anterior - 1]
            if not re.match(r"\s*(begin|end|else|[\d, ]+:)", linha):
                return "", 0
            recuo = recuo_anterior
        return "", 0

    padrao_setter = re.compile(r"\b(" + "|".join(sorted(SETTERS, key=len, reverse=True)) + r")\s*\(")
    resultado = {}
    for achado in padrao_setter.finditer(conteudo):
        funcao = achado.group(1)
        argumentos = argumentos_da_chamada(conteudo, achado.end() - 1)
        posicao_campo, posicao_valor, copia_simples = SETTERS[funcao]
        if len(argumentos) <= posicao_campo:
            continue
        nome = re.match(r"'(\w+)'", argumentos[posicao_campo])
        if not nome:
            continue
        fontes = []
        valor = argumentos[posicao_valor] if posicao_valor is not None and len(argumentos) > posicao_valor else ""
        if funcao == "SetarCampoTamanhoMinimo":
            tx2 = re.match(r"'(\w+)'", argumentos[0])
            if tx2:
                fontes.append(("direto", tx2.group(1), False))
        else:
            puro = bool(re.fullmatch(r"CampoTecno\('\w+'\)", valor)) and copia_simples
            fontes.extend(("direto", campo, puro) for campo in campos_tx2(valor))
            for variavel in re.findall(r"\b(_\w+|v[A-Z]\w*)\b", valor):
                fontes.extend(("calculado", campo, False) for campo in origem_da_variavel(variavel, achado.start()))
            if not fontes:
                condicao, posicao_condicao = cabecalho_envolvente(achado.start())
                fontes.extend(("condicao", campo, False) for campo in campos_tx2(condicao))
                for variavel in re.findall(r"\b(_\w+|v[A-Z]\w*)\b", condicao):
                    fontes.extend(("condicao", campo, False) for campo in origem_da_variavel(variavel, posicao_condicao))

        registro = resultado.setdefault(nome.group(1), {"linhas": [], "fontes": {}})
        registro["linhas"].append(numero_da_linha(achado.start()))
        for uso, campo, puro in fontes:
            anterior = registro["fontes"].get(campo)
            if anterior is None:
                registro["fontes"][campo] = {"uso": uso, "copiaDireta": puro}
            else:
                anterior["copiaDireta"] = anterior["copiaDireta"] and puro
    return resultado


def ler_parametros_do_servico(pasta_lib):
    arquivo = pasta_lib / "servico" / "getServicoProps.js"
    parametros = {}
    if not arquivo.exists():
        return parametros
    for funcao, argumento in re.findall(r"\b(get\w+Props)\(\s*([\w.?]+)", arquivo.read_text(encoding="utf-8")):
        partes = argumento.replace("?", "").split(".")
        if partes[0] == "servico":
            parametros[funcao] = "servico[]" + ("." + ".".join(partes[1:]) if len(partes) > 1 else "")
    return parametros


def pares_maiusculos(conteudo):
    pares = []
    for achado in re.finditer(r"(?:^|[{,\s])([A-Z][A-Za-z0-9_]*)\s*:", conteudo):
        posicao = achado.end()
        nivel = 0
        em_texto = None
        expressao = []
        while posicao < len(conteudo):
            caractere = conteudo[posicao]
            if em_texto:
                if caractere == em_texto and conteudo[posicao - 1] != "\\":
                    em_texto = None
            elif caractere in "'\"`":
                em_texto = caractere
            elif caractere in "([{":
                nivel += 1
            elif caractere in ")]}":
                if nivel == 0:
                    break
                nivel -= 1
            elif caractere == "," and nivel == 0:
                break
            expressao.append(caractere)
            posicao += 1
        limpa = re.sub(r"\s+", " ", re.sub(r"//[^\n]*", "", "".join(expressao))).strip()
        if limpa:
            pares.append((achado.group(1), limpa))
    return pares


def caminhos_da_expressao(expressao, variaveis):
    encontrados = []
    for achado in re.finditer(r"\b([a-zA-Z_]\w*)((?:\??\.[A-Za-z_]\w*)+)", expressao):
        base = variaveis.get(achado.group(1))
        if not base:
            continue
        sufixo = achado.group(2).replace("?.", ".")
        encontrados.extend(caminho + sufixo for caminho in base)
    solto = re.fullmatch(r"\s*([a-zA-Z_]\w*)\s*", expressao)
    if solto and solto.group(1) in variaveis:
        encontrados.extend(variaveis[solto.group(1)])
    return list(dict.fromkeys(encontrados))


def campos_lidos_pela_lib(pasta_lib):
    parametros_servico = ler_parametros_do_servico(pasta_lib)
    resultado = {}

    for arquivo in sorted(pasta_lib.rglob("*.js")):
        if arquivo.name == "index.js":
            continue
        conteudo = arquivo.read_text(encoding="utf-8")
        conteudo = re.sub(r"/\*.*?\*/", "", conteudo, flags=re.DOTALL)
        conteudo = re.sub(r"(^|[^:])//[^\n]*", r"\1", conteudo)
        funcao = arquivo.stem
        assinatura = re.search(rf"const\s+{funcao}\s*=\s*\(?\s*([a-zA-Z_]\w*)", conteudo)
        variaveis = {}
        if assinatura:
            parametro = assinatura.group(1)
            if funcao in parametros_servico:
                variaveis[parametro] = [parametros_servico[funcao]]
            elif parametro in RAIZES_DA_LIB:
                variaveis[parametro] = [RAIZES_DA_LIB[parametro]]

        for _ in range(3):
            for nomes, expressao in re.findall(r"const\s*\{([^}]+)\}\s*=\s*([^\n]+)", conteudo):
                bases = caminhos_da_expressao(expressao.split("||")[0], variaveis)
                for nome in [parte.strip() for parte in nomes.split(",") if parte.strip()]:
                    if bases:
                        variaveis[nome] = [base + "." + nome for base in bases]
            for nome, expressao in re.findall(r"const\s+([a-zA-Z_]\w*)\s*=\s*([^\n]+)", conteudo):
                if nome in variaveis or "=>" in expressao:
                    continue
                if "?" in expressao and ":" in expressao:
                    bases = []
                    for alternativa in re.split(r"\?|:", expressao)[1:]:
                        bases.extend(caminhos_da_expressao(alternativa.strip(), variaveis))
                else:
                    bases = caminhos_da_expressao(expressao, variaveis)
                if bases:
                    variaveis[nome] = bases
            for base, iterador in re.findall(r"([a-zA-Z_][\w?.]*)\s*\??\.\s*map\(\s*\(?\s*(\w+)", conteudo):
                partes = base.replace("?", "").rstrip(".").split(".")
                origem = variaveis.get(partes[0])
                if origem:
                    variaveis[iterador] = [
                        caminho + ("." + ".".join(partes[1:]) if len(partes) > 1 else "") + "[]"
                        for caminho in origem
                    ]

        for campo, expressao in pares_maiusculos(conteudo):
            resultado.setdefault(campo, set()).update(caminhos_da_expressao(expressao, variaveis))
    return {caminho for caminhos in resultado.values() for caminho in caminhos}


def gerar_de_para(pasta_anexos, fontes):
    entradas = ler_leiaute(pasta_anexos)
    regras = ler_regras(pasta_anexos)
    por_chave = {e["caminho"] + e["tag"]: e for e in entradas}
    aproximadas = []
    sem_tag = []

    for chave, lista in regras.items():
        alvo = por_chave.get(chave)
        aproximado = alvo is None
        if alvo is None:
            alvo = aproximar_caminho(chave, entradas)
        if alvo is None:
            sem_tag.append(chave)
            continue
        if aproximado:
            aproximadas.append(f"{chave} -> {alvo['caminho']}{alvo['tag']}")
        for regra in lista:
            registro = dict(regra)
            if aproximado:
                registro["caminhoNaAbaDeRegras"] = chave
            alvo["regras"].append(registro)

    relatorio = {"regrasSemTag": sorted(sem_tag), "regrasPorAproximacaoDeCaminho": sorted(aproximadas)}
    relatorio["leiauteAnteriorSemEquivalente"] = marcar_leiaute_anterior(entradas, pasta_anexos)
    if not fontes.get("lib"):
        return entradas, relatorio, {}

    documentacao = ler_documentacao(fontes["api"]) if fontes.get("api") else {"versao": "", "campos": {}}
    lidos = {c for c in campos_lidos_pela_lib(fontes["lib"]) if not re.search(r"\.(map|length|padStart|toString|trim)$", c)}
    conhecidos = lidos | set(documentacao["campos"])
    extras = sorted(c for c in lidos - set(documentacao["campos"])
                    if not any(outro.startswith((c + ".", c + "[")) for outro in conhecidos))
    sondagem = sondar(fontes["lib"], documentacao["campos"], extras)
    getrps = ler_getrps(fontes["rps"]) if fontes.get("rps") else {}
    canonizar = canonizador(entradas)
    componente, relatorio_componente = ({}, {})
    if fontes.get("script") and fontes.get("mapeamento"):
        componente, relatorio_componente = ler_componente(fontes["script"], fontes["mapeamento"], canonizar)

    propostas, getrps_por_tag = propor(entradas, componente, sondagem, getrps, documentacao)
    publicaveis = set(documentacao["campos"]) | set(extras) | {c for g in getrps.values() for c in g["json"]}
    conferencia_notas = obter_conferencia(fontes, sondagem, propostas, publicaveis, canonizar)

    contexto = {
        "sondagem": sondagem, "documentacao": documentacao, "propostas": propostas,
        "getrps_por_tag": getrps_por_tag, "componente": componente,
        "conferencia": conferencia_notas.get("tags", {}),
        "caminhosNoXml": conferencia_notas.get("caminhosAproximados", {}),
    }
    chaves_usadas = set()
    for entrada in entradas:
        chave = entrada["caminho"] + entrada["tag"]
        if "/DPS/" not in chave or entrada["elemento"] in ("G", "CG", "Raiz"):
            continue
        entrada["plugnotas"] = decidir(entrada, chave, contexto)
        chaves_usadas.update(o["chave"] for o in entrada["plugnotas"].get("origens", []) if o["fonte"] == "lib")
    manter_copia_direta_so_com_tag_unica(entradas)

    relatorio["cobertura"] = cobertura(entradas)
    relatorio["conferencia"] = {
        campo: conferencia_notas[campo]
        for campo in ("pares", "leiaute", "errosDaLib", "caminhosSemTag", "caminhosAproximados", "geradoEm")
        if campo in conferencia_notas
    }
    relatorio["lib"] = {
        "chavesSemTag": sorted(set(sondagem) - chaves_usadas),
        "camposLidosForaDaDocumentacao": extras if documentacao["campos"] else [],
    }
    relatorio["componente"] = relatorio_componente
    return entradas, relatorio, {"documentacao": documentacao, "conferencia": conferencia_notas}


def equivalente_na_nt009(caminho, minusculas):
    for origem, destino, item in EQUIVALENCIAS_DA_NT009:
        if caminho.lower() == origem.lower() or (origem.endswith("/") and caminho.lower().startswith(origem.lower())):
            alvo = minusculas.get((destino + caminho[len(origem):]).lower())
            if alvo:
                return alvo, item
    return None, None


def manter_copia_direta_so_com_tag_unica(entradas):
    uso = {}
    for entrada in entradas:
        for campo in entrada.get("plugnotas", {}).get("jsonCopiaDireta", []):
            uso[campo] = uso.get(campo, 0) + 1
    for entrada in entradas:
        plugnotas = entrada.get("plugnotas")
        if plugnotas:
            plugnotas["jsonCopiaDireta"] = [campo for campo in plugnotas["jsonCopiaDireta"] if uso[campo] == 1]


def canonizador(entradas):
    minusculas = {(e["caminho"] + e["tag"]).lower(): e["caminho"] + e["tag"] for e in entradas}

    def canonizar(caminho):
        exata = minusculas.get(caminho.lower())
        if exata:
            return exata, False
        alvo, _ = equivalente_na_nt009(caminho, minusculas)
        return (alvo, True) if alvo else (None, False)

    return canonizar


def caminhos_do_leiaute(arquivo):
    livro = openpyxl.load_workbook(arquivo, data_only=True)
    aba = next(livro[nome] for nome in livro.sheetnames if nome.startswith("LEIAUTE DPS_NFS-e"))
    caminhos = []
    for linha in grade_com_mesclagens(aba)[1:]:
        campo = texto(linha[2])
        if campo and campo != "-":
            caminhos.append(caminho_normalizado(linha[1]) + campo)
    return caminhos


def marcar_leiaute_anterior(entradas, pasta_anexos):
    arquivo = pasta_anexos / ANEXO_VI_ANTERIOR
    if not arquivo.exists():
        return []
    minusculas = {(e["caminho"] + e["tag"]).lower(): e for e in entradas}
    chaves = {chave: entrada["caminho"] + entrada["tag"] for chave, entrada in minusculas.items()}
    sem_equivalente = []
    for caminho in caminhos_do_leiaute(arquivo):
        if caminho.lower() in minusculas:
            continue
        alvo, item = equivalente_na_nt009(caminho, chaves)
        if alvo:
            minusculas[alvo.lower()].setdefault("leiauteAnterior", []).append({"caminho": caminho, "fonte": f"NT 009, item {item}"})
        else:
            sem_equivalente.append(caminho)
    return sem_equivalente


def ler_componente(script, mapeamento, canonizar):
    campos_dataset = ler_mapeamento(mapeamento)
    setters = {nome.lower(): dados for nome, dados in ler_script(script).items()}
    por_tag, sem_tag, aproximados = {}, [], {}
    for dataset, caminho in campos_dataset.items():
        tag, aproximado = canonizar(caminho)
        if tag is None:
            sem_tag.append(dataset)
            continue
        registro = setters.get(dataset.lower(), {"linhas": [], "fontes": {}})
        item = por_tag.setdefault(tag, {"datasets": [], "tx2": [], "linhas": []})
        item["datasets"].append(dataset)
        item["linhas"] = sorted(set(item["linhas"]) | set(registro["linhas"]))
        item["tx2"].extend(campo for campo in registro["fontes"] if campo not in item["tx2"])
        if aproximado:
            item["caminhoNoComponente"] = caminho
            aproximados[caminho] = tag
    datasets_minusculos = {nome.lower() for nome in campos_dataset}
    return por_tag, {
        "mapeamentoSemTagNoLeiaute": sorted(sem_tag),
        "equivalenciasDaNt009": dict(sorted(aproximados.items())),
        "camposDatasetSemScript": sorted(n for n in campos_dataset if n.lower() not in setters),
        "nomesDoScriptForaDoMapping": sorted(n for n in setters if n not in datasets_minusculos),
    }


ABREVIACOES = (("codigo", "cod"), ("descricao", "desc"), ("numero", "num"), ("inscricao", "insc"))


def nome_para_ponte(nome):
    normalizado = nome.split(".")[-1].lower()
    for longa, curta in ABREVIACOES:
        normalizado = normalizado.replace(longa, curta)
    return normalizado


def propor(entradas, componente, sondagem, getrps, documentacao):
    lib_por_nome, getrps_por_nome = {}, {}
    for chave in sondagem:
        lib_por_nome.setdefault(nome_para_ponte(chave), []).append(chave)
    for dados in getrps.values():
        getrps_por_nome.setdefault(nome_para_ponte(dados["chave"]), []).append(dados)

    propostas, getrps_por_tag = {}, {}

    def propor_candidato(tag, candidato, motivo):
        propostas.setdefault(tag, {}).setdefault(candidato, set()).add(motivo)

    for tag, item in componente.items():
        for nome in map(nome_para_ponte, item["tx2"] + item["datasets"]):
            for chave in lib_por_nome.get(nome, []):
                propor_candidato(tag, f"lib:{chave}", "componente")
        for nome in map(nome_para_ponte, item["tx2"]):
            for dados in getrps_por_nome.get(nome, []):
                if dados not in getrps_por_tag.get(tag, []):
                    getrps_por_tag.setdefault(tag, []).append(dados)
                for caminho in dados["json"]:
                    propor_candidato(tag, f"json:{caminho}", "getRps")

    folhas_da_dps = [e for e in entradas if "/DPS/" in e["caminho"] + e["tag"] and e["elemento"] in ("E", "CE")]
    nomes = {e["tag"] for e in folhas_da_dps}
    for campo, info in documentacao["campos"].items():
        citadas = tags_citadas(info.get("descricao", ""), nomes)
        if len(citadas) > 2:
            continue
        prefixo = next((p for raiz, p in PREFIXOS_POR_RAIZ.items() if campo.startswith(raiz)), None)
        for nome in citadas:
            alvos = [e["caminho"] + e["tag"] for e in folhas_da_dps if e["tag"] == nome]
            if prefixo:
                alvos = [alvo for alvo in alvos if prefixo in alvo]
            if len(alvos) == 1:
                propor_candidato(alvos[0], f"json:{campo}", "documentacao")
    return propostas, getrps_por_tag


def obter_conferencia(fontes, sondagem, propostas, publicaveis, canonizar):
    if fontes.get("notas"):
        relatorio = conferir(
            ler_pares(fontes["notas"]), fontes["lib"], dependencias_da_sondagem(sondagem),
            {tag: set(candidatos) for tag, candidatos in propostas.items()}, publicaveis, canonizar)
        relatorio["geradoEm"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        RELATORIO_DA_CONFERENCIA.write_text(json.dumps(relatorio, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        return relatorio
    if RELATORIO_DA_CONFERENCIA.exists():
        return json.loads(RELATORIO_DA_CONFERENCIA.read_text(encoding="utf-8"))
    return {}


PALAVRAS_GENERICAS = {
    "tipo", "tipos", "codigo", "valor", "valores", "numero", "descricao", "grupo", "informacoes", "informacao",
    "dados", "para", "que", "dos", "das", "com", "sem", "pelo", "pela", "outros", "outras", "campo", "servico",
    "servicos", "prestado", "sobre", "nota", "nfse", "dps", "identificacao", "indicador",
}


def sem_acentos(texto_bruto):
    decomposto = unicodedata.normalize("NFD", texto_bruto)
    return "".join(c for c in decomposto if unicodedata.category(c) != "Mn")


def fichas(texto_bruto):
    partes = re.findall(r"[A-Z]+(?![a-z])|[A-Z]?[a-z]+", sem_acentos(texto_bruto))
    return {parte.lower() for parte in partes if len(parte) >= 3} - PALAVRAS_GENERICAS


def semelhanca(nome, entrada):
    alvo = fichas(entrada["tag"]) | fichas(entrada["titulo"])
    return sum(1 for ficha in fichas(nome) if any(ficha.startswith(outra) or outra.startswith(ficha) for outra in alvo))


def codigos_do_leiaute(entrada):
    return {str(int(numero)) for numero in re.findall(r"(?m)^\s*(\d{1,3})\s*[-–]\s*\S", entrada["descricao"])}


def saidas_das_tabelas(dados):
    saidas = set()
    for tabela in dados["tabelas"]:
        for valor in tabela["valores"].values():
            for item in valor if isinstance(valor, list) else [valor]:
                if item != "":
                    saidas.add(str(item))
    return saidas


def dentro_do_dominio(dados, codigos):
    saidas = saidas_das_tabelas(dados)
    if not codigos or not saidas:
        return True
    return all(saida.isdigit() and str(int(saida)) in codigos for saida in saidas)


def avaliacao(ligacoes, candidato):
    dados = ligacoes.get(candidato)
    return dados if dados and dados["ambos"] else None


def confirmada(dados):
    return dados is not None and dados["iguais"] == dados["ambos"]


def notas_da_avaliacao(dados):
    notas = {"comparadas": dados["ambos"], "iguais": dados["iguais"], "semTag": dados.get("semTag", 0)}
    if dados.get("semSinais"):
        notas["semSinais"] = dados["semSinais"]
    return notas


def dependencias(dados):
    return {o["json"] for o in dados["origens"]} | {t["json"] for t in dados["tabelas"]}


def nome_do_candidato(candidato, sondagem):
    tipo, nome = candidato.split(":", 1)
    return nome if tipo == "lib" else ".".join(nome.split(".")[-2:])


def escolher_descobertas(candidatos, ligacoes, entrada, sondagem):
    confirmados = [(c, ligacoes[c]) for c in candidatos if confirmada(avaliacao(ligacoes, c))]
    if not confirmados:
        return []
    nao_triviais = [(c, d) for c, d in confirmados if not d["trivial"]]
    if nao_triviais:
        maximo = max(d["ambos"] for _, d in nao_triviais)
        return [c for c, d in nao_triviais
                if d["ambos"] == maximo and (d["ambos"] >= 2 or semelhanca(nome_do_candidato(c, sondagem), entrada) >= 1)]
    pontuados = []
    for c, d in confirmados:
        pontos = semelhanca(nome_do_candidato(c, sondagem), entrada)
        if (d["ambos"] >= 3 and pontos >= 1) or pontos >= 2:
            pontuados.append((pontos, d["ambos"], c.startswith("lib:"), c))
    return [max(pontuados)[3]] if pontuados else []


def decidir(entrada, tag, contexto):
    sondagem = contexto["sondagem"]
    documentacao = contexto["documentacao"]
    propostas = contexto["propostas"].get(tag, {})
    registro_das_notas = contexto["conferencia"].get(tag, {})
    ligacoes = registro_das_notas.get("ligacoes", {})
    codigos = codigos_do_leiaute(entrada)
    item_componente = contexto["componente"].get(tag)

    def ligacao_de(candidato, padrao="componente"):
        if confirmada(avaliacao(ligacoes, candidato)):
            return "conferencia"
        motivos = propostas.get(candidato, set())
        if "documentacao" in motivos:
            return "documentacao"
        return "componente" if motivos else padrao

    def com_notas(origem, candidato):
        dados = ligacoes.get(candidato)
        if dados and (dados["ambos"] or dados.get("semTag")):
            origem["notas"] = notas_da_avaliacao(dados)
        return origem

    def origem_da_lib(chave, padrao="componente"):
        dados = sondagem[chave]
        origem = {"fonte": "lib", "chave": chave, "linha": dados["linha"], "campos": dados["origens"],
                  "tabelas": dados["tabelas"], "ligacao": ligacao_de(f"lib:{chave}", padrao)}
        if dados["exigeNumero"]:
            origem["exigeNumero"] = dados["exigeNumero"]
        return com_notas(origem, f"lib:{chave}")

    def origem_do_json(campos, fonte, extra=None, padrao="componente"):
        avaliados = [(ligacoes.get(f"json:{c}") or {}, c) for c in campos]
        melhor = max(avaliados, key=lambda par: (par[0].get("ambos", 0), par[0].get("semTag", 0)))[1]
        if documentacao["campos"] and fonte == "getRps":
            documentados = [c for c in campos if c in documentacao["campos"]]
            campos = documentados or campos
        origem = {"fonte": fonte, **(extra or {}), "campos": [{"json": c} for c in campos],
                  "ligacao": ligacao_de(f"json:{melhor}", padrao)}
        return com_notas(origem, f"json:{melhor}")

    confirmadas_das_propostas = [c for c in propostas if confirmada(avaliacao(ligacoes, c))]
    bloqueia_descoberta = any(c.startswith("lib:") or not ligacoes[c]["trivial"] for c in confirmadas_das_propostas)
    chaves = [c[4:] for c in propostas if c.startswith("lib:") and c[4:] in sondagem]
    campos_confirmados = {c[5:] for c in confirmadas_das_propostas if c.startswith("json:")}
    for candidato in ligacoes:
        if candidato.startswith("lib:") and candidato[4:] in sondagem and confirmada(avaliacao(ligacoes, candidato)):
            if dependencias(sondagem[candidato[4:]]) & campos_confirmados and dentro_do_dominio(sondagem[candidato[4:]], codigos):
                chaves.append(candidato[4:])

    descobertas_json = []
    if not bloqueia_descoberta:
        candidatos = [c for c in ligacoes if c not in propostas and (
            (c.startswith("lib:") and c[4:] in sondagem and dentro_do_dominio(sondagem[c[4:]], codigos)) or c.startswith("json:"))]
        escolhidos = escolher_descobertas(candidatos, ligacoes, entrada, sondagem)
        chaves += [c[4:] for c in escolhidos if c.startswith("lib:")]
        descobertas_json = [c[5:] for c in escolhidos if c.startswith("json:")]

    origens = [origem_da_lib(chave, "conferencia") for chave in dict.fromkeys(chaves)]
    if not origens and codigos:
        por_nome = sorted(
            (semelhanca(chave, entrada), chave) for chave, dados in sondagem.items()
            if dados["tabelas"] and dentro_do_dominio(dados, codigos) and semelhanca(chave, entrada) >= 2)
        if por_nome and (len(por_nome) == 1 or por_nome[-1][0] > por_nome[-2][0]):
            origens = [origem_da_lib(por_nome[-1][1], "nome")]

    secundarias = []
    for dados in contexto["getrps_por_tag"].get(tag, []):
        secundarias.append(origem_do_json(dados["json"], "getRps", {"chave": dados["chave"], "linha": dados["linha"], "marcas": dados["marcas"]}))
    documentados = [c[5:] for c in propostas if c.startswith("json:") and "documentacao" in propostas[c]]
    secundarias += [origem_do_json([c], "json", padrao="documentacao") for c in documentados]
    secundarias += [origem_do_json([c], "json", padrao="conferencia") for c in descobertas_json]

    apoio = []
    if origens:
        cobertos = set().union(*(dependencias(sondagem[o["chave"]]) for o in origens))
        apoio = [o for o in secundarias if not {c["json"] for c in o["campos"]} <= cobertos]
    else:
        origens = secundarias

    campos_json = sorted({c["json"] for o in origens for c in o["campos"]} | {t["json"] for o in origens for t in o.get("tabelas", [])})
    plugnotas = {
        "situacao": situacao(origens, registro_das_notas.get("presente", 0), item_componente),
        "json": campos_json,
        "jsonCopiaDireta": sorted({c["json"] for o in origens if o["fonte"] == "lib" for c in o["campos"] if c.get("modo") == "copia"}),
        "origens": origens,
    }
    caminho_no_xml = contexto["caminhosNoXml"].get(tag) or (item_componente or {}).get("caminhoNoComponente")
    if caminho_no_xml:
        plugnotas["caminhoNoXmlGerado"] = caminho_no_xml.replace(PREFIXO_NFSE, "")
    documentados_do_json = [campo_documentado(c, documentacao) for c in campos_json if c in documentacao["campos"]]
    if documentados_do_json:
        plugnotas["documentacao"] = documentados_do_json
    if apoio or item_componente:
        plugnotas["apoio"] = {"origens": apoio, **({"datasets": item_componente["datasets"], "tx2": item_componente["tx2"],
                                                    "linhasScript": item_componente["linhas"]} if item_componente else {})}
    if plugnotas["situacao"] == "camposPrefeitura":
        plugnotas["campoPrefeitura"] = item_componente["datasets"][0]
    inconsistencias = listar_inconsistencias(entrada, origens, apoio, documentacao, sondagem, codigos)
    if inconsistencias:
        plugnotas["inconsistencias"] = inconsistencias
    return plugnotas


def situacao(origens, presente_nas_notas, item_componente):
    if origens:
        return "preenchida"
    if presente_nas_notas or (item_componente and item_componente["linhas"]):
        return "semCampoJson"
    if item_componente:
        return "camposPrefeitura"
    return "semOrigem"


def campo_documentado(campo, documentacao):
    info = documentacao["campos"][campo]
    return {"campo": campo, **{chave: info[chave] for chave in ("tipo", "tamanho", "valores", "padrao") if chave in info}}


def texto_comparavel(conteudo):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", sem_acentos(conteudo).lower())).strip()


def campo_documentado_para(entrada, campo, documentacao):
    titulo = texto_comparavel(entrada["titulo"])
    pai = campo.rsplit(".", 1)[0]
    candidatos = [
        caminho for caminho, info in documentacao["campos"].items()
        if caminho != campo and caminho.rsplit(".", 1)[0] == pai and titulo
        and texto_comparavel(info.get("descricao", "").split("\n")[0]).startswith(titulo)
    ]
    return candidatos[0] if len(candidatos) == 1 else None


def descrever_origem(origem):
    if origem["fonte"] == "lib":
        return f"a chave {origem['chave']} da lib"
    campos = ", ".join(c["json"] for c in origem["campos"])
    return f"o campo {campos}" if origem["fonte"] == "json" else f"{campos} (getRps.js, {origem['chave']})"


def linhas_da_origem(origem):
    return [origem["linha"]] if origem.get("linha") else []


def listar_inconsistencias(entrada, origens, apoio, documentacao, sondagem, codigos):
    achados = []
    versao = f"Documentação da API {documentacao.get('versao', '')}".strip()
    for origem in origens:
        notas = origem.get("notas")
        if notas and notas["comparadas"] and notas["iguais"] < notas["comparadas"]:
            achados.append({"tipo": "divergenciaNasNotas",
                            "texto": f"Em {notas['comparadas'] - notas['iguais']} de {notas['comparadas']} notas conferidas, "
                                     f"o valor da tag no XML não bateu com {descrever_origem(origem)}.",
                            "fontes": ["Conferência de notas"] + linhas_da_origem(origem)})
        if documentacao["campos"] and origem["fonte"] in ("lib", "json", "getRps"):
            for campo in origem["campos"]:
                if campo["json"] not in documentacao["campos"]:
                    achado = {"tipo": "foraDaDocumentacao",
                              "texto": f"O campo {campo['json']} é lido pelo PlugNotas, mas não consta na documentação da API.",
                              "fontes": linhas_da_origem(origem) + [versao]}
                    documentado = campo_documentado_para(entrada, campo["json"], documentacao)
                    if documentado:
                        achado["texto"] += f" A documentação descreve {documentado} para esta informação."
                        achado["campoDocumentado"] = documentado
                        achado["campoLido"] = campo["json"]
                    achados.append(achado)
        if origem["fonte"] == "lib" and codigos:
            fora = sorted(s for s in saidas_das_tabelas(sondagem[origem["chave"]]) if not (s.isdigit() and str(int(s)) in codigos))
            if fora:
                achados.append({"tipo": "foraDoLeiaute",
                                "texto": f"A lib pode gravar {', '.join(fora)} nesta tag, e o anexo VI não lista esse código.",
                                "fontes": linhas_da_origem(origem) + ["Anexo VI"]})
        for campo in origem["campos"]:
            info = documentacao["campos"].get(campo["json"], {})
            valores = [v for v in info.get("valores", []) if v.isdigit()]
            if codigos and valores and origem["fonte"] != "lib":
                fora = [v for v in valores if str(int(v)) not in codigos]
                if fora:
                    achados.append({"tipo": "documentacaoForaDoLeiaute",
                                    "texto": f"A documentação da API aceita {', '.join(fora)} em {campo['json']}, e o anexo VI não lista esse código em {entrada['tag']}.",
                                    "fontes": [versao, "Anexo VI"]})
            tamanho_anexo = re.match(r"^(?:\d+-)?(\d+)$", entrada.get("tamanho", ""))
            if campo.get("modo") == "copia" and info.get("tamanho") and tamanho_anexo and info["tamanho"] > int(tamanho_anexo.group(1)):
                achados.append({"tipo": "tamanho",
                                "texto": f"A documentação da API aceita até {info['tamanho']} caracteres em {campo['json']}, e o anexo VI limita {entrada['tag']} a {tamanho_anexo.group(1)}.",
                                "fontes": [versao, "Anexo VI"]})
    principais = {c["json"] for o in origens for c in o["campos"]} | {t["json"] for o in origens for t in o.get("tabelas", [])}
    for origem in apoio:
        outros = sorted({c["json"] for c in origem["campos"]})
        if principais and not set(outros) & principais:
            quem = {"getRps": "o getRps.js", "json": "a documentação da API" if origem["ligacao"] == "documentacao" else "a conferência de notas"}[origem["fonte"]]
            achados.append({"tipo": "fontesDivergem",
                            "texto": f"A lib grava esta tag a partir de {', '.join(sorted(principais))}; {quem} indica {', '.join(outros)}.",
                            "fontes": [l for o in origens for l in linhas_da_origem(o)] + linhas_da_origem(origem)})
    return achados


def cobertura(entradas):
    contagem = {"tagsDoAnexo": len(entradas), "tagsDaNfse": 0, "gruposDaDps": 0, "folhasDaDps": 0}
    for entrada in entradas:
        chave = entrada["caminho"] + entrada["tag"]
        if "/DPS/" not in chave:
            contagem["tagsDaNfse"] += 1
        elif entrada["elemento"] in ("G", "CG", "Raiz"):
            contagem["gruposDaDps"] += 1
        else:
            contagem["folhasDaDps"] += 1
            plugnotas = entrada.get("plugnotas", {})
            situacao_da_tag = plugnotas.get("situacao", "semOrigem")
            contagem[situacao_da_tag] = contagem.get(situacao_da_tag, 0) + 1
            for origem in plugnotas.get("origens", [])[:1]:
                rotulo = f"ligacaoPor{origem['ligacao'][0].upper()}{origem['ligacao'][1:]}"
                contagem[rotulo] = contagem.get(rotulo, 0) + 1
            if plugnotas.get("inconsistencias"):
                contagem["comInconsistencia"] = contagem.get("comInconsistencia", 0) + 1
    return contagem


def ler_indop(pasta_anexos):
    livro = openpyxl.load_workbook(pasta_anexos / ANEXO_VII, data_only=True)
    grade = grade_com_mesclagens(livro["cIndOp Public"])
    indicadores = {}
    for linha in grade[1:]:
        codigo = texto(linha[0])
        if not codigo:
            continue
        indicadores[codigo.zfill(6)] = {
            "tipoOperacao": texto(linha[1]),
            "caracteristica": texto(linha[2]),
            "local": texto(linha[3]),
            "dispositivoLegal": texto(linha[4]),
            "observacao": texto(linha[5]),
            "indNFe": texto(linha[6]),
            "indNFSe": texto(linha[7]),
        }
    return indicadores, [texto(valor) for valor in grade[0]]


def ler_correlacao(pasta_anexos):
    livro = openpyxl.load_workbook(pasta_anexos / ANEXO_VIII, data_only=True)
    grade = grade_com_mesclagens(livro["tabela geral"])
    itens, nbs, classificacoes, locais, relacoes, divergencias = {}, {}, {}, [], [], []

    def registrar(dicionario, codigo, descricao, rotulo):
        if not codigo:
            return
        anterior = dicionario.get(codigo)
        if anterior is None:
            dicionario[codigo] = descricao
        elif descricao and anterior != descricao:
            divergencias.append(f"{rotulo} {codigo}: descrições diferentes na planilha")

    for linha in grade[1:]:
        item = texto(linha[0])
        codigo_nbs = texto(linha[2])
        if not item and not codigo_nbs:
            continue
        indop = texto(linha[6])
        indop = indop.split(".")[0].zfill(6) if indop else ""
        classificacao = texto(linha[8])
        classificacao = classificacao.zfill(6) if classificacao.isdigit() else classificacao
        local = texto(linha[7])
        if local and local not in locais:
            locais.append(local)
        registrar(itens, item, texto(linha[1]), "Item")
        registrar(nbs, codigo_nbs, texto(linha[3]), "NBS")
        registrar(classificacoes, classificacao, texto(linha[9]), "cClassTrib")
        relacao = [item, codigo_nbs, texto(linha[4]), texto(linha[5]), indop,
                   locais.index(local) if local else -1, classificacao]
        if relacao not in relacoes:
            relacoes.append(relacao)

    return {"itens": itens, "nbs": nbs, "cClassTrib": classificacoes,
            "locais": locais, "relacoes": relacoes}, divergencias


def ler_regra_inciso_x(pasta_anexos):
    livro = openpyxl.load_workbook(pasta_anexos / ANEXO_VIII, data_only=True)
    return [[texto(valor) for valor in linha] for linha in grade_com_mesclagens(livro["REGRA inc. X"])]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--anexos", required=True, type=Path)
    parser.add_argument("--api", type=Path)
    parser.add_argument("--lib", type=Path)
    parser.add_argument("--rps", type=Path)
    parser.add_argument("--script", type=Path)
    parser.add_argument("--mapeamento", type=Path)
    parser.add_argument("--notas", type=Path)
    parser.add_argument("--saida", default=Path("definicoes"), type=Path)
    argumentos = parser.parse_args()
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")

    fontes = {nome: getattr(argumentos, nome) for nome in ("api", "lib", "rps", "script", "mapeamento", "notas")}
    entradas, relatorio, complementos = gerar_de_para(argumentos.anexos, fontes)
    conferencia_notas = complementos.get("conferencia", {})
    de_para = {
        "versao": 3,
        "geradoEm": agora,
        "fontes": {
            "leiaute": ANEXO_VI,
            "leiauteAnterior": ANEXO_VI_ANTERIOR if (argumentos.anexos / ANEXO_VI_ANTERIOR).exists() else "",
            "notaTecnica": NOTA_TECNICA_009 if (argumentos.anexos / NOTA_TECNICA_009).exists() else "",
            "api": f"api.json {complementos.get('documentacao', {}).get('versao', '')}".strip() if argumentos.api else "",
            "lib": "buildTx2/padrao-NACIONAL/props" if argumentos.lib else "",
            "getRps": "buildTx2/getRps.js" if argumentos.rps else "",
            "script": "Scripts/Nacional/LoadEnvio.txt" if argumentos.script else "",
            "mapeamento": "Arquivos/Esquemas/Nacional/v1.01/Mapping.txt" if argumentos.mapeamento else "",
            "conferencia": {
                "pares": conferencia_notas.get("pares", 0),
                "data": conferencia_notas.get("geradoEm", "")[:10],
                "versaoDps": sorted(conferencia_notas.get("leiaute", {}).get("versaoDps", {})),
                "verAplic": sorted(conferencia_notas.get("leiaute", {}).get("verAplic", {})),
            } if conferencia_notas else {},
        },
        "entradas": entradas,
    }
    (argumentos.saida / "de-para-nacional.json").write_text(
        json.dumps(de_para, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    indicadores, cabecalho = ler_indop(argumentos.anexos)
    correlacao, divergencias = ler_correlacao(argumentos.anexos)
    ibscbs = {
        "versao": 1,
        "geradoEm": agora,
        "fontes": {"indOp": ANEXO_VII, "correlacao": ANEXO_VIII},
        "cabecalhoIndOp": cabecalho,
        "indOp": indicadores,
        **correlacao,
        "regraIncisoX": ler_regra_inciso_x(argumentos.anexos),
    }
    (argumentos.saida / "ibscbs.json").write_text(
        json.dumps(ibscbs, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    relatorio["ibscbsDivergencias"] = divergencias
    relatorio["indOpDaCorrelacaoAusentesNoAnexoVII"] = sorted(
        {r[4] for r in correlacao["relacoes"] if r[4] and r[4] not in indicadores})

    print(f"de-para: {len(entradas)} tags, {sum(len(e['regras']) for e in entradas)} regras de negócio")
    if relatorio.get("cobertura"):
        print("         " + ", ".join(f"{nome} {valor}" for nome, valor in relatorio["cobertura"].items()))
    print(f"ibscbs:  {len(indicadores)} indOp, {len(correlacao['itens'])} itens, {len(correlacao['nbs'])} NBS, "
          f"{len(correlacao['cClassTrib'])} cClassTrib, {len(correlacao['relacoes'])} relações")
    Path("ferramentas/relatorio-geracao.json").write_text(
        json.dumps(relatorio, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("relatório salvo em ferramentas/relatorio-geracao.json")


if __name__ == "__main__":
    main()
