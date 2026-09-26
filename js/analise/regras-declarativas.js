import { achado } from "./achado.js";
import { resolverCaminho, preenchido } from "./caminhos.js";

const FONTE_PADRAO_DAS_REGRAS = "definicoes/regras-validacao.json";

const CONFERENCIAS_POR_VALOR = {
  formato: (regra, texto) => (new RegExp(regra.expressao).test(texto) ? null : `${regra.mensagem} Valor informado: ${texto}.`),
  tamanho: (regra, texto) => ((regra.minimo && texto.length < regra.minimo) || (regra.maximo && texto.length > regra.maximo)
    ? `${regra.mensagem} O valor tem ${texto.length} caracteres.` : null),
  faixa: (regra, texto, valor) => {
    const numero = Number(valor);
    const fora = !Number.isFinite(numero) || (regra.minimo !== undefined && numero < regra.minimo) || (regra.maximo !== undefined && numero > regra.maximo);
    return fora ? `${regra.mensagem} Valor informado: ${texto}.` : null;
  },
  enumerado: (regra, texto) => ((regra.valores || []).map(String).includes(texto) ? null : `${regra.mensagem} Valor informado: ${texto}.`),
  digitos: (regra, texto) => {
    const digitos = texto.replace(/\D/g, "");
    return [].concat(regra.quantidade).includes(digitos.length) ? null : `${regra.mensagem} O valor informado tem ${digitos.length} dígito(s).`;
  }
};

export function aplicarRegrasDeclarativas(nota, contexto, registrar) {
  contexto.regrasDeclarativas.forEach((regra) => aplicarRegra(nota, regra).forEach(registrar));
}

function aplicarRegra(documento, regra) {
  const resultados = [];
  const registrar = (campo, detalhe) => resultados.push(
    achado(regra.severidade, regra.titulo, campo, detalhe, regra.fonte || FONTE_PADRAO_DAS_REGRAS, regra.tags || []));
  if (regra.tipo === "condicional") conferirCondicional(documento, regra, registrar);
  else if (regra.tipo === "umDeles") conferirUmDeles(documento, regra, registrar);
  else if (regra.tipo === "obrigatorio") conferirObrigatorio(documento, regra, registrar);
  else conferirCadaValor(documento, regra, registrar);
  return resultados;
}

function conferirCondicional(documento, regra, registrar) {
  const relativo = regra.exige.replace(/^.*\[\]\./, "");
  resolverCaminho(documento, regra.campo).forEach(({ valor, caminho }) => {
    const dispara = regra.quandoPreenchido ? preenchido(valor) : (regra.quandoValorEm || []).map(String).includes(String(valor));
    if (!dispara) return;
    const pai = caminho.split(".").slice(0, -1).join(".");
    const base = pai ? resolverCaminho(documento, pai.replace(/\[\d+\]/g, "[]"))
      .find((ponto) => ponto.caminho === pai)?.valor : documento;
    const exigido = relativo.split(".").reduce((atual, parte) => (atual === null || atual === undefined ? atual : atual[parte]), base);
    if (!preenchido(exigido)) registrar(pai ? `${pai}.${relativo}` : relativo, regra.mensagem);
  });
}

function conferirUmDeles(documento, regra, registrar) {
  resolverCaminho(documento, regra.campo).forEach(({ valor, caminho }) => {
    if (!valor || typeof valor !== "object") return;
    if (!(regra.alternativas || []).some((chave) => preenchido(valor[chave]))) {
      registrar(`${caminho}.${(regra.alternativas || []).join(" ou ")}`, regra.mensagem);
    }
  });
}

function conferirObrigatorio(documento, regra, registrar) {
  if (!resolverCaminho(documento, regra.campo).some(({ valor }) => preenchido(valor))) registrar(regra.campo, regra.mensagem);
}

function conferirCadaValor(documento, regra, registrar) {
  if (!Object.hasOwn(CONFERENCIAS_POR_VALOR, regra.tipo)) return;
  const conferir = CONFERENCIAS_POR_VALOR[regra.tipo];
  resolverCaminho(documento, regra.campo).forEach(({ valor, caminho }) => {
    if (!preenchido(valor) || typeof valor === "object") return;
    const detalhe = conferir(regra, String(valor), valor);
    if (detalhe) registrar(caminho, detalhe);
  });
}
