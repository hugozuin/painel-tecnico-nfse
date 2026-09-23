/* As definições ficam em arquivos versionados. A aplicação usa a cópia
   publicada com ela e, quando a atualização remota está ligada, tenta a
   versão mais recente do repositório. Conteúdo remoto só substitui o local
   depois de passar na conferência de formato. O de-para e as tabelas do
   IBS e da CBS são maiores e carregam só quando alguma tela precisa. */

import { registrarLog } from "./shared.js";

export const definicoes = {
  config: null,
  rotas: null,
  rotasNacional: null,
  regras: null,
  dePara: null,
  ibscbs: null,
  origem: {}
};

const validadores = {
  rotas: (dados) => {
    if (!dados || typeof dados.base !== "string" || !Array.isArray(dados.rotas)) return "estrutura fora do formato";
    const invalida = dados.rotas.find((rota) => !rota.id || !rota.titulo || (!rota.tela && !rota.caminho));
    return invalida ? `rota sem id, título ou caminho: ${invalida.id || "sem id"}` : "";
  },
  "rotas-nacional": (dados) => {
    if (!dados || !Array.isArray(dados.ambientes) || !Array.isArray(dados.rotas)) return "estrutura fora do formato";
    const invalida = dados.rotas.find((rota) => !rota.servidor || !rota.caminho);
    return invalida ? `rota sem servidor ou caminho: ${invalida.id || "sem id"}` : "";
  },
  "regras-validacao": (dados) => {
    if (!dados || !Array.isArray(dados.regras)) return "estrutura fora do formato";
    const invalida = dados.regras.find((regra) => !regra.tipo || !regra.id);
    return invalida ? `regra sem id ou tipo: ${invalida.id || "sem id"}` : "";
  },
  "de-para-nacional": (dados) => {
    if (!dados || !Array.isArray(dados.entradas)) return "estrutura fora do formato";
    return dados.entradas.some((entrada) => !entrada.tag || typeof entrada.caminho !== "string" || !Array.isArray(entrada.regras))
      ? "entrada sem tag, caminho ou regras"
      : "";
  },
  ibscbs: (dados) => {
    if (!dados || typeof dados.indOp !== "object" || typeof dados.itens !== "object" || !Array.isArray(dados.relacoes)) {
      return "estrutura fora do formato";
    }
    return "";
  }
};

async function lerLocal(nome) {
  const resposta = await fetch(`definicoes/${nome}.json`, { cache: "no-cache" });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.json();
}

async function lerRemoto(nome, config) {
  const endereco = `https://raw.githubusercontent.com/${config.repositorio}/${config.branch}/${config.pasta || "definicoes"}/${nome}.json?t=${Date.now()}`;
  const resposta = await fetch(endereco, { cache: "no-store" });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.json();
}

async function carregarArquivo(nome, config) {
  const validar = validadores[nome];
  const local = await lerLocal(nome);
  const problemaLocal = validar(local);
  if (problemaLocal) registrarLog(`Definição local ${nome} com problema: ${problemaLocal}`, "error");

  if (!config?.atualizacaoRemota || !config?.repositorio) {
    definicoes.origem[nome] = { origem: "publicada", versao: local.versao };
    return local;
  }

  try {
    const remoto = await lerRemoto(nome, config);
    const problema = validar(remoto);
    if (problema) {
      registrarLog(`Definição remota ${nome} ignorada: ${problema}.`, "warn");
      definicoes.origem[nome] = { origem: "publicada", versao: local.versao, aviso: problema };
      return local;
    }
    definicoes.origem[nome] = { origem: "repositório", versao: remoto.versao };
    return remoto;
  } catch (erro) {
    definicoes.origem[nome] = { origem: "publicada", versao: local.versao, aviso: erro.message };
    return local;
  }
}

export async function carregarDefinicoes() {
  try {
    definicoes.config = await lerLocal("config");
  } catch {
    definicoes.config = { atualizacaoRemota: false };
  }

  const [rotas, rotasNacional, regras] = await Promise.all([
    carregarArquivo("rotas", definicoes.config),
    carregarArquivo("rotas-nacional", definicoes.config),
    carregarArquivo("regras-validacao", definicoes.config)
  ]);
  definicoes.rotas = rotas;
  definicoes.rotasNacional = rotasNacional;
  definicoes.regras = regras;
  informarOrigem(["rotas", "rotas-nacional", "regras-validacao"]);
  return definicoes;
}

const destinoSobDemanda = { "de-para-nacional": "dePara", ibscbs: "ibscbs" };
const carregamentos = new Map();

export function carregarDefinicao(nome) {
  if (!carregamentos.has(nome)) {
    carregamentos.set(nome, (async () => {
      try {
        const dados = await carregarArquivo(nome, definicoes.config);
        definicoes[destinoSobDemanda[nome]] = dados;
        informarOrigem([nome]);
        return dados;
      } catch (erro) {
        registrarLog(`Falha ao carregar ${nome}: ${erro.message}`, "error");
        carregamentos.delete(nome);
        return null;
      }
    })());
  }
  return carregamentos.get(nome);
}

function informarOrigem(nomes) {
  const doRepositorio = nomes.filter((nome) => definicoes.origem[nome]?.origem === "repositório");
  registrarLog(doRepositorio.length
    ? `Definições atualizadas pelo repositório: ${doRepositorio.join(", ")}.`
    : `Definições carregadas da cópia publicada: ${nomes.join(", ")}.`);
}

export function enderecoRepositorio() {
  const config = definicoes.config;
  return config?.repositorio ? `https://github.com/${config.repositorio}` : "";
}

export function resumoOrigem() {
  return Object.entries(definicoes.origem).map(([arquivo, dado]) => ({ arquivo, ...dado }));
}
