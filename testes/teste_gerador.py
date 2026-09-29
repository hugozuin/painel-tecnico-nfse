"""Testa as ferramentas do de-para com fixtures sintéticas de testes/fixtures/gerador,
escritas do zero para o teste (nenhum trecho de insumo interno). Requer Node."""
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FIXTURES = RAIZ / "testes" / "fixtures" / "gerador"
sys.path.insert(0, str(RAIZ / "ferramentas"))
sys.stdout.reconfigure(encoding="utf-8")

import gerar_definicoes as gerador
from conferir_notas import comparar, conferir, dependencias_da_sondagem, formas, ler_pares
from documentacao_api import ler_documentacao, tags_citadas, valores_da_descricao
from leitura_getrps import ler_getrps
from sondar_lib import sondar

falhas = 0


def conferir_caso(titulo, condicao, extra=""):
    global falhas
    print(f"  {'ok  ' if condicao else 'FALHA'} {titulo} {'' if condicao else extra}")
    if not condicao:
        falhas += 1


def origem(dados, campo):
    return next((o for o in dados["origens"] if o["json"] == campo), None)


def tabela(dados, campo):
    return next((t for t in dados["tabelas"] if t["json"] == campo), None)


print("\n== documentação da API ==")
documentacao = ler_documentacao(FIXTURES / "api.json")
campos = documentacao["campos"]
conferir_caso("versão da especificação", documentacao["versao"] == "9.9.9-teste")
conferir_caso("lista vira caminho com []", "servico[].retido.valor" in campos and "servico[].codigo" in campos)
conferir_caso("referência resolvida", "prestador.telefone.ddd" in campos)
conferir_caso("valores tirados da descrição", campos["prestador.regime"]["valores"] == ["1", "2"])
conferir_caso("valores do enum", campos["servico[].modo"]["valores"] == ["1", "2"])
conferir_caso("padrão booleano", campos["servico[].retido.ativo"]["padrao"] == "false")
conferir_caso("tag citada com no XML", tags_citadas(campos["servico[].codigo"]["descricao"], {"cTeste", "xNome"}) == ["cTeste"])
conferir_caso("sem citação quando não fala do XML", tags_citadas("Código do cTeste.", {"cTeste"}) == [])
conferir_caso("valores com traço longo", valores_da_descricao(" * `01` – Um\n * 2 - Dois") == ["01", "2"])

print("\n== sondagem das props ==")
sondagem = sondar(FIXTURES / "props", campos)
documento = sondagem["DocumentoPrestador"]
conferir_caso("cópia direta", origem(documento, "prestador.cpfCnpj")["modo"] == "copia")
contato = sondagem["ContatoPrestador"]
conferir_caso("concatenação de DDD e número",
              {o["json"] for o in contato["origens"] if o["modo"] == "concatenacao"} == {"prestador.telefone.ddd", "prestador.telefone.numero"})
regime = tabela(sondagem["RegimePrestador"], "prestador.regime")
conferir_caso("tabela de conversão", regime and regime["valores"]["1"] == "3" and regime["valores"]["2"] == "2" and regime["valores"]["ausente"] == "0", str(regime))
conferir_caso("arredondamento", origem(sondagem["ValorServico"], "servico[].valor.servico")["modo"] == "arredondamento")
data = origem(sondagem["DataServico"], "servico[].data")
conferir_caso("data com formato e fuso", data["modo"] == "data" and data["formato"] == "YYYY-MM-DD" and data["fuso"] == "-3", str(data))
imposto = sondagem["ValorImposto"]
proprio = origem(imposto, "servico[].proprio.valor")
retido = origem(imposto, "servico[].retido.valor")
conferir_caso("origem só no RTC007", {"tipo": "quando", "campo": "versaoEsquema", "valores": ["RTC007"]} in proprio["condicoes"])
conferir_caso("origem fora do RTC007", {"tipo": "exceto", "campo": "versaoEsquema", "valores": ["RTC007"]} in retido["condicoes"])
aliquota = origem(sondagem["AliquotaImposto"], "servico[].retido.aliquota")
conferir_caso("condição de valor acima de zero",
              any(c["campo"] == "servico[].retido.valor" and c["tipo"] == "exceto" and "0" in c["valores"] for c in aliquota["condicoes"]), str(aliquota))
retido_tabela = tabela(sondagem["Retido"], "servico[].retido.ativo")
conferir_caso("booleano em tabela", retido_tabela["valores"] == {"ausente": "1", "true": "2", "false": "1"}, str(retido_tabela))
soma = sondagem["SomaRetida"]
conferir_caso("soma de campos no RTC007",
              {o["json"] for o in soma["origens"] if o["modo"] == "soma"} == {"servico[].retido.a", "servico[].retido.b"}, str(soma))
conferir_caso("exige número", sondagem["ModoServico"]["exigeNumero"] == ["servico[].modo"])
conferir_caso("linha da chave", sondagem["ValorServico"]["linha"].startswith("servico.js:"))

print("\n== conferência de notas ==")
pares = ler_pares(FIXTURES / "notas")
conferir_caso("par escolhe a nota mais parecida com o XML", len(pares) == 1 and pares[0][0]["prestador"]["cpfCnpj"] == "DOCUMENTO-FICTICIO")
relatorio = conferir(pares, FIXTURES / "props", dependencias_da_sondagem(sondagem),
                     {"NFSe/infNFSe/DPS/infDPS/prest/regTrib/regEspTrib": {"lib:RegimePrestador"}})
tags = relatorio["tags"]
fone = tags["NFSe/infNFSe/DPS/infDPS/prest/fone"]["ligacoes"]
conferir_caso("concatenação confirmada pela lib", fone.get("lib:ContatoPrestador", {}).get("iguais") == 1, str(fone))
conferir_caso("valor numérico igual com casas diferentes",
              tags["NFSe/infNFSe/DPS/infDPS/valores/vServPrest/vServ"]["ligacoes"]["json:servico[].valor.servico"]["iguais"] == 1)
regime_notas = tags["NFSe/infNFSe/DPS/infDPS/prest/regTrib/regEspTrib"]["ligacoes"]["lib:RegimePrestador"]
conferir_caso("código curto proposto é avaliado e marcado como trivial", regime_notas["iguais"] == 1 and regime_notas["trivial"], str(regime_notas))
descricao = tags["NFSe/infNFSe/DPS/infDPS/serv/cServ/xDescServ"]["ligacoes"]["json:servico[].discriminacao"]
conferir_caso("texto igual sem sinais", descricao["iguais"] == 1 and descricao["semSinais"] == 1, str(descricao))
conferir_caso("versão e verAplic do XML", relatorio["leiaute"] == {"versaoDps": {"1.01": 1}, "verAplic": {"TESTE_1": 1}})
texto_do_relatorio = json.dumps(relatorio, ensure_ascii=False)
conferir_caso("relatório sem valores das notas", not any(valor in texto_do_relatorio for valor in ("DOCUMENTO-FICTICIO", "4439990000", "Linha um", "150.5")))
conferir_caso("formas: CNPJ com máscara", "d:12345678000100" in formas("12.345.678/0001-00"))
conferir_caso("comparar texto com sinais", comparar(["Olá, mundo"], ["Ola mundo"], set()) == "igualSemSinais")

print("\n== getRps.js ==")
getrps = ler_getrps(FIXTURES / "getRps.js")
conferir_caso("valor padrão com campo", getrps["numero"]["json"] == ["rps.numero"])
conferir_caso("ramo por padrão ignorado", getrps["valor"]["json"] == ["servico[].valor.bruto"], str(getrps["valor"]))
conferir_caso("primeiro serviço", "primeiroServico" in getrps["valor"]["marcas"])
conferir_caso("soma dos serviços por variável local", getrps["retido"]["json"] == ["servico[].retido.quantia"] and "soma" in getrps["retido"]["marcas"], str(getrps["retido"]))
conferir_caso("item de lista", getrps["lista[].codigoitem"]["json"] == ["servico[].itens[].codigo"], str(getrps.get("lista[].codigoitem")))
conferir_caso("valor fixo sem campo fica de fora", "semorigem" not in getrps)

print("\n== script e mapeamento do componente (apoio) ==")
setters = gerador.ler_script(FIXTURES / "LoadEnvio.txt")
conferir_caso("case em várias linhas liga o campo do TX2", "TipoTeste" in setters["CSTTeste"]["fontes"], str(setters["CSTTeste"]))
entradas_falsas = [
    {"caminho": "NFSe/infNFSe/DPS/infDPS/trib/", "tag": "CST"},
    {"caminho": "NFSe/infNFSe/DPS/infDPS/prest/", "tag": "xNome"},
    {"caminho": "NFSe/infNFSe/DPS/infDPS/", "tag": "finNFSe"},
]
componente, relatorio_componente = gerador.ler_componente(FIXTURES / "LoadEnvio.txt", FIXTURES / "Mapping.txt", gerador.canonizador(entradas_falsas))
conferir_caso("nome do dataset sem diferenciar maiúsculas", componente["NFSe/infNFSe/DPS/infDPS/trib/CST"]["tx2"] == ["TipoTeste"])
conferir_caso("caminho do leiaute anterior pela NT 009",
              componente["NFSe/infNFSe/DPS/infDPS/finNFSe"].get("caminhoNoComponente") == "NFSe/infNFSe/DPS/infDPS/IBSCBS/finNFSe")

print("\n== equivalência da NT 009 ==")
minusculas = {c.lower(): c for c in [
    "NFSe/infNFSe/DPS/infDPS/finNFSe",
    "NFSe/infNFSe/DPS/infDPS/valores/vAjusteBC/documentos/docAjusteBC/fornec/CNPJ",
    "NFSe/infNFSe/DPS/infDPS/valores/vAjusteBC/documentos/docAjusteBC/tpAjusteBC",
]}
conferir_caso("finNFSe", gerador.equivalente_na_nt009("NFSe/infNFSe/DPS/infDPS/IBSCBS/finNFSe", minusculas)[1] == "2.2")
conferir_caso("fornecedor da dedução",
              gerador.equivalente_na_nt009("NFSe/infNFSe/DPS/infDPS/valores/vDedRed/documentos/docDedRed/fornec/CNPJ", minusculas)
              == ("NFSe/infNFSe/DPS/infDPS/valores/vAjusteBC/documentos/docAjusteBC/fornec/CNPJ", "2.3"))
conferir_caso("tipo do reembolso vira tipo de ajuste",
              gerador.equivalente_na_nt009("NFSe/infNFSe/DPS/infDPS/IBSCBS/valores/gReeRepRes/documentos/tpReeRepRes", minusculas)[0]
              == "NFSe/infNFSe/DPS/infDPS/valores/vAjusteBC/documentos/docAjusteBC/tpAjusteBC")
conferir_caso("sem equivalente quando o destino não existe",
              gerador.equivalente_na_nt009("NFSe/infNFSe/DPS/infDPS/IBSCBS/imovel/end/endExt/cEndPost", minusculas) == (None, None))

print("\n== decisão da ligação ==")
tipo_retencao = {"tag": "tpRetISSQN", "titulo": "Tipo de retencao do ISSQN", "descricao": "1 - Não Retido;\n2 - Retido pelo Tomador;\n3 - Retido pelo Intermediario;"}
ambiente = {"tag": "tpAmb", "titulo": "Identificação do tipo de ambiente", "descricao": "1 - Produção;\n2 - Homologação;"}
conferir_caso("semelhança pelo nome", gerador.semelhanca("TipoRetIss", tipo_retencao) >= 2)
conferir_caso("palavra genérica não conta", gerador.semelhanca("TipoRetIss", ambiente) == 0)
conferir_caso("códigos da descrição", gerador.codigos_do_leiaute(tipo_retencao) == {"1", "2", "3"})
dominio_ok = {"tabelas": [{"json": "a", "valores": {"true": "2", "false": "1"}}]}
dominio_fora = {"tabelas": [{"json": "a", "valores": {"1": "4", "2": "1"}}]}
conferir_caso("saídas dentro do domínio", gerador.dentro_do_dominio(dominio_ok, {"1", "2", "3"}))
conferir_caso("saída fora do domínio", not gerador.dentro_do_dominio(dominio_fora, {"1", "2", "3"}))
ligacoes = {
    "lib:TipoRetIss": {"ambos": 11, "iguais": 11, "trivial": True},
    "lib:TipoTributacaoIss": {"ambos": 9, "iguais": 9, "trivial": True},
    "json:servico[].quantidade": {"ambos": 6, "iguais": 6, "trivial": True},
}
conferir_caso("código curto escolhido pelo nome", gerador.escolher_descobertas(list(ligacoes), ligacoes, tipo_retencao, {}) == ["lib:TipoRetIss"])
conferir_caso("código curto sem semelhança não liga", gerador.escolher_descobertas(list(ligacoes), ligacoes, ambiente, {}) == [])
cidades = {
    "json:cidadePrestacao.codigo": {"ambos": 8, "iguais": 8, "trivial": False},
    "lib:CodigoCidadeTomador": {"ambos": 6, "iguais": 6, "trivial": False},
}
conferir_caso("valor longo fica com quem aparece em mais notas",
              gerador.escolher_descobertas(list(cidades), cidades, {"tag": "cLocPrestacao", "titulo": "Local da prestação"}, {}) == ["json:cidadePrestacao.codigo"])

copias = [{"plugnotas": {"jsonCopiaDireta": ["prestador.cpfCnpj", "servico[].codigo"]}}, {"plugnotas": {"jsonCopiaDireta": ["prestador.cpfCnpj"]}}]
gerador.manter_copia_direta_so_com_tag_unica(copias)
conferir_caso("cópia direta só quando o campo alimenta uma única tag",
              copias[0]["plugnotas"]["jsonCopiaDireta"] == ["servico[].codigo"] and copias[1]["plugnotas"]["jsonCopiaDireta"] == [])

entradas, relatorio_geracao, _ = gerador.gerar_de_para(RAIZ / "fontes" / "nacional", {})
conferir_caso("sem lib, só o lado do Nacional", all("plugnotas" not in e for e in entradas))
conferir_caso("leiaute anterior marcado pela NT 009",
              any(item["fonte"] == "NT 009, item 2.2" for e in entradas for item in e.get("leiauteAnterior", [])))

print("\nTeste do gerador passou." if falhas == 0 else f"\n{falhas} teste(s) do gerador falharam.")
sys.exit(1 if falhas else 0)
