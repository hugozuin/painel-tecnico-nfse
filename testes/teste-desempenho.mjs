import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { analisarEmissao } from "../js/analise.js";
import { buscarItens, buscarIndOp, agruparRelacoes } from "../js/telas/ibscbs.js";
import { filtrarDePara, prepararItensDePara } from "../js/telas/depara.js";

const ORCAMENTOS = {
  jsInicialGzipBytes: 49 * 1024,
  filtroDeParaMs: 50,
  buscaIbsCbsMs: 20,
  analisarEmissaoMs: 50
};

let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}${extra ? ` (${extra})` : ""}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};

function modulosDaAbertura(entrada) {
  const vistos = new Set();
  const fila = [entrada];
  while (fila.length) {
    const arquivo = fila.shift();
    if (vistos.has(arquivo)) continue;
    vistos.add(arquivo);
    const texto = readFileSync(arquivo, "utf8");
    for (const achado of texto.matchAll(/^\s*(?:import|export)\s[^;]*?from\s*["'](\.[^"']+)["']|^\s*import\s*["'](\.[^"']+)["']/gm)) {
      fila.push(path.posix.join(path.posix.dirname(arquivo), achado[1] || achado[2]));
    }
  }
  return [...vistos];
}

function medianaEmMs(acao, vezes = 30) {
  for (let aquecimento = 0; aquecimento < 5; aquecimento++) acao();
  const tempos = Array.from({ length: vezes }, () => {
    const inicio = performance.now();
    acao();
    return performance.now() - inicio;
  }).sort((a, b) => a - b);
  return tempos[Math.floor(vezes / 2)];
}

const pior = (medicoes) => Math.max(...medicoes.map(([, tempo]) => tempo));
const descrever = (medicoes) => medicoes.map(([rotulo, tempo]) => `${rotulo} ${tempo.toFixed(2)} ms`).join("; ");
const ler = (nome) => JSON.parse(readFileSync(`definicoes/${nome}.json`, "utf8"));

console.log("\n== JS carregado na abertura ==");
const controle = modulosDaAbertura("testes/teste-desempenho.mjs");
const modulos = modulosDaAbertura("js/app.js");
conferir("controle: segue imports de várias linhas e caminhos com ../", controle.includes("js/analise/valores.js") && modulos.includes("js/shared.js"));
const gzipTotal = modulos.reduce((soma, arquivo) => soma + gzipSync(readFileSync(arquivo)).length, 0);
conferir(`JS da abertura com gzip até ${ORCAMENTOS.jsInicialGzipBytes} bytes`, gzipTotal <= ORCAMENTOS.jsInicialGzipBytes, `${modulos.length} módulos, ${gzipTotal} bytes`);
conferir("telas e validador ficam fora da abertura", !modulos.some((arquivo) => arquivo.startsWith("js/telas/") || arquivo.startsWith("js/analise")), modulos.join(", "));

console.log("\n== de-para ==");
const itensDePara = prepararItensDePara(ler("de-para-nacional").entradas);
const filtros = ["", "e", "valor", "servico[].iss", "E0580", "tpRetISSQN"]
  .map((consulta) => [`"${consulta}"`, medianaEmMs(() => filtrarDePara(itensDePara, consulta, "", false))]);
conferir(`filtro do de-para abaixo de ${ORCAMENTOS.filtroDeParaMs} ms (mediana)`, pior(filtros) < ORCAMENTOS.filtroDeParaMs, descrever(filtros));

console.log("\n== relação IBS e CBS ==");
const ibscbs = ler("ibscbs");
const telaPorItem = (consulta) => buscarItens(ibscbs, consulta).slice(0, 20)
  .map((item) => agruparRelacoes(ibscbs.relacoes.filter((relacao) => relacao[0] === item), (relacao) => relacao.slice(1, 6).join("|")));
const telaPorIndOp = (consulta) => buscarIndOp(ibscbs, consulta).slice(0, 10)
  .map((codigo) => agruparRelacoes(ibscbs.relacoes.filter((relacao) => relacao[4] === codigo), (relacao) => relacao.slice(0, 4).join("|")));
const buscas = [
  ...["01.01", "1", "servicos", "a"].map((consulta) => [`item "${consulta}"`, medianaEmMs(() => telaPorItem(consulta))]),
  ...["100301", "fornecimento", "a"].map((consulta) => [`indOp "${consulta}"`, medianaEmMs(() => telaPorIndOp(consulta))])
];
conferir(`busca e relações do IBS e da CBS abaixo de ${ORCAMENTOS.buscaIbsCbsMs} ms (mediana)`, pior(buscas) < ORCAMENTOS.buscaIbsCbsMs, descrever(buscas));

console.log("\n== validador ==");
const dados = { regras: ler("regras-validacao"), dePara: ler("de-para-nacional"), ibscbs };
const notaComDezServicos = {
  prestador: { cpfCnpj: "29062609000177", endereco: { codigoCidade: "4115200", cep: "87010000" } },
  tomador: { cpfCnpj: "12345678909", email: "cliente@exemplo.com.br", endereco: { codigoCidade: "4115200", cep: "87010000" } },
  servico: Array.from({ length: 10 }, () => ({
    codigo: "010101", valor: { servico: 1000, deducoes: 10 }, discriminacao: "Servico de consultoria",
    iss: { aliquota: 2, tipoTributacao: 6, exigibilidade: 1 },
    retencao: { pis: { aliquota: 0.65, baseCalculo: 1000, valor: 6.5 }, cofins: { aliquota: 3, baseCalculo: 1000, valor: 30 } }
  })),
  ibscbs: { codigoOperacao: "100301", valores: { tributacao: { cst: "000", cct: "000001" } } }
};
const validacao = [["nota com 10 serviços", medianaEmMs(() => analisarEmissao(notaComDezServicos, dados))]];
conferir(`analisarEmissao abaixo de ${ORCAMENTOS.analisarEmissaoMs} ms (mediana)`, pior(validacao) < ORCAMENTOS.analisarEmissaoMs, descrever(validacao));

console.log(falhas === 0 ? "\nTeste de desempenho passou." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
