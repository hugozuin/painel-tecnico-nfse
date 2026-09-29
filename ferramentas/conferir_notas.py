"""Confere o de-para com notas do Nacional emitidas pelo PlugNotas: pares de
JSON de emissão e XML da DPS com o mesmo nome, numa pasta fora do
repositório. Para cada tag do XML, compara o valor com os campos do JSON e
com a saída da lib aplicada à mesma nota.

As notas são dados sensíveis: nada delas é gravado. O relatório guarda só
nomes de tag, nomes de campo documentados ou lidos pela lib, a versão da DPS,
o verAplic e contagens.

Uso isolado (o gerador também chama estas funções):
  python ferramentas/conferir_notas.py --notas <pasta> --lib <pasta props> --api <api.json>
"""

import argparse
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from documentacao_api import ler_documentacao
from sondar_lib import aplicar_lib

PREFIXO_DO_ANEXO = "NFSe/infNFSe/"


def nome_local(etiqueta):
    return etiqueta.rsplit("}", 1)[-1]


def folhas_do_xml(raiz):
    folhas = {}

    def visitar(elemento, caminho):
        atual = f"{caminho}/{nome_local(elemento.tag)}" if caminho else nome_local(elemento.tag)
        for atributo, valor in elemento.attrib.items():
            folhas.setdefault(f"{PREFIXO_DO_ANEXO}{atual}/{nome_local(atributo)}", []).append(valor)
        filhos = [filho for filho in elemento if nome_local(filho.tag) != "Signature"]
        if not filhos and (elemento.text or "").strip():
            folhas.setdefault(PREFIXO_DO_ANEXO + atual, []).append(elemento.text.strip())
        for filho in filhos:
            visitar(filho, atual)

    visitar(raiz, "")
    return folhas


def folhas_do_json(valor, caminho="", folhas=None):
    folhas = {} if folhas is None else folhas
    if isinstance(valor, dict):
        for chave, filho in valor.items():
            folhas_do_json(filho, f"{caminho}.{chave}" if caminho else chave, folhas)
    elif isinstance(valor, list):
        for filho in valor:
            folhas_do_json(filho, caminho + "[]", folhas)
    elif valor is not None and valor != "":
        folhas.setdefault(caminho, []).append(valor)
    return folhas


def formas(valor):
    if isinstance(valor, bool):
        return {str(valor).lower()}
    conteudo = re.sub(r"\s+", " ", str(valor)).strip()
    resultado = {"t:" + conteudo.casefold()}
    digitos = re.sub(r"\D", "", conteudo)
    if len(digitos) >= 5 and len(conteudo) - len(digitos) <= 4:
        resultado.add("d:" + digitos)
    try:
        resultado.add("n:" + str(Decimal(conteudo.replace(",", ".")).quantize(Decimal("0.01"))))
    except InvalidOperation:
        pass
    data = re.match(r"(\d{4}-\d{2}-\d{2})", conteudo)
    if data:
        resultado.add("a:" + data.group(1))
    return resultado


def sem_sinais(valor):
    conteudo = unicodedata.normalize("NFD", str(valor))
    return re.sub(r"[\W_]", "", "".join(c for c in conteudo if unicodedata.category(c) != "Mn")).casefold()


def comparar(valores, valores_xml, formas_xml):
    if any(formas(valor) & formas_xml for valor in valores):
        return "igual"
    textos_xml = {sem_sinais(v) for v in valores_xml if len(str(v)) >= 5}
    if textos_xml and any(len(str(v)) >= 5 and sem_sinais(v) in textos_xml for v in valores if not isinstance(v, (bool, int, float))):
        return "igualSemSinais"
    return "diferente"


def trivial(valor):
    conteudo = str(valor).strip()
    return isinstance(valor, bool) or len(conteudo) <= 2 or re.fullmatch(r"0+([.,]0+)?", conteudo) is not None


def ler_pares(pasta):
    arquivos = {}
    for arquivo in sorted(Path(pasta).iterdir()):
        if arquivo.suffix.lower() in (".json", ".xml"):
            arquivos.setdefault(arquivo.stem, {})[arquivo.suffix.lower()] = arquivo
    pares = []
    for nome, par in arquivos.items():
        if ".json" not in par or ".xml" not in par:
            continue
        documento = json.loads(par[".json"].read_text(encoding="utf-8-sig"))
        notas = documento if isinstance(documento, list) else [documento]
        xml = folhas_do_xml(ET.parse(par[".xml"]).getroot())
        formas_do_xml = {forma for valores in xml.values() for valor in valores for forma in formas(valor)}

        def semelhanca(nota):
            return sum(1 for valores in folhas_do_json(nota).values() for valor in valores if formas(valor) & formas_do_xml)

        pares.append((max(notas, key=semelhanca), xml))
    return pares


def com_endereco_do_prestador(nota):
    prestador = nota.get("prestador")
    if not isinstance(prestador, dict) or isinstance(prestador.get("endereco"), dict):
        return nota
    return {**nota, "prestador": {**prestador, "endereco": {}}}


def dependencias_da_sondagem(sondagem):
    return {
        chave: {origem["json"] for origem in dados["origens"]} | {tabela["json"] for tabela in dados["tabelas"]}
        for chave, dados in sondagem.items()
    }


def conferir(pares, pasta_props=None, dependencias=None, propostas=None, publicaveis=None, canonizar=None):
    dependencias = dependencias or {}
    canonizar = canonizar or (lambda caminho: (caminho, False))
    propostas = {tag: set(lista) for tag, lista in (propostas or {}).items()}
    saidas = aplicar_lib(pasta_props, [com_endereco_do_prestador(nota) for nota, _ in pares]) if pasta_props else [None] * len(pares)
    relatorio = {"pares": len(pares), "leiaute": {"versaoDps": {}, "verAplic": {}}, "errosDaLib": {},
                 "caminhosSemTag": [], "caminhosAproximados": {}, "tags": {}}
    candidatos = {}
    sem_tag = set()

    def anotar(tag, candidato, situacao, eh_trivial=False):
        registro = candidatos.setdefault(tag, {}).setdefault(
            candidato, {"ambos": 0, "iguais": 0, "semSinais": 0, "semTag": 0, "trivial": True})
        if situacao == "semTag":
            registro["semTag"] += 1
            return
        registro["ambos"] += 1
        registro["iguais"] += int(situacao in ("igual", "igualSemSinais"))
        registro["semSinais"] += int(situacao == "igualSemSinais")
        registro["trivial"] = registro["trivial"] and eh_trivial

    for (nota, xml_bruto), saida in zip(pares, saidas):
        xml = {}
        for caminho, valores in xml_bruto.items():
            tag, aproximado = canonizar(caminho)
            if tag is None:
                sem_tag.add(caminho)
                tag = caminho
            elif aproximado:
                relatorio["caminhosAproximados"][tag] = caminho
            xml.setdefault(tag, []).extend(valores)
        for chave, caminho in (("versaoDps", f"{PREFIXO_DO_ANEXO}DPS/versao"), ("verAplic", f"{PREFIXO_DO_ANEXO}DPS/infDPS/verAplic")):
            for valor in xml_bruto.get(caminho, []):
                relatorio["leiaute"][chave][valor] = relatorio["leiaute"][chave].get(valor, 0) + 1
        json_da_nota = folhas_do_json(nota)
        valores_da_lib = {} if saida is None else {
            chave: [valor for valor in valores if valor not in ("", None)] for chave, valores in saida["valores"].items()}
        for erro in [] if saida is None else saida["erros"]:
            relatorio["errosDaLib"][erro] = relatorio["errosDaLib"].get(erro, 0) + 1

        def presente(candidato):
            tipo, nome = candidato.split(":", 1)
            if tipo == "json":
                return nome in json_da_nota
            return bool(valores_da_lib.get(nome)) and bool(dependencias.get(nome, set()) & set(json_da_nota))

        for tag, valores_xml in xml.items():
            relatorio["tags"].setdefault(tag, {"presente": 0})["presente"] += 1
            formas_xml = set().union(*(formas(valor) for valor in valores_xml))
            eh_trivial = all(trivial(valor) for valor in valores_xml)
            fontes = [(f"json:{caminho}", valores) for caminho, valores in json_da_nota.items()
                      if publicaveis is None or caminho in publicaveis]
            fontes += [(f"lib:{chave}", valores) for chave, valores in valores_da_lib.items() if presente(f"lib:{chave}")]
            for candidato, valores in fontes:
                resultado = comparar(valores, valores_xml, formas_xml)
                if resultado != "diferente" or candidato in propostas.get(tag, ()):
                    anotar(tag, candidato, resultado, eh_trivial)
        for tag, lista in propostas.items():
            if tag not in xml:
                for candidato in lista:
                    if presente(candidato):
                        relatorio["tags"].setdefault(tag, {"presente": 0})
                        anotar(tag, candidato, "semTag")

    for tag, registro in relatorio["tags"].items():
        registro["ligacoes"] = dict(sorted(
            (candidato, dados) for candidato, dados in candidatos.get(tag, {}).items()
            if candidato in propostas.get(tag, ()) or (dados["ambos"] and dados["iguais"] == dados["ambos"])
        ))
    relatorio["tags"] = dict(sorted(relatorio["tags"].items()))
    relatorio["caminhosSemTag"] = sorted(sem_tag)
    return relatorio


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--notas", required=True, type=Path)
    parser.add_argument("--lib", type=Path)
    parser.add_argument("--api", type=Path)
    parser.add_argument("--saida", type=Path)
    argumentos = parser.parse_args()
    documentacao = ler_documentacao(argumentos.api) if argumentos.api else {"campos": {}}
    dependencias = {}
    if argumentos.lib:
        from sondar_lib import sondar
        dependencias = dependencias_da_sondagem(sondar(argumentos.lib, documentacao["campos"]))
    publicaveis = set(documentacao["campos"]) | {campo for campos in dependencias.values() for campo in campos}
    relatorio = conferir(ler_pares(argumentos.notas), argumentos.lib, dependencias, publicaveis=publicaveis)
    relatorio["geradoEm"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    texto = json.dumps(relatorio, ensure_ascii=False, indent=1) + "\n"
    if argumentos.saida:
        argumentos.saida.write_text(texto, encoding="utf-8")
    else:
        sys.stdout.write(texto)


if __name__ == "__main__":
    main()
