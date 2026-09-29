"""Confere, na máquina de quem tem os insumos internos, que as fixtures de
testes/fixtures/gerador foram escritas do zero: nenhuma linha significativa
delas aparece nos insumos (inclusive dentro dos zips) e nenhum valor das notas
reais aparece nelas. Fica fora do npm test, porque os insumos não estão no
repositório. A saída cita só o arquivo e a linha da fixture, nunca o insumo.
Valores que já estão publicados no de-para, vindos da documentação pública e
dos anexos (como RTC007), não contam como valor de nota.

Uso:
  python testes/conferir_fixtures.py --insumos <pasta dos insumos>
"""
import argparse
import json
import sys
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FIXTURES = RAIZ / "testes" / "fixtures" / "gerador"
TAMANHO_MINIMO = 25
EXTENSOES_DE_TEXTO = (".js", ".txt", ".json", ".xml", ".ini", ".xsd", ".tx2", ".cjs")

sys.stdout.reconfigure(encoding="utf-8")


def normalizar(linha):
    return " ".join(linha.split())


def textos_dos_insumos(pasta):
    for arquivo in Path(pasta).rglob("*"):
        if arquivo.suffix.lower() == ".zip":
            with zipfile.ZipFile(arquivo) as pacote:
                for nome in pacote.namelist():
                    if nome.lower().endswith(EXTENSOES_DE_TEXTO):
                        yield pacote.read(nome).decode("utf-8", errors="ignore")
        elif arquivo.is_file() and arquivo.suffix.lower() in EXTENSOES_DE_TEXTO:
            yield arquivo.read_text(encoding="utf-8", errors="ignore")


def valores_das_notas(pasta):
    valores = set()

    def visitar(conteudo):
        if isinstance(conteudo, dict):
            for filho in conteudo.values():
                visitar(filho)
        elif isinstance(conteudo, list):
            for filho in conteudo:
                visitar(filho)
        elif isinstance(conteudo, str) and len(conteudo.strip()) >= 5:
            valores.add(conteudo.strip())

    for arquivo in Path(pasta).rglob("*.json"):
        try:
            visitar(json.loads(arquivo.read_text(encoding="utf-8-sig")))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
    return valores


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--insumos", required=True, type=Path)
    argumentos = parser.parse_args()

    linhas_das_fixtures = []
    for arquivo in sorted(FIXTURES.rglob("*")):
        if arquivo.is_file():
            for numero, linha in enumerate(arquivo.read_text(encoding="utf-8").splitlines(), 1):
                if len(normalizar(linha)) >= TAMANHO_MINIMO:
                    linhas_das_fixtures.append((arquivo.relative_to(RAIZ).as_posix(), numero, normalizar(linha)))

    copiadas = set()
    for texto in textos_dos_insumos(argumentos.insumos):
        conteudo = normalizar(texto)
        copiadas.update((arquivo, numero) for arquivo, numero, linha in linhas_das_fixtures if linha in conteudo)

    texto_das_fixtures = "\n".join(linha for _, _, linha in linhas_das_fixtures)
    publicado = (RAIZ / "definicoes" / "de-para-nacional.json").read_text(encoding="utf-8")
    valores_reais = sum(1 for valor in valores_das_notas(argumentos.insumos)
                        if valor in texto_das_fixtures and f'"{valor}"' not in publicado)

    print(f"linhas significativas nas fixtures: {len(linhas_das_fixtures)}")
    for arquivo, numero in sorted(copiadas):
        print(f"  FALHA linha igual a um insumo interno: {arquivo}:{numero}")
    print(f"  {'FALHA' if valores_reais else 'ok  '} valores das notas reais nas fixtures: {valores_reais}")
    falhou = bool(copiadas) or bool(valores_reais)
    print("\nFixtures escritas do zero." if not falhou else "\nHá fixtures com conteúdo dos insumos.")
    sys.exit(1 if falhou else 0)


if __name__ == "__main__":
    main()
