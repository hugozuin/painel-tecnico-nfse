global.document = { getElementById: () => null };

const {
  classificarSituacao, definirDesfecho, definirDesfechoSemConferencia, conferenciaEncerrada, limiteDeVerificacoes,
  montarItensResolve, normalizarConfiguracaoResolve, mensagemDeConfirmacaoResolve, idsComFalha,
  CABECALHO_CSV_RESOLVE, linhasCsvResolve, resumoParaTicket, executarLoteResolve, DESFECHO_FALHA_NOS_EVENTOS
} = await import("../js/fluxo-resolve.js");
const { criarSessaoRequisicoes } = await import("../js/plugnotas.js");

let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};

console.log("\n== classificação da situação ==");
const classificacoes = {
  "": "desconhecida", cancelado: "cancelada", REJEITADO: "rejeitada", ERRO: "rejeitada", NEGADA: "rejeitada",
  INVALIDO: "rejeitada", CONCLUIDO: "concluida", AUTORIZADA: "concluida", PROCESSANDO: "andamento",
  PENDENTE: "andamento", "EM ANDAMENTO": "andamento", AGUARDANDO: "andamento", ENVIADO: "andamento",
  SUBSTITUIDA: "desconhecida", "CANCELAMENTO REJEITADO": "cancelada", "ERRO AO AUTORIZAR": "rejeitada"
};
const divergentes = Object.entries(classificacoes).filter(([situacao, esperado]) => classificarSituacao(situacao) !== esperado);
conferir("cada situação cai na categoria esperada, com cancelada antes de rejeitada e rejeitada antes de concluída", divergentes.length === 0, JSON.stringify(divergentes));

console.log("\n== desfecho com conferência ==");
const desfecho = (situacaoAntes, situacaoDepois, resolveOk) => definirDesfecho({ situacaoAntes, situacaoDepois, resolveOk }).chave;
conferir("rejeitada que conclui vira Resolvido", desfecho("REJEITADO", "CONCLUIDO", true) === "resolvido");
conferir("concluída antes e depois vira Já estava concluída", desfecho("CONCLUIDO", "CONCLUIDO", true) === "ja-concluida");
conferir("concluída depois vence o resolve recusado", desfecho("REJEITADO", "CONCLUIDO", false) === "resolvido");
conferir("resolve recusado sem concluir vira erro", desfecho("REJEITADO", "REJEITADO", false) === "erro");
conferir("cancelada depois", desfecho("REJEITADO", "CANCELADO", true) === "cancelada");
conferir("continua rejeitada", desfecho("REJEITADO", "ERRO", true) === "rejeitada");
conferir("ainda em processamento", desfecho("", "PROCESSANDO", true) === "andamento");
conferir("situação vazia com resolve aceito conta como sucesso sem leitura",
  definirDesfecho({ situacaoAntes: "", situacaoDepois: "", resolveOk: true }).sucesso === true && desfecho("", "", true) === "sem-leitura");

console.log("\n== desfecho sem conferência ==");
conferir("solicitado vira Resolve aceito", definirDesfechoSemConferencia("solicitado").rotulo === "Resolve aceito");
conferir("processando na API vira andamento", definirDesfechoSemConferencia("processando-api").chave === "andamento");
conferir("qualquer outro vira Erro", definirDesfechoSemConferencia("erro").rotulo === "Erro" && !definirDesfechoSemConferencia("erro").sucesso);

console.log("\n== encerramento da conferência ==");
conferir("para na concluída", conferenciaEncerrada("CONCLUIDO", "REJEITADO"));
conferir("para na cancelada", conferenciaEncerrada("CANCELADO", "REJEITADO"));
conferir("rejeitada igual à de antes continua conferindo", !conferenciaEncerrada("REJEITADO", "REJEITADO"));
conferir("rejeitada com texto novo para", conferenciaEncerrada("ERRO", "REJEITADO"));
conferir("processando continua", !conferenciaEncerrada("PROCESSANDO", "PROCESSANDO"));
conferir("situação vazia continua", !conferenciaEncerrada("", ""));
conferir("resolve recusado confere uma vez só", limiteDeVerificacoes({ verificacoes: 6 }, false) === 1 && limiteDeVerificacoes({ verificacoes: 6 }, true) === 6);

console.log("\n== itens com identificação ==");
const unica = montarItensResolve(["A", "B"], { modo: "unica", identificacaoUnica: "  COD  ", identificacoes: new Map() });
conferir("identificação única aparada e aplicada a todas", unica.every((item) => item.identificacao === "COD"));
const individual = montarItensResolve(["A", "B"], { modo: "individual", identificacaoUnica: "X", identificacoes: new Map([["A", " C1 "]]) });
conferir("identificação individual por id, vazia quando falta", individual[0].identificacao === "C1" && individual[1].identificacao === "");

console.log("\n== configuração ==");
const padrao = normalizarConfiguracaoResolve({ tentativas: "", intervalo: "", esperaNacional: "", verificacoes: "", intervaloVerificacao: "", nacional: false, verificar: true });
conferir("valores padrão", padrao.tentativas === 3 && padrao.intervalo === 1000 && padrao.esperaNacional === 15000 && padrao.verificacoes === 3 && padrao.intervaloVerificacao === 10000);
conferir("intervalo 0 volta ao padrão de 1000 ms, como hoje", normalizarConfiguracaoResolve({ intervalo: "0" }).intervalo === 1000);
conferir("intervalo negativo vira 0", normalizarConfiguracaoResolve({ intervalo: "-5" }).intervalo === 0);
conferir("intervalo entre verificações tem mínimo de 1000 ms", normalizarConfiguracaoResolve({ intervaloVerificacao: "500" }).intervaloVerificacao === 1000);

console.log("\n== confirmação ==");
const semVerificar = { nacional: false, verificar: false, verificacoes: 3, esperaNacional: 15000 };
conferir("todas sem identificação e sem conferência",
  mensagemDeConfirmacaoResolve([{ id: "A", identificacao: "" }], semVerificar)
    === "Serão processadas 1 nota(s). Todas serão enviadas sem identificacaoNota. A conferência pós resolve está desligada: o resultado refletirá apenas a resposta HTTP. Deseja continuar?");
conferir("parte sem identificação, Nacional e conferência",
  mensagemDeConfirmacaoResolve([{ id: "A", identificacao: "C" }, { id: "B", identificacao: "" }], { nacional: true, verificar: true, verificacoes: 3, esperaNacional: 10000 })
    === "Serão processadas 2 nota(s). 1 dela(s) será(ão) enviada(s) sem identificacaoNota. Modo Nacional ativo: consulta de eventos e espera de 10s antes do resolve. A situação será conferida na rota de consulta em até 3 verificação(ões). Deseja continuar?");

console.log("\n== exportação e resumo ==");
const resultados = [
  { id: "A", identificacao: "C", situacaoAntes: "REJEITADO", situacaoDepois: "CONCLUIDO", status: 200, rotulo: "Resolvido", sucesso: true, mensagem: "ok", duracaoMs: 5, quando: "Q" },
  { id: "B", identificacao: "", situacaoAntes: "", situacaoDepois: "", status: null, rotulo: "Erro", sucesso: false, mensagem: "", duracaoMs: 0, quando: "Q" }
];
conferir("reprocessa só as falhas", JSON.stringify(idsComFalha(resultados)) === '["B"]');
conferir("CSV com nove colunas e status vazio quando não houve resposta",
  CABECALHO_CSV_RESOLVE.length === 9 && linhasCsvResolve(resultados)[1][4] === "" && linhasCsvResolve(resultados)[0].length === 9);
conferir("resumo agrupado por resultado",
  resumoParaTicket({ resultados, contadores: { feitas: 2, sucessos: 1, falhas: 1 }, autor: "Consultor", quando: "01/01/2026" })
    === "Resolve em lote executado em 01/01/2026 por Consultor\nNotas processadas: 2 | Sucesso: 1 | Falha: 1\n\nResolvido (1):\n  A situacao CONCLUIDO - ok\n\nErro (1):\n  B");

console.log("\n== orquestração com a API simulada ==");
const resposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => JSON.stringify(corpo) });
function simularApi({ situacoes, depois = {}, resolveRecusado = [], eventoComFalha = [] }) {
  const chamadas = [];
  global.fetch = async (url, opcoes = {}) => {
    const id = String(url).split("/").pop();
    const tipo = String(url).includes("/nfse/resolve/") ? "resolve" : String(url).includes("/nfse/eventos/") ? "eventos" : "consultar";
    chamadas.push(`${tipo} ${id}`);
    if (tipo === "eventos") return eventoComFalha.includes(id) ? resposta(400, { message: "Falha no evento" }) : resposta(200, { message: "ok" });
    if (tipo === "resolve") {
      if (resolveRecusado.includes(id)) return resposta(400, { message: "ID invalido" });
      if (id in depois) situacoes[id] = depois[id];
      return resposta(200, { message: "Solicitacao recebida" });
    }
    return resposta(200, { id, situacao: situacoes[id], mensagem: `msg ${id}` });
  };
  return chamadas;
}
async function executarComRegistro(itens, configuracao, sessao = criarSessaoRequisicoes()) {
  const estagios = {};
  const antes = {};
  const concluidos = [];
  await executarLoteResolve({
    itens, apiKey: "k", configuracao, sessao,
    aoMudarEstagio: (posicao, estagio) => (estagios[posicao] ||= []).push(estagio),
    aoLerSituacaoAntes: (posicao, situacao) => { antes[posicao] = situacao; },
    aoConcluir: (posicao, resultado) => concluidos.push({ posicao, ...resultado })
  });
  return { estagios, antes, concluidos };
}
const rapida = { tentativas: 1, intervalo: 1, nacional: false, esperaNacional: 1, verificar: true, verificacoes: 3, intervaloVerificacao: 1 };

let chamadas = simularApi({ situacoes: { A: "REJEITADO", B: "REJEITADO" }, depois: { A: "CONCLUIDO" }, resolveRecusado: ["B"] });
let saida = await executarComRegistro([{ id: "A", identificacao: "" }, { id: "B", identificacao: "C" }], rapida);
const porId = (id) => saida.concluidos.find((resultado) => resultado.id === id);
conferir("estágios da nota na ordem da tela", JSON.stringify(saida.estagios[0]) === '["consultando","processando","verificando"]', JSON.stringify(saida.estagios));
conferir("situação antes avisada à tela", saida.antes[0] === "REJEITADO" && saida.antes[1] === "REJEITADO");
conferir("A resolvida", porId("A").chave === "resolvido" && porId("A").situacaoDepois === "CONCLUIDO" && porId("A").status === 200);
conferir("B recusada confere uma vez e usa a mensagem da consulta",
  porId("B").chave === "erro" && porId("B").status === 400 && porId("B").mensagem === "msg B" && chamadas.filter((c) => c === "consultar B").length === 2);
conferir("sem Nacional não consulta eventos", !chamadas.some((c) => c.startsWith("eventos")));

chamadas = simularApi({ situacoes: { E1: "REJEITADO", E2: "REJEITADO" }, depois: { E1: "CONCLUIDO" }, eventoComFalha: ["E2"] });
saida = await executarComRegistro([{ id: "E1", identificacao: "" }, { id: "E2", identificacao: "" }], { ...rapida, nacional: true });
conferir("Nacional: eventos antes do resolve e espera única", saida.estagios[0].slice(0, 2).join(",") === "evento,aguardando");
conferir("Nacional: falha nos eventos encerra a nota sem resolve",
  saida.concluidos.find((resultado) => resultado.id === "E2")?.rotulo === DESFECHO_FALHA_NOS_EVENTOS.rotulo && !chamadas.includes("resolve E2"));
conferir("Nacional: falha nos eventos concluída antes das demais", saida.concluidos[0].id === "E2");

chamadas = simularApi({ situacoes: { S1: "REJEITADO" } });
const sessaoCancelada = criarSessaoRequisicoes();
sessaoCancelada.cancelar();
saida = await executarComRegistro([{ id: "S1", identificacao: "" }], rapida, sessaoCancelada);
conferir("sessão já cancelada não chama a API nem conclui nota", chamadas.length === 0 && saida.concluidos.length === 0);

console.log(falhas === 0 ? "\nTodos os testes do Resolve passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
