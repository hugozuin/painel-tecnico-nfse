global.document = { getElementById: () => null };

const { criarSessaoRequisicoes, executarResolve, consultarNota, normalizarNota } = await import("../js/plugnotas.js");
const { criarPoolExecucao } = await import("../js/shared.js");

let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};

const resposta = (status, corpo, cabecalhos = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (nome) => cabecalhos[nome] ?? null },
  text: async () => (typeof corpo === "string" ? corpo : JSON.stringify(corpo))
});

console.log("\n== resolve com sucesso ==");
global.fetch = async () => resposta(200, { message: "Solicitacao de resolve recebida com sucesso" });
let saida = await executarResolve({ id: "A1", apiKey: "k", sessao: criarSessaoRequisicoes(), tentativas: 3, intervalo: 1 });
conferir("desfecho solicitado", saida.desfecho === "solicitado", JSON.stringify(saida));

console.log("\n== resolve já em execução, depois aceito ==");
let chamadas = 0;
global.fetch = async () => {
  chamadas++;
  return chamadas < 2
    ? resposta(400, { message: "O processo de resolve ja esta sendo executado para esse documento" })
    : resposta(200, { message: "ok" });
};
const { mock } = await import("node:test");
mock.timers.enable({ apis: ["setTimeout"] });
let terminado = null;
executarResolve({ id: "A2", apiKey: "k", sessao: criarSessaoRequisicoes(), tentativas: 3, intervalo: 1 }).then((resultado) => { terminado = resultado; });
const esperaAntesDaSegunda = [];
for (let passo = 0; passo < 20 && !terminado; passo++) {
  await new Promise((pronto) => setImmediate(pronto));
  if (chamadas === 1) esperaAntesDaSegunda.push(passo);
  mock.timers.tick(1000);
}
mock.timers.reset();
saida = terminado || { desfecho: "sem resposta no tempo simulado" };
conferir("aguarda e conclui como solicitado", saida.desfecho === "solicitado", JSON.stringify(saida));
conferir("consumiu duas chamadas", chamadas === 2, `chamadas=${chamadas}`);
conferir("esperou cerca de 10 s simulados antes da segunda chamada", esperaAntesDaSegunda.length >= 10 && esperaAntesDaSegunda.length <= 11, `${esperaAntesDaSegunda.length} s`);

console.log("\n== erro 400 definitivo ==");
global.fetch = async () => resposta(400, { message: "Falha ao buscar NFSE, o ID utilizado e invalido" });
saida = await executarResolve({ id: "A3", apiKey: "k", sessao: criarSessaoRequisicoes(), tentativas: 3, intervalo: 1 });
conferir("desfecho erro sem repetir", saida.desfecho === "erro" && saida.status === 400);

console.log("\n== 429 respeita Retry-After e reduz ritmo ==");
let tentativas429 = 0;
let reduziu = false;
global.fetch = async () => {
  tentativas429++;
  return tentativas429 === 1
    ? resposta(429, { message: "Too many requests" }, { "Retry-After": "0" })
    : resposta(200, { message: "ok" });
};
saida = await executarResolve({
  id: "A4", apiKey: "k", sessao: criarSessaoRequisicoes(), tentativas: 3, intervalo: 5000,
  aoReduzirRitmo: () => { reduziu = true; }
});
conferir("conclui após o 429", saida.desfecho === "solicitado");
conferir("avisou para reduzir concorrência", reduziu);

console.log("\n== cancelamento interrompe ==");
const sessao = criarSessaoRequisicoes();
global.fetch = async () => { sessao.cancelar(); return resposta(500, { message: "erro" }); };
saida = await executarResolve({ id: "A5", apiKey: "k", sessao, tentativas: 3, intervalo: 1 });
conferir("desfecho cancelado", saida.desfecho === "cancelado", JSON.stringify(saida));

console.log("\n== pausas que o cancelamento interrompe ==");
const { pausarAteCancelar } = await import("../js/plugnotas.js");
const sessaoDaPausa = criarSessaoRequisicoes();
let inicioDaPausa = performance.now();
await pausarAteCancelar(20, sessaoDaPausa);
conferir("sem cancelamento a pausa dura o tempo pedido e não deixa controlador para trás",
  performance.now() - inicioDaPausa >= 15 && sessaoDaPausa.controladores.size === 0, `${Math.round(performance.now() - inicioDaPausa)} ms`);
inicioDaPausa = performance.now();
setTimeout(() => sessaoDaPausa.cancelar(), 10);
await pausarAteCancelar(60000, sessaoDaPausa);
conferir("cancelar encerra uma pausa de 60 s na hora", performance.now() - inicioDaPausa < 1000, `${Math.round(performance.now() - inicioDaPausa)} ms`);
inicioDaPausa = performance.now();
await pausarAteCancelar(60000, sessaoDaPausa);
conferir("sessão já cancelada não pausa", performance.now() - inicioDaPausa < 50);
const sessaoDoResolveEmAndamento = criarSessaoRequisicoes();
global.fetch = async () => {
  setTimeout(() => sessaoDoResolveEmAndamento.cancelar(), 10);
  return resposta(400, { message: "O processo de resolve ja esta sendo executado para esse documento" });
};
inicioDaPausa = performance.now();
saida = await executarResolve({ id: "A6", apiKey: "k", sessao: sessaoDoResolveEmAndamento, tentativas: 3, intervalo: 1 });
conferir("cancelar durante a espera do resolve em andamento devolve cancelado na hora",
  saida.desfecho === "cancelado" && performance.now() - inicioDaPausa < 1000, `${saida.desfecho}, ${Math.round(performance.now() - inicioDaPausa)} ms`);

console.log("\n== normalização da consulta ==");
const notaLista = normalizarNota([{ id: "abc", situacao: "concluido", numeroNfse: "123", codigoVerificacao: "XYZ" }]);
conferir("aceita lista e normaliza situação", notaLista.situacao === "CONCLUIDO" && notaLista.numero === "123");
const notaObjeto = normalizarNota({ situacao: "REJEITADO", mensagem: "erro na prefeitura" });
conferir("aceita objeto", notaObjeto.situacao === "REJEITADO" && notaObjeto.mensagem === "erro na prefeitura");
conferir("retorna nulo sem dados", normalizarNota(null) === null);

console.log("\n== consulta monta a URL certa ==");
let urlChamada = "";
global.fetch = async (url) => { urlChamada = url; return resposta(200, { situacao: "CONCLUIDO" }); };
await consultarNota({ identificador: "X1", apiKey: "k", sessao: criarSessaoRequisicoes() });
conferir("resumida usa /nfse/consultar", urlChamada.endsWith("/nfse/consultar/X1"), urlChamada);
await consultarNota({ identificador: "X1", apiKey: "k", sessao: criarSessaoRequisicoes(), tipo: "completa" });
conferir("completa usa /nfse/{id}", urlChamada.endsWith("/nfse/X1"), urlChamada);
await consultarNota({ identificador: "INT1", apiKey: "k", sessao: criarSessaoRequisicoes(), cnpj: "29062609000177" });
conferir("por integração usa id e cnpj", urlChamada.endsWith("/nfse/consultar/INT1/29062609000177"), urlChamada);

console.log("\n== pool respeita o limite e a redução ==");
const pool = criarPoolExecucao(5);
let simultaneos = 0;
let pico = 0;
await pool.executar(Array.from({ length: 30 }, (_, i) => i), async () => {
  simultaneos++;
  pico = Math.max(pico, simultaneos);
  await new Promise((r) => setTimeout(r, 5));
  simultaneos--;
});
conferir("nunca passa de 5 simultâneos", pico <= 5, `pico=${pico}`);
pool.reduzir();
conferir("reduz para 4", pool.limite === 4);
pool.restaurar();
conferir("restaura para 5", pool.limite === 5);

const poolVazio = criarPoolExecucao(3);
await poolVazio.executar([], async () => {});
conferir("lista vazia encerra sem travar", true);

console.log(falhas === 0 ? "\nTodos os testes de fluxo passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
