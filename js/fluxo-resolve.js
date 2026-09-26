import { pausar, registrarLog, criarPoolExecucao } from "./shared.js";
import { consultarNota, consultarEventos, executarResolve } from "./plugnotas.js";

const CONCORRENCIA_RESOLVE = 5;

const situacaoConcluida = /CONCLU|AUTORIZ/;
const situacaoRejeitada = /REJEIT|ERRO|NEGAD|INVALID/;
const situacaoCancelada = /CANCEL/;
const situacaoEmAndamento = /PROCESS|PENDEN|ANDAMENT|AGUARD|ENVIAD/;

export function classificarSituacao(situacao) {
  const texto = String(situacao || "").toUpperCase();
  if (!texto) return "desconhecida";
  if (situacaoCancelada.test(texto)) return "cancelada";
  if (situacaoRejeitada.test(texto)) return "rejeitada";
  if (situacaoConcluida.test(texto)) return "concluida";
  if (situacaoEmAndamento.test(texto)) return "andamento";
  return "desconhecida";
}

export function definirDesfecho({ situacaoAntes, situacaoDepois, resolveOk }) {
  const depois = classificarSituacao(situacaoDepois);
  const antes = classificarSituacao(situacaoAntes);

  if (depois === "concluida") {
    return antes === "concluida"
      ? { chave: "ja-concluida", rotulo: "Já estava concluída", sucesso: true }
      : { chave: "resolvido", rotulo: "Resolvido", sucesso: true };
  }
  if (!resolveOk) return { chave: "erro", rotulo: "Resolve recusado pela API", sucesso: false };
  if (depois === "cancelada") return { chave: "cancelada", rotulo: "Cancelada na prefeitura", sucesso: false };
  if (depois === "rejeitada") return { chave: "rejeitada", rotulo: "Continua rejeitada", sucesso: false };
  if (depois === "andamento") return { chave: "andamento", rotulo: "Ainda em processamento", sucesso: false };
  return { chave: "sem-leitura", rotulo: "Resolve aceito, situação não lida", sucesso: true };
}

export function definirDesfechoSemConferencia(desfechoDoResolve) {
  if (desfechoDoResolve === "solicitado") return { chave: "sem-leitura", rotulo: "Resolve aceito", sucesso: true };
  if (desfechoDoResolve === "processando-api") return { chave: "andamento", rotulo: "Em processamento na API", sucesso: false };
  return { chave: "erro", rotulo: "Erro", sucesso: false };
}

const DESFECHO_CANCELADO = { chave: "cancelado", rotulo: "Cancelado", sucesso: false };
export const DESFECHO_FALHA_NOS_EVENTOS = { chave: "erro", rotulo: "Erro na consulta de eventos", sucesso: false };

export function conferenciaEncerrada(situacao, situacaoAntes) {
  const categoria = classificarSituacao(situacao);
  const mudou = Boolean(situacao) && situacao !== situacaoAntes;
  return categoria === "concluida" || categoria === "cancelada" || (categoria === "rejeitada" && mudou);
}

export function limiteDeVerificacoes(configuracao, resolveOk) {
  return resolveOk ? configuracao.verificacoes : 1;
}

export function montarItensResolve(ids, { modo, identificacaoUnica, identificacoes }) {
  if (modo === "unica") {
    const valor = identificacaoUnica.trim();
    return ids.map((id) => ({ id, identificacao: valor }));
  }
  return ids.map((id) => ({ id, identificacao: (identificacoes.get(id) || "").trim() }));
}

export function normalizarConfiguracaoResolve(valores) {
  return {
    tentativas: parseInt(valores.tentativas, 10) || 3,
    intervalo: Math.max(parseInt(valores.intervalo, 10) || 1000, 0),
    nacional: valores.nacional,
    esperaNacional: parseInt(valores.esperaNacional, 10) || 15000,
    verificar: valores.verificar,
    verificacoes: parseInt(valores.verificacoes, 10) || 3,
    intervaloVerificacao: Math.max(parseInt(valores.intervaloVerificacao, 10) || 10000, 1000)
  };
}

export function mensagemDeConfirmacaoResolve(itens, configuracao) {
  const semIdentificacao = itens.filter((item) => !item.identificacao).length;
  const detalheIdentificacao = semIdentificacao === 0 ? ""
    : semIdentificacao === itens.length ? " Todas serão enviadas sem identificacaoNota."
    : ` ${semIdentificacao} dela(s) será(ão) enviada(s) sem identificacaoNota.`;
  const detalheNacional = configuracao.nacional
    ? ` Modo Nacional ativo: consulta de eventos e espera de ${configuracao.esperaNacional / 1000}s antes do resolve.`
    : "";
  const detalheVerificacao = configuracao.verificar
    ? ` A situação será conferida na rota de consulta em até ${configuracao.verificacoes} verificação(ões).`
    : " A conferência pós resolve está desligada: o resultado refletirá apenas a resposta HTTP.";
  return `Serão processadas ${itens.length} nota(s).${detalheIdentificacao}${detalheNacional}${detalheVerificacao} Deseja continuar?`;
}

export function idsComFalha(resultados) {
  return resultados.filter((linha) => !linha.sucesso).map((linha) => linha.id);
}

export const CABECALHO_CSV_RESOLVE = ["ID", "Identificacao enviada", "Situacao antes", "Situacao depois", "Status HTTP", "Resultado", "Mensagem", "Tempo (ms)", "Data e hora"];

export function linhasCsvResolve(resultados) {
  return resultados.map((linha) => [
    linha.id, linha.identificacao, linha.situacaoAntes, linha.situacaoDepois,
    linha.status ?? "", linha.rotulo, linha.mensagem, linha.duracaoMs, linha.quando
  ]);
}

export function resumoParaTicket({ resultados, contadores, autor, quando }) {
  const { feitas, sucessos, falhas } = contadores;
  const linhas = [
    `Resolve em lote executado em ${quando}${autor ? ` por ${autor}` : ""}`,
    `Notas processadas: ${feitas} | Sucesso: ${sucessos} | Falha: ${falhas}`,
    ""
  ];

  const agrupado = new Map();
  resultados.forEach((linha) => {
    if (!agrupado.has(linha.rotulo)) agrupado.set(linha.rotulo, []);
    agrupado.get(linha.rotulo).push(linha);
  });

  agrupado.forEach((lista, rotulo) => {
    linhas.push(`${rotulo} (${lista.length}):`);
    lista.forEach((linha) => {
      const situacao = linha.situacaoDepois ? ` situacao ${linha.situacaoDepois}` : "";
      const mensagem = linha.mensagem ? ` - ${linha.mensagem}` : "";
      linhas.push(`  ${linha.id}${situacao}${mensagem}`);
    });
    linhas.push("");
  });

  return linhas.join("\n").trim();
}

export async function executarLoteResolve({ itens, apiKey, configuracao, sessao, aoMudarEstagio, aoLerSituacaoAntes, aoConcluir }) {
  const lote = {
    apiKey, configuracao, sessao, aoMudarEstagio, aoLerSituacaoAntes, aoConcluir,
    pool: criarPoolExecucao(CONCORRENCIA_RESOLVE)
  };
  registrarLog(`Resolve iniciado: ${itens.length} nota(s), até ${configuracao.tentativas} tentativa(s), intervalo de ${configuracao.intervalo}ms.`);

  if (configuracao.nacional) await processarNacional(lote, itens);
  else await lote.pool.executar(itens, (item, posicao) => tratarNota(lote, item, posicao), () => sessao.cancelada);
}

function concluirItem(lote, posicao, resultado) {
  lote.pool.restaurar();
  lote.aoConcluir(posicao, resultado);
}

async function processarNacional(lote, itens) {
  const { configuracao, sessao, pool } = lote;
  registrarLog(`Nacional ativo: consultando eventos de ${itens.length} nota(s).`);
  const comFalha = new Set();

  await pool.executar(itens, async (item, posicao) => {
    lote.aoMudarEstagio(posicao, "evento");
    const evento = await consultarEventos({
      id: item.id, apiKey: lote.apiKey, sessao,
      tentativas: configuracao.tentativas, intervalo: configuracao.intervalo
    });
    if (!evento.ok && evento.mensagem !== "Cancelado") {
      comFalha.add(posicao);
      concluirItem(lote, posicao, {
        id: item.id, identificacao: item.identificacao, situacaoAntes: "", situacaoDepois: "",
        status: evento.status ?? null, ...DESFECHO_FALHA_NOS_EVENTOS,
        mensagem: evento.mensagem, duracaoMs: 0
      });
    }
  }, () => sessao.cancelada);

  if (sessao.cancelada) return;

  const pendentes = itens
    .map((item, posicao) => ({ item, posicao }))
    .filter((entrada) => !comFalha.has(entrada.posicao));

  registrarLog(`Aguardando ${configuracao.esperaNacional / 1000}s para o Nacional processar os eventos.`, "warn");
  pendentes.forEach((entrada) => lote.aoMudarEstagio(entrada.posicao, "aguardando"));
  await pausar(configuracao.esperaNacional);
  if (sessao.cancelada) return;

  await pool.executar(pendentes,
    (entrada) => tratarNota(lote, entrada.item, entrada.posicao),
    () => sessao.cancelada);
}

async function tratarNota(lote, item, posicao) {
  const { configuracao, sessao } = lote;
  const inicio = performance.now();
  const duracao = () => Math.round(performance.now() - inicio);
  let situacaoAntes = "";
  if (configuracao.verificar) {
    lote.aoMudarEstagio(posicao, "consultando");
    const leitura = await consultarNota({ identificador: item.id, apiKey: lote.apiKey, sessao });
    situacaoAntes = leitura.nota?.situacao || "";
    if (situacaoAntes) {
      registrarLog(`ID ${item.id}: situação antes do resolve: ${situacaoAntes}.`);
      lote.aoLerSituacaoAntes(posicao, situacaoAntes);
    }
  }
  const base = { id: item.id, identificacao: item.identificacao, situacaoAntes };

  lote.aoMudarEstagio(posicao, "processando");
  const resolve = await executarResolve({
    id: item.id, identificacao: item.identificacao, apiKey: lote.apiKey, sessao,
    tentativas: configuracao.tentativas, intervalo: configuracao.intervalo,
    aoReduzirRitmo: () => lote.pool.reduzir()
  });

  if (resolve.desfecho === "cancelado") {
    concluirItem(lote, posicao, { ...base, situacaoDepois: "", status: null, ...DESFECHO_CANCELADO, mensagem: resolve.mensagem, duracaoMs: duracao() });
    return;
  }

  const resolveOk = resolve.desfecho === "solicitado";

  if (!configuracao.verificar) {
    concluirItem(lote, posicao, {
      ...base, situacaoDepois: "", status: resolve.status,
      ...definirDesfechoSemConferencia(resolve.desfecho), mensagem: resolve.mensagem, duracaoMs: duracao()
    });
    return;
  }

  lote.aoMudarEstagio(posicao, "verificando");
  const conferencia = await conferirSituacao(lote, item.id, limiteDeVerificacoes(configuracao, resolveOk), situacaoAntes);
  concluirItem(lote, posicao, {
    ...base, situacaoDepois: conferencia.situacao, status: resolve.status,
    ...definirDesfecho({ situacaoAntes, situacaoDepois: conferencia.situacao, resolveOk }),
    mensagem: conferencia.mensagem || resolve.mensagem, duracaoMs: duracao()
  });
}

async function conferirSituacao(lote, id, limite, situacaoAntes) {
  let situacao = "";
  let mensagem = "";

  for (let tentativa = 1; tentativa <= limite; tentativa++) {
    if (lote.sessao.cancelada) break;
    if (tentativa > 1) await pausar(lote.configuracao.intervaloVerificacao);

    const leitura = await consultarNota({ identificador: id, apiKey: lote.apiKey, sessao: lote.sessao });
    situacao = leitura.nota?.situacao || situacao;
    mensagem = leitura.nota?.mensagem || leitura.mensagem || mensagem;
    registrarLog(`ID ${id}: verificação ${tentativa}/${limite} retornou ${situacao || "situação vazia"}.`);

    if (conferenciaEncerrada(situacao, situacaoAntes)) break;
  }

  return { situacao, mensagem };
}
