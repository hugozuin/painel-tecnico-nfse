const Module = require("module");
const path = require("path");

const [pastaProps, modo = "real"] = process.argv.slice(2);
const raizProps = path.resolve(pastaProps);
const marcado = modo === "marcado";

const MARCA_ARREDONDAMENTO = "⟦R⟧";
const vazio = (valor) => valor === undefined || valor === null || valor === "";

function arredondamento(valor) {
  if (vazio(valor)) return "";
  if (marcado) return `${MARCA_ARREDONDAMENTO}${valor}`;
  const numero = Number(valor);
  return Number.isFinite(numero) ? String(Math.round(numero * 100) / 100) : String(valor);
}

function formatarData({ date, tz, format }) {
  if (vazio(date)) return "";
  if (marcado) return `⟦D:${format}:${tz}⟧${date}`;
  const texto = String(date);
  return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : new Date(texto).toISOString().slice(0, 10);
}

const substitutos = {
  dateTimeZoneUtils: { dateTimeZoneUtils: { formatDate: formatarData } },
  utils: { formatRounding: arredondamento }
};

const requerer = Module.prototype.require;
Module.prototype.require = function (pedido) {
  const alvo = path.resolve(path.dirname(this.filename), pedido);
  const nome = path.basename(pedido);
  if (!alvo.startsWith(raizProps) && substitutos[nome]) return substitutos[nome];
  return requerer.apply(this, arguments);
};

const props = require(path.join(raizProps, "index.js"));
const primeiroServico = (nota) => (Array.isArray(nota.servico) ? nota.servico[0] : nota.servico) || undefined;

const CHAMADAS = [
  ["prestador", "getPrestadorProps", (nota) => [nota.prestador]],
  ["tomador", "getTomadorProps", (nota) => [nota.tomador]],
  ["intermediario", "getIntermediarioProps", (nota) => [nota.intermediario]],
  ["servico", "getServicoProps", (nota) => [primeiroServico(nota), { versaoEsquema: nota.versaoEsquema }]],
  ["ibscbs", "getIbsCbsProps", (nota) => [primeiroServico(nota)?.ibscbs]]
];

function aplicar(nota) {
  const resultado = { erros: [] };
  for (const [grupo, funcao, argumentos] of CHAMADAS) {
    if (typeof props[funcao] !== "function") continue;
    try {
      resultado[grupo] = props[funcao](...argumentos(nota));
    } catch {
      resultado.erros.push(funcao);
    }
  }
  if (typeof props.getDeducaoProps === "function") {
    try {
      resultado.deducao = (Array.isArray(nota.deducao) ? nota.deducao : []).map((item) => props.getDeducaoProps(item));
    } catch {
      resultado.erros.push("getDeducaoProps");
    }
  }
  return resultado;
}

let entrada = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (parte) => { entrada += parte; });
process.stdin.on("end", () => {
  const notas = JSON.parse(entrada);
  process.stdout.write(JSON.stringify(notas.map(aplicar)));
});
