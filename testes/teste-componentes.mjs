import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><body></body>");
global.window = dom.window;
global.document = dom.window.document;

const { montarCartao, montarInterruptor } = await import("../js/componentes.js");
const { conteudoDoPopup, secaoDoPopup, fonteDoPopup } = await import("../js/info.js");
const { rotuloAcao } = await import("../js/telas/lote/entrada.js");
const { montarEndereco, prepararPedido, executarItemAItem, executarConjunto } = await import("../js/telas/lote/execucao.js");
const { criarSessaoRequisicoes } = await import("../js/plugnotas.js");
const { criarPoolExecucao } = await import("../js/shared.js");
const { textoDoRetorno } = await import("../js/telas/lote/retorno.js");

let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};
const estrutura = (no) => [...no.children].map((filho) => `${filho.tagName.toLowerCase()}${filho.className ? `.${filho.className.replaceAll(" ", ".")}` : ""}`).join(" ");

console.log("\n== componentes: cartão ==");
const botao = document.createElement("button");
const cartao = montarCartao({ titulo: "Resultados", passo: "2", classe: "card-credencial", oculto: true, cabecalho: [botao] }, ["corpo"]);
conferir("cartão é section.card com a classe extra", cartao.tagName === "SECTION" && cartao.className === "card card-credencial");
conferir("cartão oculto usa o atributo hidden", cartao.hidden === true);
conferir("cabeçalho com passo, título e itens extras na ordem", estrutura(cartao.querySelector(".card-header")) === "span.card-step h2 button" && cartao.querySelector("h2").textContent === "Resultados");
conferir("corpo recebe o conteúdo", cartao.querySelector(".card-body").textContent === "corpo");
const semTitulo = montarCartao({}, ["só corpo"]);
conferir("sem título não monta cabeçalho", estrutura(semTitulo) === "div.card-body" && semTitulo.className === "card" && !semTitulo.hidden);
const tituloComNos = montarCartao({ titulo: [document.createElement("code"), " texto"] }, []);
conferir("título aceita nós", tituloComNos.querySelector("h2").innerHTML === "<code></code> texto");

console.log("\n== componentes: interruptor ==");
const alternador = document.createElement("input");
alternador.type = "checkbox";
const interruptor = montarInterruptor(alternador, "Consulta completa", "Traz o documento inteiro.");
conferir("interruptor é label.switch-row com a mesma árvore das telas", interruptor.tagName === "LABEL" && interruptor.className === "switch-row"
  && estrutura(interruptor) === "span.switch span.switch-text" && estrutura(interruptor.querySelector(".switch")) === "input span.switch-slider");
conferir("texto do interruptor vira strong e small", interruptor.querySelector("strong").textContent === "Consulta completa" && interruptor.querySelector("small").textContent === "Traz o documento inteiro.");
const explicacaoViva = document.createElement("small");
conferir("explicação em nó é usada como está", montarInterruptor(alternador, "x", explicacaoViva).querySelector(".switch-text").lastChild === explicacaoViva);

console.log("\n== componentes: popup ==");
const popup = conteudoDoPopup("Título", [...secaoDoPopup("Descrição", "Texto do anexo"), fonteDoPopup("anexo VI")]);
conferir("popup começa pelo título", popup.firstChild.className === "popup-titulo" && popup.firstChild.textContent === "Título");
conferir("seção do popup é h4 mais parágrafo", estrutura(popup) === "p.popup-titulo h4 p.popup-texto p.popup-fonte" && popup.querySelector(".popup-texto").textContent === "Texto do anexo");
conferir("fonte do popup cita a origem", popup.querySelector(".popup-fonte").textContent === "Fonte: anexo VI");

console.log("\n== lote: entrada e execução ==");
conferir("rótulo da ação por tipo de rota",
  rotuloAcao({ resultado: { tipo: "arquivo" } }) === "Baixar arquivos" && rotuloAcao({ metodo: "GET" }) === "Consultar" && rotuloAcao({}) === "Consultar" && rotuloAcao({ metodo: "POST" }) === "Executar");
const contexto = { base: () => "https://api.exemplo.invalid" };
const dadosVazios = { caminho: {}, corpo: {}, consulta: {} };
conferir("item vai codificado no caminho", montarEndereco({ caminho: "/nfse/{item}" }, contexto, "a b/c", dadosVazios).url === "https://api.exemplo.invalid/nfse/a%20b%2Fc");
conferir("campo de caminho substitui a marcação", montarEndereco({ caminho: "/nfse/consultar/{item}/{cnpj}" }, contexto, "INT1", { ...dadosVazios, caminho: { cnpj: "12345678000195" } }).url
  === "https://api.exemplo.invalid/nfse/consultar/INT1/12345678000195");
conferir("parametroItem e campos de consulta vão na URL", montarEndereco({ caminho: "/nfse/consultar/periodo", parametroItem: "consulta.cpfCnpj" }, contexto, "12345678000195", { ...dadosVazios, consulta: { dataInicial: "2026-01-01" } }).url
  === "https://api.exemplo.invalid/nfse/consultar/periodo?dataInicial=2026-01-01&cpfCnpj=12345678000195");
conferir("GET sai sem corpo", montarEndereco({ caminho: "/x", metodo: "GET" }, contexto, "", { ...dadosVazios, corpo: { a: 1 } }).corpo === undefined);
conferir("POST sem campos de corpo sai sem corpo", montarEndereco({ caminho: "/x", metodo: "POST" }, contexto, "", dadosVazios).corpo === undefined);
conferir("POST com campos leva o corpo", JSON.stringify(montarEndereco({ caminho: "/x", metodo: "POST" }, contexto, "", { ...dadosVazios, corpo: { reenvio: true } }).corpo) === '{"reenvio":true}');
conferir("pedido padrão usa método da rota", JSON.stringify(prepararPedido({ metodo: "POST" }, {}, { url: "u", corpo: { a: 1 } })) === '{"url":"u","metodo":"POST","corpo":{"a":1}}');
conferir("contexto pode trocar o pedido (repasse do Nacional)", prepararPedido({}, { prepararPedido: (alvo) => ({ url: `api/proxy?url=${alvo.url}` }) }, { url: "x" }).url === "api/proxy?url=x");

console.log("\n== lote: execução com a API simulada ==");
const pedidos = [];
let aoPedir = () => {};
global.fetch = async (url, opcoes = {}) => {
  pedidos.push({ url: String(url), metodo: opcoes.method, corpo: opcoes.body ? JSON.parse(opcoes.body) : undefined });
  aoPedir();
  return { ok: true, status: 200, headers: { get: () => "application/json" }, text: async () => '{"ok":true}' };
};
const contextoPlugNotas = { base: () => "https://api.plugnotas.com.br" };
const estadoNovo = () => ({ pool: criarPoolExecucao(2), sessao: criarSessaoRequisicoes() });
const respostas = [];
const progresso = [];
await executarItemAItem({
  rota: { caminho: "/nfse/consultar/{item}", metodo: "GET" }, contexto: contextoPlugNotas, estado: estadoNovo(),
  itens: ["A", "B", "C"], dados: dadosVazios, credencial: "chave",
  aoResponder: (registro) => respostas.push(registro), aoAvancar: (percentual) => progresso.push(percentual)
});
conferir("uma chamada e uma resposta por item, com a URL de destino",
  pedidos.length === 3 && respostas.length === 3 && respostas.every((registro) => registro.resposta.ok && registro.resposta.destino.endsWith(`/nfse/consultar/${registro.item}`)));
conferir("progresso termina em 100%", progresso.at(-1) === 100 && progresso.length === 3, progresso.join());
pedidos.length = 0;
const estadoCancelado = estadoNovo();
aoPedir = () => estadoCancelado.sessao.cancelar();
await executarItemAItem({
  rota: { caminho: "/nfse/xml/{item}", metodo: "GET" }, contexto: contextoPlugNotas, estado: estadoCancelado,
  itens: ["A", "B", "C", "D", "E"], dados: dadosVazios, credencial: "chave", aoResponder: () => {}, aoAvancar: () => {}
});
conferir("cancelamento não despacha novos itens", pedidos.length <= 2, `${pedidos.length} chamadas`);
aoPedir = () => {};
pedidos.length = 0;
const conjunto = await executarConjunto({
  rota: { caminho: "/nfse/sincronizar", metodo: "POST" }, contexto: contextoPlugNotas, estado: estadoNovo(),
  itens: ["S1", "S2"], dados: dadosVazios, credencial: "chave"
});
conferir("conjunto faz uma chamada com a lista no corpo", pedidos.length === 1 && pedidos[0].metodo === "POST"
  && JSON.stringify(pedidos[0].corpo) === '["S1","S2"]' && conjunto.destino === "https://api.plugnotas.com.br/nfse/sincronizar" && conjunto.resposta.ok);

console.log("\n== lote: retorno ==");
conferir("retorno com JSON sai indentado", textoDoRetorno({ dados: { a: 1 } }) === '{\n  "a": 1\n}');
conferir("retorno sem JSON usa o texto e depois a mensagem", textoDoRetorno({ dados: null, texto: "<xml/>" }) === "<xml/>" && textoDoRetorno({ dados: null, mensagem: "Falha" }) === "Falha" && textoDoRetorno({}) === "");

console.log(falhas === 0 ? "\nTeste dos componentes passou." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
