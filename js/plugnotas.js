/* Cliente da API PlugNotas. Todas as requisições saem do navegador do
   consultor direto para a API, levando a chave informada na interface. */

import { pausar, registrarLog } from "./shared.js";

export const ORIGEM_PLUGNOTAS = "https://api.plugnotas.com.br";

export const API = {
  resolve: `${ORIGEM_PLUGNOTAS}/nfse/resolve`,
  eventos: `${ORIGEM_PLUGNOTAS}/nfse/eventos`,
  consultaResumida: `${ORIGEM_PLUGNOTAS}/nfse/consultar`,
  consultaCompleta: `${ORIGEM_PLUGNOTAS}/nfse`
};

export const TEMPO_LIMITE_MS = 120000;
export const STATUS_TEMPORARIOS = [429, 500, 502, 503];
export const ESPERA_RESOLVE_MS = 10000;
export const MAXIMO_VERIFICACOES_RESOLVE = 12;
export const RESOLVE_EM_ANDAMENTO = /sendo executad/i;

export function criarSessaoRequisicoes() {
  const controladores = new Set();
  return {
    cancelada: false,
    controladores,
    cancelar() {
      this.cancelada = true;
      controladores.forEach((controlador) => controlador.abort("cancelamento"));
    },
    reiniciar() {
      this.cancelada = false;
      controladores.clear();
    }
  };
}

/* Executa uma requisição única com timeout e devolve status, corpo e
   mensagem já extraída. Não aplica retry: isso é responsabilidade de quem chama.
   Com comoBlob, devolve o arquivo em vez de tentar interpretar JSON. */
export function podeLevarApiKey(url) {
  try {
    return new URL(url, globalThis.location?.href).origin === ORIGEM_PLUGNOTAS;
  } catch {
    return false;
  }
}

export async function requisitar({ url, metodo = "GET", corpo, apiKey, sessao, comoBlob = false }) {
  if (apiKey && !podeLevarApiKey(url)) {
    return {
      ok: false,
      status: null,
      dados: null,
      falhaLocal: true,
      recusada: true,
      excedeuTempo: false,
      mensagem: `Requisição recusada: a API Key só pode seguir para ${ORIGEM_PLUGNOTAS}.`,
      duracaoMs: 0
    };
  }

  const controlador = new AbortController();
  sessao?.controladores.add(controlador);
  const temporizador = setTimeout(() => controlador.abort("tempoLimite"), TEMPO_LIMITE_MS);
  const inicio = performance.now();

  try {
    const cabecalhos = {};
    if (apiKey) cabecalhos["x-api-key"] = apiKey;
    if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";

    const resposta = await fetch(url, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: controlador.signal
    });

    const base = {
      ok: resposta.ok,
      status: resposta.status,
      tipo: resposta.headers?.get?.("content-type") || "",
      esperaSugerida: lerRetryAfter(resposta),
      duracaoMs: Math.round(performance.now() - inicio)
    };

    if (comoBlob && resposta.ok) {
      return { ...base, dados: null, mensagem: "", blob: await resposta.blob() };
    }

    let dados = null;
    let mensagem = "";
    const bruto = await resposta.text();
    if (bruto) {
      try {
        dados = JSON.parse(bruto);
        mensagem = extrairMensagem(dados);
      } catch {
        mensagem = bruto.slice(0, 300);
      }
    } else {
      mensagem = resposta.statusText || "";
    }

    return { ...base, dados, mensagem, texto: bruto };
  } catch (erro) {
    const excedeuTempo = controlador.signal.reason === "tempoLimite";
    return {
      ok: false,
      status: null,
      dados: null,
      falhaLocal: true,
      excedeuTempo,
      mensagem: excedeuTempo
        ? `Tempo limite de ${TEMPO_LIMITE_MS / 1000}s excedido`
        : (erro?.message || "Falha de rede ou bloqueio de CORS"),
      duracaoMs: Math.round(performance.now() - inicio)
    };
  } finally {
    clearTimeout(temporizador);
    sessao?.controladores.delete(controlador);
  }
}

function lerRetryAfter(resposta) {
  const cabecalho = resposta.headers.get("Retry-After");
  if (!cabecalho) return null;
  const segundos = Number(cabecalho);
  if (Number.isFinite(segundos)) return Math.max(segundos * 1000, 0);
  const data = Date.parse(cabecalho);
  return Number.isNaN(data) ? null : Math.max(data - Date.now(), 0);
}

function falhaTemporaria(resposta) {
  return (resposta.falhaLocal && !resposta.recusada) || STATUS_TEMPORARIOS.includes(resposta.status);
}

export function extrairMensagem(dados) {
  if (!dados) return "";
  if (typeof dados === "string") return dados;
  if (dados.message) return String(dados.message);
  if (dados.error?.message) return String(dados.error.message);
  if (Array.isArray(dados)) {
    const primeiro = dados[0];
    if (primeiro?.message) return String(primeiro.message);
    if (primeiro?.mensagem) return String(primeiro.mensagem);
  }
  if (dados.mensagem) return String(dados.mensagem);
  if (dados.erro) return [dados.erro, dados.dica].filter(Boolean).join(" ");
  return JSON.stringify(dados).slice(0, 200);
}

/* Consulta a situação de uma nota. A resumida traz os campos usados na
   conferência pós resolve; a completa devolve o documento inteiro. */
export async function consultarNota({ identificador, apiKey, sessao, tipo = "resumida", cnpj = "" }) {
  const alvo = cnpj
    ? `${API.consultaResumida}/${encodeURIComponent(identificador)}/${encodeURIComponent(cnpj)}`
    : tipo === "completa"
      ? `${API.consultaCompleta}/${encodeURIComponent(identificador)}`
      : `${API.consultaResumida}/${encodeURIComponent(identificador)}`;

  const resposta = await requisitar({ url: alvo, apiKey, sessao });
  return { ...resposta, url: alvo, nota: normalizarNota(resposta.dados) };
}

/* A API responde ora com objeto, ora com lista de um item. */
export function normalizarNota(dados) {
  if (!dados) return null;
  const documento = Array.isArray(dados) ? dados[0] : dados;
  if (!documento || typeof documento !== "object") return null;

  const situacao = documento.situacao || documento.status || documento.situacaoNota || "";
  return {
    situacao: String(situacao || "").toUpperCase(),
    numero: documento.numeroNfse || documento.numero || "",
    serie: documento.serie || "",
    lote: documento.lote || "",
    codigoVerificacao: documento.codigoVerificacao || "",
    protocolo: documento.protocolo || "",
    autorizacao: documento.autorizacao || documento.dataAutorizacao || "",
    idIntegracao: documento.idIntegracao || "",
    prestador: typeof documento.prestador === "string" ? documento.prestador : documento.prestador?.cpfCnpj || "",
    mensagem: documento.mensagem || documento.message || "",
    id: documento.id || ""
  };
}

/* Consulta de eventos usada antes do resolve nas notas do Nacional.
   O 400 "evento de manifestacao em processamento" faz parte do fluxo normal. */
export async function consultarEventos({ id, apiKey, sessao, tentativas, intervalo }) {
  const url = `${API.eventos}/${encodeURIComponent(id)}`;
  let tentativa = 0;

  while (true) {
    if (sessao.cancelada) return { ok: false, mensagem: "Cancelado" };
    tentativa++;
    registrarLog(`POST ${url} (consulta de eventos, tentativa ${tentativa}/${tentativas})`);
    const resposta = await requisitar({ url, metodo: "POST", corpo: { tipo: "consulta" }, apiKey, sessao });

    if (resposta.ok) {
      registrarLog(`ID ${id}: evento consultado (HTTP ${resposta.status}).`, "success");
      return { ok: true, mensagem: resposta.mensagem };
    }

    if (/em processamento/i.test(resposta.mensagem)) {
      registrarLog(`ID ${id}: evento em processamento no Nacional. Seguindo para a espera.`, "warn");
      return { ok: true, mensagem: resposta.mensagem };
    }

    if (falhaTemporaria(resposta) && tentativa < tentativas) {
      const espera = resposta.esperaSugerida ?? intervalo;
      registrarLog(`ID ${id}: falha temporária na consulta de eventos. Nova tentativa em ${espera}ms.`, "warn");
      await pausar(espera);
      continue;
    }

    registrarLog(`ID ${id}: falha na consulta de eventos (${resposta.status ?? "sem resposta"}): ${resposta.mensagem}`, "error");
    return { ok: false, mensagem: resposta.mensagem, status: resposta.status };
  }
}

/* Dispara o resolve de uma nota. Quando a API informa que o processo já
   está em execução, aguarda e tenta de novo sem consumir tentativa de erro. */
export async function executarResolve({ id, identificacao, apiKey, sessao, tentativas, intervalo, aoReduzirRitmo }) {
  const url = `${API.resolve}/${encodeURIComponent(id)}`;
  const corpo = identificacao ? { identificacaoNota: identificacao } : {};
  let tentativa = 0;
  let verificacoes = 0;

  while (true) {
    if (sessao.cancelada) return { desfecho: "cancelado", mensagem: "Processamento cancelado pelo usuário", status: null };
    tentativa++;
    registrarLog(`POST ${url} (tentativa ${tentativa}/${tentativas})`);
    const resposta = await requisitar({ url, metodo: "POST", corpo, apiKey, sessao });

    if (resposta.ok) {
      registrarLog(`ID ${id}: resolve aceito pela API (HTTP ${resposta.status}).`, "success");
      return {
        desfecho: "solicitado",
        status: resposta.status,
        mensagem: resposta.mensagem || "Solicitação de resolve recebida",
        duracaoMs: resposta.duracaoMs
      };
    }

    if (RESOLVE_EM_ANDAMENTO.test(resposta.mensagem)) {
      if (verificacoes < MAXIMO_VERIFICACOES_RESOLVE) {
        verificacoes++;
        tentativa--;
        registrarLog(`ID ${id}: resolve em andamento na API. Nova verificação em ${ESPERA_RESOLVE_MS / 1000}s (${verificacoes}/${MAXIMO_VERIFICACOES_RESOLVE}).`, "warn");
        await pausar(ESPERA_RESOLVE_MS);
        continue;
      }
      return {
        desfecho: "processando-api",
        status: resposta.status,
        mensagem: "Resolve ainda em processamento na API após a espera máxima",
        duracaoMs: resposta.duracaoMs
      };
    }

    if (resposta.status === 429) aoReduzirRitmo?.();

    if (falhaTemporaria(resposta) && tentativa < tentativas) {
      const espera = resposta.esperaSugerida ?? intervalo;
      registrarLog(`ID ${id}: ${resposta.mensagem}. Nova tentativa em ${espera}ms.`, "warn");
      await pausar(espera);
      continue;
    }

    registrarLog(`ID ${id}: resolve falhou (${resposta.status ?? "sem resposta"}): ${resposta.mensagem}`, "error");
    return {
      desfecho: "erro",
      status: resposta.status,
      mensagem: resposta.mensagem || "Erro retornado pela API",
      duracaoMs: resposta.duracaoMs
    };
  }
}
