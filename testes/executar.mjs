import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pastaTestes = path.dirname(fileURLToPath(import.meta.url));
const raizRepositorio = path.resolve(pastaTestes, "..");
const detalhado = process.argv.includes("--detalhes");
const suites = [
  "teste.mjs",
  "teste-fluxo.mjs",
  "teste-proxy.mjs",
  "teste-interface.mjs",
  "teste-execucao.mjs",
  "teste-atualizacao.mjs",
  "teste-certificado.mjs"
];

let suitesComFalha = 0;
let verificacoes = 0;
for (const suite of suites) {
  const inicio = Date.now();
  const resultado = spawnSync(process.execPath, [path.join(pastaTestes, suite)], {
    cwd: raizRepositorio,
    encoding: "utf8",
    env: { ...process.env, NODE_EXTRA_CA_CERTS: path.join(pastaTestes, "certificados", "ca.pem") }
  });
  const saida = `${resultado.stdout || ""}${resultado.stderr || ""}`;
  const aprovadas = (saida.match(/^\s+ok\s/gm) || []).length;
  const falhou = resultado.status !== 0;
  verificacoes += aprovadas;
  console.log(`${falhou ? "FALHOU" : "passou"}  ${suite.padEnd(24)} ${String(aprovadas).padStart(3)} verificações  ${Date.now() - inicio} ms`);
  if (falhou || detalhado) {
    const relevantes = saida.split("\n").filter((linha) => detalhado || /FALHA|Error|erro inesperado/i.test(linha));
    console.log(relevantes.join("\n"));
  }
  if (falhou) suitesComFalha++;
}
console.log(suitesComFalha ? `\n${suitesComFalha} suíte(s) com falha.` : `\nTodas as suítes passaram: ${verificacoes} verificações.`);
process.exit(suitesComFalha ? 1 : 0);
