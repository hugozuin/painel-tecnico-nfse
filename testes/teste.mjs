import { readFileSync } from "node:fs";
import { analisarEmissao, derivarTipoRetencao, documentoValido, arredondar, truncar, resolverCaminho, significadoDoCodigo, CHAVES } from "../js/analise.js";
import { normalizarItem, normalizarIndOp, buscarItens, buscarIndOp, agruparRelacoes } from "../js/telas/ibscbs.js";
import { filtrarDePara, prepararItensDePara, grupoDoCaminho } from "../js/telas/depara.js";
import { ORIGEM_PLUGNOTAS } from "../js/plugnotas.js";

const ler = (nome) => JSON.parse(readFileSync(`./definicoes/${nome}.json`, "utf8"));
const dePara = ler("de-para-nacional");
const ibscbs = ler("ibscbs");
const regras = ler("regras-validacao");
const dados = { regras, dePara, ibscbs };
const porChave = new Map(dePara.entradas.map((e) => [e.caminho + e.tag, e]));
const tag = (nome, trecho = "") => dePara.entradas.find((e) => e.tag === nome && e.caminho.includes(trecho));

let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};
const tem = (lista, trecho) => lista.some((a) => `${a.titulo} ${a.detalhe}`.toLowerCase().includes(trecho.toLowerCase()));

console.log("\n== de-para: conteúdo do anexo VI ==");
conferir("430 tags", dePara.entradas.length === 430, String(dePara.entradas.length));
const tpRet = tag("tpRetISSQN");
conferir("título tirado da descrição", tpRet.titulo === "Tipo de retencao do ISSQN", tpRet.titulo);
const e0580 = tpRet.regras.find((r) => r.codigo === "E0580");
conferir("regra E0580 com o texto do anexo", e0580?.regra.startsWith("Não é permitido haver retenção do ISSQN (tpRetISSQN = 2 ou 3)"));
conferir("regras E0583 e E0588 presentes", ["E0583", "E0588"].every((c) => tpRet.regras.some((r) => r.codigo === c)));
conferir("E0595 de pAliq literal", tag("pAliq", "tribMun").regras.find((r) => r.codigo === "E0595")?.regra === "Não é permitido informar alíquota superior a 5%.");
conferir("descrição de vRetCSLL literal", tag("vRetCSLL").descricao === "Valor relativo às retenções das Contribuições Sociais (R$), de acordo com a indicação no campo tpRetPisCofins.");
conferir("nota de tpRetPisCofins cita 01/08/2026", tag("tpRetPisCofins").notas.includes("01/08/2026"));
conferir("significado do código 3", significadoDoCodigo(tag("tpRetPisCofins"), "3") === "3 - PIS/COFINS/CSLL Retidos", significadoDoCodigo(tag("tpRetPisCofins"), "3"));
conferir("regra associada por aproximação marcada", tag("nBM").regras.every((r) => r.caminhoNaAbaDeRegras));
conferir("todas as CHAVES existem no de-para", Object.values(CHAVES).every((c) => porChave.has(c)), Object.values(CHAVES).filter((c) => !porChave.has(c)).join(", "));
const tagsDasRegras = regras.regras.flatMap((r) => r.tags || []);
conferir("todas as tags das regras existem no de-para", tagsDasRegras.every((c) => porChave.has(c)), tagsDasRegras.filter((c) => !porChave.has(c)).join(", "));
conferir("toda regra declarativa cita a fonte", regras.regras.every((r) => r.fonte));

console.log("\n== de-para: ligação com o PlugNotas ==");
conferir("tpRetISSQN lê IssRetido no script", tpRet.plugnotas.tx2.some((t) => t.campo === "IssRetido"));
conferir("tpRetISSQN sem JSON confirmado", tpRet.plugnotas.json.length === 0);
conferir("cTribNac vem de servico[].codigo", tag("cTribNac").plugnotas.json.includes("servico[].codigo"));
conferir("CNPJ do tomador só de CpfCnpjTomador", JSON.stringify(tag("CNPJ", "/toma/").plugnotas.tx2.map((t) => t.campo)) === '["CpfCnpjTomador"]');
conferir("xDescServ com cópia direta", tag("xDescServ").plugnotas.jsonCopiaDireta.includes("servico[].discriminacao"));
conferir("intermediário sem JSON (raiz não confirmada)", tag("CNPJ", "/interm/").plugnotas.json.length === 0);

console.log("\n== IBS e CBS: anexos VII e VIII ==");
conferir("39 indOp", Object.keys(ibscbs.indOp).length === 39);
conferir("100301 com o tipo do anexo VII", ibscbs.indOp["100301"].tipoOperacao === "Demais serviços, em operações onerosas");
conferir("descrição do item 01.01", ibscbs.itens["01.01"] === "Análise E Desenvolvimento De Sistemas.");
const cct = (item, nbs) => new Set(ibscbs.relacoes.filter((r) => r[0] === item && r[1] === nbs).map((r) => r[6]));
conferir("NBS mesclado com três cClassTrib", [...cct("01.01", "1.1502.90.00")].sort().join() === "000001,200043,200044");
conferir("NBS simples com um cClassTrib", [...cct("01.01", "1.1502.10.00")].join() === "000001");
conferir("normalizar item", normalizarItem("0101") === "01.01" && normalizarItem("1.1") === "01.01" && normalizarItem("abc") === "");
conferir("normalizar indOp", normalizarIndOp("100301") === "100301" && normalizarIndOp("10101") === "010101");
conferir("buscar item por código", JSON.stringify(buscarItens(ibscbs, "01.01")) === '["01.01"]');
conferir("buscar item por descrição sem acento", buscarItens(ibscbs, "analise sistemas").includes("01.01"));
conferir("buscar indOp por código", JSON.stringify(buscarIndOp(ibscbs, "100301")) === '["100301"]');
conferir("buscar indOp por descrição", buscarIndOp(ibscbs, "transporte de carga").includes("070101"));
const grupos = agruparRelacoes(ibscbs.relacoes.filter((r) => r[0] === "01.01"), (r) => r.slice(1, 6).join("|"));
conferir("agrupamento junta cClassTrib", grupos.find((g) => g.relacao[1] === "1.1502.90.00").classificacoes.length === 3);

console.log("\n== busca no de-para ==");
const itens = prepararItensDePara(dePara.entradas);
conferir("busca pela tag", filtrarDePara(itens, "tpRetISSQN")[0].entrada.tag === "tpRetISSQN");
conferir("busca pelo código de rejeição", filtrarDePara(itens, "E0580").some((i) => i.entrada.tag === "tpRetISSQN"));
conferir("busca pela descrição sem acento", filtrarDePara(itens, "retencao do issqn").some((i) => i.entrada.tag === "tpRetISSQN"));
conferir("busca pelo campo do JSON", filtrarDePara(itens, "servico[].iss.aliquota").some((i) => i.entrada.tag === "pAliq"));
conferir("grupo pelo caminho", grupoDoCaminho("NFSe/infNFSe/DPS/infDPS/prest/") === "DPS · prest" && grupoDoCaminho("NFSe/infNFSe/") === "NFS-e");

console.log("\n== validador ==");
conferir("CNPJ válido", documentoValido("29062609000177") && !documentoValido("29062609000178"));
conferir("derivação igual à lib", derivarTipoRetencao({ pis: { valor: 1 }, csll: { valor: 1 } }) === "9");
conferir("arredondar e truncar", arredondar(6.505) === 6.51 && truncar(6.509) === 6.5);
conferir("resolver caminho com lista", resolverCaminho({ servico: [{ a: 1 }, { a: 2 }] }, "servico[].a").length === 2);

const comErros = analisarEmissao({
  prestador: { cpfCnpj: "29062609000178", endereco: { codigoCidade: "411520", cep: "8701000" } },
  tomador: { razaoSocial: "Empresa", email: `${"a".repeat(90)}@x.com` },
  servico: [{
    codigo: "01.01",
    valor: { servico: 1000, deducoes: 1200 },
    discriminacao: "linha 1\nlinha 2",
    iss: { aliquota: 8, tipoTributacao: 2, exigibilidade: 6 },
    retencao: {
      pis: { aliquota: 0.65, baseCalculo: 1000, valor: 9.99 },
      cofins: { aliquota: 3, baseCalculo: 1000, valor: 30 },
      csll: { aliquota: 1, baseCalculo: 1000, valor: 10 }
    }
  }]
}, dados);
conferir("dígito verificador", tem(comErros, "dígito verificador"));
conferir("código do serviço sem 6 dígitos", tem(comErros, "sem 6 dígitos"));
conferir("cidade do prestador", tem(comErros, "cidade do prestador"));
conferir("CEP do prestador", tem(comErros, "CEP do prestador"));
conferir("tomador sem identificação", tem(comErros, "Tomador sem identificação"));
conferir("e-mail maior que o leiaute", tem(comErros, "Tamanho fora do leiaute de email"));
conferir("deduções acima do serviço", tem(comErros, "acima do valor do serviço"));
conferir("PIS diferente da alíquota", tem(comErros, "PIS diferente da alíquota"));
conferir("E0595 citada literalmente", comErros.some((a) => a.detalhe.includes("Não é permitido informar alíquota superior a 5%.")));
conferir("suspensão sem processo", tem(comErros, "sem número de processo"));
conferir("imune sem tipo", tem(comErros, "sem tipo de imunidade"));
conferir("sem ibscbs cita a nota do anexo", comErros.some((a) => a.titulo === "JSON sem o grupo ibscbs" && a.detalhe.includes("01/08/2026")));
conferir("soma em vRetCSLL com descrição do anexo", comErros.some((a) => a.titulo.includes("vRetCSLL") && a.detalhe.includes("Contribuições Sociais")));
conferir("tpRetPisCofins com significado do anexo", comErros.some((a) => a.detalhe.includes("3 - PIS/COFINS/CSLL Retidos")));
conferir("todo achado cita fonte", comErros.every((a) => a.fonte));
conferir("tags citadas existem", comErros.flatMap((a) => a.tags).every((c) => porChave.has(c)));
conferir("sem afirmações sem fonte", !comErros.some((a) => /maioria|costuma|prefeituras/i.test(a.detalhe)));

const comIbs = analisarEmissao({
  prestador: { cpfCnpj: "29062609000177" },
  servico: [{ codigo: "010101", valor: { servico: 100 }, discriminacao: "x", iss: { aliquota: 2, tipoTributacao: 6 } }],
  ibscbs: { codigoOperacao: "999999", valores: { tributacao: { cst: "000" } }, destinatario: { razaoSocial: "Y" } }
}, dados);
conferir("indOp fora do anexo VII", tem(comIbs, "fora da tabela do anexo VII"));
conferir("cClassTrib ausente", tem(comIbs, "cClassTrib do IBS e da CBS ausente"));
conferir("destinatário sem identificação", tem(comIbs, "Destinatário do IBS e da CBS sem identificação"));
const combinacao = (cct) => analisarEmissao({ ibscbs: { codigoOperacao: "100301", valores: { tributacao: { cst: "000", cct } } } }, dados);
conferir("combinação fora da correlação", tem(combinacao("999999"), "fora da correlação"));
conferir("combinação presente na correlação", !tem(combinacao("000001"), "fora da correlação"));
conferir("apelido confirmado pela lib", analisarEmissao({ prestador: { cpfcnpj: "1" } }, dados).some((a) => a.detalhe.includes("lê este dado com o nome cpfCnpj")));

const limpo = analisarEmissao({
  prestador: { cpfCnpj: "29062609000177", endereco: { codigoCidade: "4115200", cep: "87010000" } },
  tomador: { cpfCnpj: "12345678909", email: "cliente@exemplo.com.br", endereco: { codigoCidade: "4115200", cep: "87010000" } },
  servico: [{
    codigo: "010101", valor: { servico: 1000 }, discriminacao: "Servico de consultoria",
    iss: { aliquota: 2, tipoTributacao: 6, exigibilidade: 1 },
    retencao: { pis: { aliquota: 0.65, baseCalculo: 1000, valor: 6.5 } }
  }],
  ibscbs: { codigoOperacao: "100301", valores: { tributacao: { cst: "000", cct: "000001" } } }
}, dados);
const graves = limpo.filter((a) => a.severidade !== "informacao");
conferir("JSON correto sem erro nem alerta", graves.length === 0, JSON.stringify(graves.map((a) => a.titulo)));

console.log("\n== validador: cada conferência em js/analise ==");
const notaCorreta = () => ({
  prestador: { cpfCnpj: "29062609000177", endereco: { codigoCidade: "4115200", cep: "87010000" } },
  tomador: { cpfCnpj: "12345678909", razaoSocial: "Cliente", endereco: { codigoCidade: "4115200", cep: "87010000" } },
  servico: [{ codigo: "010101", valor: { servico: 1000 }, discriminacao: "Consultoria", iss: { aliquota: 2, tipoTributacao: 6, exigibilidade: 1 } }],
  ibscbs: { codigoOperacao: "100301", valores: { tributacao: { cst: "000", cct: "000001" } } }
});
const analisarVariacao = (mudar) => {
  const nota = notaCorreta();
  mudar(nota);
  return analisarEmissao(nota, dados);
};
const acusa = (achados, titulo, campo) => achados.some((a) => a.titulo.startsWith(titulo) && a.campo === campo);
const casosPorConferencia = [
  ["texto: caractere invisível", (n) => { n.tomador.razaoSocial = "Cliente X"; }, "Caractere invisível", "tomador.razaoSocial"],
  ["texto: espaço nas extremidades", (n) => { n.tomador.razaoSocial = " Cliente "; }, "Espaço nas extremidades", "tomador.razaoSocial"],
  ["texto: campo vazio", (n) => { n.tomador.razaoSocial = ""; }, "Campo enviado vazio", "tomador.razaoSocial"],
  ["campos: vírgula decimal", (n) => { n.servico[0].valor.servico = "1,5"; }, "Número com vírgula decimal", "servico[0].valor.servico"],
  ["campos: booleano como texto", (n) => { n.servico[0].iss.retido = "true"; }, "Booleano enviado como texto", "servico[0].iss.retido"],
  ["documentos: documento com pontuação", (n) => { n.prestador.cpfCnpj = "29.062.609/0001-77"; }, "Documento com pontuação", "prestador.cpfCnpj"],
  ["valores: valor negativo", (n) => { n.servico[0].valor.servico = -10; }, "Valor negativo", "servico[0].valor.servico"],
  ["retenções: alíquota sem valor", (n) => { n.servico[0].retencao = { pis: { aliquota: 0.65, baseCalculo: 1000 } }; }, "Alíquota de PIS sem valor", "servico[0].retencao.pis"],
  ["retenções: PIS truncado", (n) => { n.servico[0].retencao = { pis: { aliquota: 3, baseCalculo: 333.33, valor: 9.99 } }; }, "PIS calculado com truncamento", "servico[0].retencao.pis.valor"],
  ["retenções: CSLL arredondada", (n) => { n.servico[0].retencao = { csll: { aliquota: 1, baseCalculo: 1234.56, valor: 12.35 } }; }, "CSLL calculado com arredondamento", "servico[0].retencao.csll.valor"],
  ["retenções: tipo divergente", (n) => { n.servico[0].retencao = { pis: { aliquota: 0.65, baseCalculo: 1000, valor: 6.5 }, tipoRetencaoPisCofinsCSLL: "3" }; }, "tipoRetencaoPisCofinsCSLL diferente dos valores retidos", "servico[0].retencao.tipoRetencaoPisCofinsCSLL"],
  ["retenções: apuração própria com retenção", (n) => { n.servico[0].apuracaoPropria = true; n.servico[0].retencao = { pis: { aliquota: 0.65, baseCalculo: 1000, valor: 6.5 } }; }, "Apuração própria junto com retenção", "servico[0].apuracaoPropria"],
  ["ISS: serviço sem o grupo iss", (n) => { delete n.servico[0].iss; }, "Serviço sem o grupo iss", "servico[0].iss"],
  ["ISS: alíquota em fração", (n) => { n.servico[0].iss.aliquota = 0.05; }, "Alíquota de ISS possivelmente em fração", "servico[0].iss.aliquota"],
  ["agregador: serviço como objeto", (n) => { n.servico = { ...n.servico[0], valor: { servico: -1 } }; }, "Valor negativo", "servico.valor.servico"]
];
for (const [titulo, mudar, achadoEsperado, campo] of casosPorConferencia) {
  const achados = analisarVariacao(mudar);
  conferir(titulo, acusa(achados, achadoEsperado, campo), JSON.stringify(achados.map((a) => `${a.titulo} @ ${a.campo}`)));
}
const duasNotas = [notaCorreta(), notaCorreta()];
duasNotas[1].servico[0].valor.servico = -5;
conferir("agregador: lista de notas prefixa o campo com a posição", acusa(analisarEmissao(duasNotas, dados), "Valor negativo", "nota[1].servico[0].valor.servico"));
const empate = analisarVariacao((n) => { n.prestador.endereco.cep = "8701000 "; }).map((a) => a.titulo);
conferir("agregador: no mesmo campo e severidade, regras declarativas vêm antes das de texto",
  empate.indexOf("CEP do prestador fora do leiaute") >= 0 && empate.indexOf("CEP do prestador fora do leiaute") < empate.findIndex((t) => t.startsWith("Caractere invisível")), JSON.stringify(empate));

console.log("\n== tela agrupada de consulta ==");
const catalogo = JSON.parse(readFileSync("./definicoes/rotas.json", "utf8")).rotas;
const porIdCatalogo = new Map(catalogo.map((rota) => [rota.id, rota]));
const agrupada = porIdCatalogo.get("consulta");
conferir("consulta agrupada no catálogo", agrupada?.tela === "variantes" && agrupada.variantes.length === 3);
const referenciadas = agrupada.variantes.flatMap((v) => [v.rota, v.alternativa].filter(Boolean));
conferir("variantes apontam para rotas existentes e ocultas", referenciadas.every((id) => porIdCatalogo.get(id)?.oculta === true), referenciadas.join(", "));
conferir("só o ID tem versão completa", agrupada.variantes.filter((v) => v.alternativa).map((v) => v.id).join() === "id");
conferir("completa por ID usa /nfse/{item}", porIdCatalogo.get("consulta-id-completa").caminho === "/nfse/{item}");
conferir("simplificada por ID usa /nfse/consultar/{item}", porIdCatalogo.get("consulta-id").caminho === "/nfse/consultar/{item}");
conferir("rotas antigas soltas removidas", !porIdCatalogo.has("consulta-completa"));

console.log("\n== contrato com a documentação do PlugNotas ==");
const contrato = {
  "consulta-id": "GET /nfse/consultar/{item}", "consulta-id-completa": "GET /nfse/{item}",
  "consulta-integracao": "GET /nfse/consultar/{item}/{cnpj}", "consulta-periodo": "GET /nfse/consultar/periodo",
  xml: "GET /nfse/xml/{item}", pdf: "GET /nfse/pdf/{item}", "pdf-regerar": "POST /nfse/pdf/{item}",
  email: "POST /nfse/email/{item}", cancelar: "POST /nfse/cancelar/{item}", "cancelar-status": "GET /nfse/cancelar/status/{item}",
  eventos: "POST /nfse/eventos/{item}", sincronizar: "POST /nfse/sincronizar", interromper: "POST /nfse/interromper",
  "empresa-cnpj": "GET /empresa/{item}", "empresa-lista": "GET /empresa", "empresa-logotipo": "GET /empresa/{item}/logotipo",
  "webhook-empresa": "GET /empresa/{item}/webhook", "webhook-empresa-teste": "POST /empresa/{item}/webhook/verify",
  "webhook-organizacao": "GET /webhook", "webhook-organizacao-teste": "POST /webhook/verify",
  "certificado-consulta": "GET /certificado/{item}", "certificado-lista": "GET /certificado"
};
const divergentes = Object.entries(contrato).filter(([id, esperado]) => {
  const rota = porIdCatalogo.get(id);
  return !rota || `${rota.metodo} ${rota.caminho}` !== esperado;
});
conferir("método e caminho de todas as rotas iguais aos da documentação", divergentes.length === 0, JSON.stringify(divergentes));
conferir("base do catálogo igual à origem que pode receber a API Key", JSON.parse(readFileSync("./definicoes/rotas.json", "utf8")).base === ORIGEM_PLUGNOTAS);
conferir("todo caminho do catálogo começa com /", catalogo.filter((rota) => rota.caminho).every((rota) => rota.caminho.startsWith("/")));
const destinos = (id) => (porIdCatalogo.get(id).campos || []).map((c) => `${c.destino}${c.obrigatorio ? "*" : ""}`).sort().join(",");
conferir("período com parâmetros na URL e só cpfCnpj obrigatório", destinos("consulta-periodo") === "consulta.cpfCnpj*,consulta.dataFinal,consulta.dataInicial,consulta.hashProximaPagina", destinos("consulta-periodo"));
conferir("cancelamento com codigo e motivo no corpo", destinos("cancelar") === "corpo.codigo,corpo.motivo");
conferir("e-mail com destinatarios e reenvio no corpo", destinos("email") === "corpo.destinatarios*,corpo.reenvio");
conferir("eventos com tipo obrigatório", destinos("eventos").includes("corpo.tipo*"));
conferir("lista de empresas pagina por hashProximaPagina", destinos("empresa-lista") === "consulta.hashProximaPagina");
conferir("interrupção sem observação de dúvida", !porIdCatalogo.get("interromper").observacao);
const doGrupoEmpresa = catalogo.filter((rota) => rota.grupo === "Empresa" && rota.metodo);
const escrita = doGrupoEmpresa.filter((rota) => rota.metodo !== "GET");
conferir("grupo Empresa só com leitura e os dois testes de webhook", escrita.map((r) => r.id).sort().join() === "webhook-empresa-teste,webhook-organizacao-teste");
conferir("testes de webhook pedem confirmação", escrita.every((rota) => rota.sensivel && rota.confirmar));
conferir("relatório de NFS-e removido", !catalogo.some((rota) => rota.id.startsWith("relatorio")));
conferir("telas agrupadas apontam para rotas existentes",
  catalogo.filter((r) => r.tela === "variantes").every((r) => r.variantes.every((v) => porIdCatalogo.get(v.rota)?.oculta && (!v.alternativa || porIdCatalogo.get(v.alternativa)?.oculta))));

console.log(falhas === 0 ? "\nTodos os testes passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
