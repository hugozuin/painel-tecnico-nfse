import { achado } from "./achado.js";
import { resolverCaminho, preenchido } from "./caminhos.js";

export function aplicarRegrasDeclarativas(nota, contexto, registrar) {
  contexto.regrasDeclarativas.forEach((regra) => aplicarRegra(nota, regra).forEach(registrar));
}

function aplicarRegra(documento, regra) {
  const resultados = [];
  const tags = regra.tags || [];
  const fonte = regra.fonte || "definicoes/regras-validacao.json";
  const registrar = (campo, detalhe) => resultados.push(achado(regra.severidade, regra.titulo, campo, detalhe, fonte, tags));

  if (regra.tipo === "condicional") {
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
    return resultados;
  }

  if (regra.tipo === "umDeles") {
    resolverCaminho(documento, regra.campo).forEach(({ valor, caminho }) => {
      if (!valor || typeof valor !== "object") return;
      if (!(regra.alternativas || []).some((chave) => preenchido(valor[chave]))) {
        registrar(`${caminho}.${(regra.alternativas || []).join(" ou ")}`, regra.mensagem);
      }
    });
    return resultados;
  }

  const alvos = resolverCaminho(documento, regra.campo);
  if (regra.tipo === "obrigatorio") {
    if (!alvos.some(({ valor }) => preenchido(valor))) registrar(regra.campo, regra.mensagem);
    return resultados;
  }

  alvos.forEach(({ valor, caminho }) => {
    if (!preenchido(valor) || typeof valor === "object") return;
    const texto = String(valor);
    if (regra.tipo === "formato" && !new RegExp(regra.expressao).test(texto)) {
      registrar(caminho, `${regra.mensagem} Valor informado: ${texto}.`);
    }
    if (regra.tipo === "tamanho" && ((regra.minimo && texto.length < regra.minimo) || (regra.maximo && texto.length > regra.maximo))) {
      registrar(caminho, `${regra.mensagem} O valor tem ${texto.length} caracteres.`);
    }
    if (regra.tipo === "faixa") {
      const numero = Number(valor);
      if (!Number.isFinite(numero) || (regra.minimo !== undefined && numero < regra.minimo) || (regra.maximo !== undefined && numero > regra.maximo)) {
        registrar(caminho, `${regra.mensagem} Valor informado: ${texto}.`);
      }
    }
    if (regra.tipo === "enumerado" && !(regra.valores || []).map(String).includes(texto)) {
      registrar(caminho, `${regra.mensagem} Valor informado: ${texto}.`);
    }
    if (regra.tipo === "digitos") {
      const quantidades = [].concat(regra.quantidade);
      const digitos = texto.replace(/\D/g, "");
      if (!quantidades.includes(digitos.length)) {
        registrar(caminho, `${regra.mensagem} O valor informado tem ${digitos.length} dígito(s).`);
      }
    }
  });
  return resultados;
}
