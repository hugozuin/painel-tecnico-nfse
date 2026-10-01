"""Lê a especificação pública da API do PlugNotas (o api.json que o
docs.plugnotas.com.br carrega) e achata o esquema de emissão do Nacional em
caminhos do JSON, com tipo, tamanho, valores aceitos, padrão e as tags do
XML que a própria descrição cita."""

import json
import re

ESQUEMA_NACIONAL = "dadosNfseNacional"
PROFUNDIDADE_MAXIMA = 12


def ler_documentacao(arquivo):
    especificacao = json.loads(arquivo.read_text(encoding="utf-8"))
    esquemas = especificacao["components"]["schemas"]

    def resolver(no):
        while "$ref" in no:
            alvo = especificacao
            for parte in no["$ref"].lstrip("#/").split("/"):
                alvo = alvo[parte.replace("~1", "/").replace("~0", "~")]
            no = alvo
        return no

    campos = {}

    def visitar(no, caminho, profundidade, vistos):
        if profundidade > PROFUNDIDADE_MAXIMA:
            return
        referencia = no.get("$ref")
        if referencia:
            if referencia in vistos:
                return
            vistos = vistos | {referencia}
        no = resolver(no)
        for combinacao in ("allOf", "oneOf", "anyOf"):
            for parte in no.get(combinacao, []):
                visitar(parte, caminho, profundidade + 1, vistos)
        if no.get("type") == "array" or "items" in no:
            visitar(no.get("items", {}), caminho + "[]", profundidade + 1, vistos)
            return
        propriedades = no.get("properties")
        if propriedades:
            for nome, filho in propriedades.items():
                visitar(filho, f"{caminho}.{nome}" if caminho else nome, profundidade + 1, vistos)
            return
        if caminho and caminho not in campos:
            campos[caminho] = descrever_campo(no)

    visitar(esquemas[ESQUEMA_NACIONAL], "", 0, frozenset())
    return {"versao": especificacao.get("info", {}).get("version", ""), "campos": campos}


def valores_da_descricao(descricao):
    valores = []
    for linha in descricao.splitlines():
        achado = re.match(r"^\s*[*-]\s*`?([0-9A-Za-z]{1,6})`?\s*[-–—]\s*\S", linha)
        if achado and achado.group(1) not in valores:
            valores.append(achado.group(1))
    return valores


def descrever_campo(no):
    descricao = no.get("description") or ""
    valores = [str(valor) for valor in no.get("enum") or []] or valores_da_descricao(descricao)
    campo = {"tipo": no.get("type") or ""}
    if no.get("maxLength") is not None:
        campo["tamanho"] = no["maxLength"]
    if valores:
        campo["valores"] = valores
    if no.get("default") is not None:
        campo["padrao"] = str(no["default"]).lower() if isinstance(no["default"], bool) else str(no["default"])
    campo["descricao"] = descricao
    return campo


def tags_citadas(descricao, tags):
    if not re.search(r"\bXML\b", descricao):
        return []
    return sorted(
        tag for tag in tags
        if re.search(rf"`{re.escape(tag)}`|(?<![A-Za-z0-9]){re.escape(tag)}\s+no\s+XML", descricao)
    )
