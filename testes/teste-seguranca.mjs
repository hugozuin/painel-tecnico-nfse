import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import https from "node:https";
import path from "node:path";
import { JSDOM } from "jsdom";

let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};

const listarArquivos = (pasta, extensoes) => readdirSync(pasta).flatMap((nome) => {
  const caminho = path.join(pasta, nome).replaceAll("\\", "/");
  if (statSync(caminho).isDirectory()) return listarArquivos(caminho, extensoes);
  return extensoes.some((extensao) => caminho.endsWith(extensao)) ? [caminho] : [];
});

const procurar = (arquivos, padrao) => arquivos.flatMap((arquivo) =>
  readFileSync(arquivo, "utf8").split("\n").flatMap((linha, indice) =>
    padrao.test(linha) ? [`${arquivo}:${indice + 1}`] : []));

const codigoDoSite = [...listarArquivos("js", [".js"]), ...listarArquivos("api", [".js"])];

console.log("\n== DOM: nada de marcação montada por texto ==");
const SINKS_PROIBIDOS = {
  innerHTML: /\binnerHTML\b/,
  outerHTML: /\bouterHTML\b/,
  insertAdjacentHTML: /\binsertAdjacentHTML\b/,
  "document.write": /\bdocument\.write(?:ln)?\s*\(/,
  eval: /(?:^|[^\w.$])eval\s*\(/,
  "new Function": /\bnew\s+Function\b|(?:^|[^\w.$])Function\s*\(/,
  "setTimeout ou setInterval com texto": /\bset(?:Timeout|Interval)\s*\(\s*["'`]/,
  "setAttribute de estilo ou evento": /\bsetAttribute\s*\(\s*["'`](?:style|on\w+)["'`]/i,
  "javascript:": /javascript:/i,
  srcdoc: /\bsrcdoc\b/,
  createContextualFragment: /\bcreateContextualFragment\b/
};
const exemplosProibidos = {
  innerHTML: 'caixa.innerHTML = valor;',
  outerHTML: "const x = no.outerHTML;",
  insertAdjacentHTML: 'no.insertAdjacentHTML("beforeend", x);',
  "document.write": "document.write(x);",
  eval: "eval(x);",
  "new Function": 'const f = new Function("return 1");',
  "setTimeout ou setInterval com texto": 'setTimeout("alerta()", 10);',
  "setAttribute de estilo ou evento": 'no.setAttribute("onclick", x);',
  "javascript:": 'link.href = "javascript:void(0)";',
  srcdoc: "quadro.srcdoc = x;",
  createContextualFragment: "faixa.createContextualFragment(x);"
};
conferir("cada padrão proibido reconhece o próprio exemplo",
  Object.entries(SINKS_PROIBIDOS).every(([nome, padrao]) => padrao.test(exemplosProibidos[nome])));
conferir("padrões não confundem uso legítimo",
  !Object.values(SINKS_PROIBIDOS).some((padrao) => padrao.test('alvo.textContent = valor; setTimeout(() => acao(), 10); no.setAttribute("aria-label", x);')));
for (const [nome, padrao] of Object.entries(SINKS_PROIBIDOS)) {
  const ocorrencias = procurar(codigoDoSite, padrao);
  conferir(`sem ${nome} em js/ e api/`, ocorrencias.length === 0, ocorrencias.join(", "));
}

console.log("\n== integridade do forge ==");
const SHA256_FORGE = "d9b9074e6861200d676e25dcfe97889db5e8f4150bb766d29c491ad709a51b58";
const domCertificado = new JSDOM('<!DOCTYPE html><div id="tela"></div>', { url: "https://painel.local/" });
global.window = domCertificado.window;
global.document = domCertificado.window.document;
const { BIBLIOTECA_FORGE, montarCartaoCertificado } = await import("../js/certificado.js");
const versaoForgeDosTestes = JSON.parse(readFileSync("testes/package.json", "utf8")).devDependencies["node-forge"];
conferir("forge existe no caminho que a tela carrega", existsSync(BIBLIOTECA_FORGE.endereco), BIBLIOTECA_FORGE.endereco);
conferir("nenhuma cópia sem versão no nome", !existsSync("assets/vendor/forge.min.js"));
conferir("nome do arquivo traz a versão do node-forge dos testes", BIBLIOTECA_FORGE.endereco.endsWith(`forge-${versaoForgeDosTestes}.min.js`), versaoForgeDosTestes);
const bytesForge = existsSync(BIBLIOTECA_FORGE.endereco) ? readFileSync(BIBLIOTECA_FORGE.endereco) : Buffer.alloc(0);
conferir("SHA-256 do forge igual ao registrado", createHash("sha256").update(bytesForge).digest("hex") === SHA256_FORGE);
conferir("SRI do carregamento igual ao do arquivo", `sha384-${createHash("sha384").update(bytesForge).digest("base64")}` === BIBLIOTECA_FORGE.integridade);
const forgeDoNpm = "testes/node_modules/node-forge/dist/forge.min.js";
if (existsSync(forgeDoNpm)) {
  conferir("idêntico ao forge.min.js distribuído no npm", Buffer.compare(bytesForge, readFileSync(forgeDoNpm)) === 0);
}
const telaCertificado = document.getElementById("tela");
montarCartaoCertificado(telaCertificado);
Object.defineProperty(telaCertificado.querySelector('input[type="file"]'), "files", {
  value: [new domCertificado.window.File(["pfx"], "certificado.pfx")]
});
[...telaCertificado.querySelectorAll("button")].find((botao) => botao.textContent === "Carregar certificado").click();
await new Promise((pronto) => setTimeout(pronto, 20));
const scriptForge = document.head.querySelector("script");
conferir("tela carrega o forge pelo caminho versionado", scriptForge?.getAttribute("src") === BIBLIOTECA_FORGE.endereco, scriptForge?.getAttribute("src"));
conferir("tela exige a integridade (SRI) do forge", scriptForge?.integrity === BIBLIOTECA_FORGE.integridade);

console.log("\n== API Key só para a API PlugNotas ==");
const { requisitar, ORIGEM_PLUGNOTAS } = await import("../js/plugnotas.js");
const enviados = [];
global.fetch = async (url, opcoes = {}) => {
  enviados.push({ url: String(url), chave: opcoes.headers?.["x-api-key"] ?? null });
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => '{"message":"ok"}' };
};
const pedirComChave = async (url) => {
  enviados.length = 0;
  return requisitar({ url, apiKey: "chave-de-teste" });
};
for (const url of [`${ORIGEM_PLUGNOTAS}/nfse/consultar/X1`, "https://API.PLUGNOTAS.COM.BR:443/nfse/X1"]) {
  const resposta = await pedirComChave(url);
  conferir(`chave segue para ${url}`, resposta.ok && enviados.length === 1 && enviados[0].chave === "chave-de-teste");
}
const destinosRecusados = [
  "https://exemplo.invalid/nfse/X1",
  "https://api.plugnotas.com.br.exemplo.invalid/nfse/X1",
  "https://api.plugnotas.com.br@exemplo.invalid/nfse/X1",
  "http://api.plugnotas.com.br/nfse/X1",
  "https://api.plugnotas.com.br:8443/nfse/X1",
  "//exemplo.invalid/nfse/X1",
  "api/proxy?url=https%3A%2F%2Fadn.nfse.gov.br%2Fx"
];
for (const [contexto, localizacao] of [["sem location", undefined], ["na página", domCertificado.window.location]]) {
  global.location = localizacao;
  for (const url of destinosRecusados) {
    const resposta = await pedirComChave(url);
    conferir(`recusa ${url} com chave (${contexto})`, enviados.length === 0 && resposta.falhaLocal && resposta.recusada && !resposta.ok, JSON.stringify(enviados));
  }
}
enviados.length = 0;
const semChave = await requisitar({ url: "api/proxy?url=x" });
conferir("repasse sem chave segue normalmente", semChave.ok && enviados.length === 1 && enviados[0].chave === null);
delete global.location;

console.log("\n== cabeçalhos das respostas do repasse ==");
const { default: repasse, cabecalhosDaResposta } = await import("../api/proxy.js");
const chamarRepasse = async (requisicao) => {
  const registro = { cabecalhos: {} };
  const resposta = {
    status(codigo) { registro.status = codigo; return this; },
    json(corpo) { registro.corpo = corpo; return this; },
    send(corpo) { registro.corpo = corpo; return this; },
    setHeader(nome, valor) { registro.cabecalhos[nome] = valor; return this; }
  };
  await repasse({ headers: {}, query: {}, ...requisicao }, resposta);
  return registro;
};
const protegeResposta = (cabecalhos) =>
  cabecalhos["Content-Security-Policy"] === "default-src 'none'; sandbox"
  && cabecalhos["X-Content-Type-Options"] === "nosniff"
  && cabecalhos["Cache-Control"] === "no-store";
const respostasDeErro = {
  "405": await chamarRepasse({ method: "PUT" }),
  "400": await chamarRepasse({ method: "GET" }),
  "403": await chamarRepasse({ method: "GET", query: { url: "https://exemplo.invalid/x" } })
};
for (const [codigo, registro] of Object.entries(respostasDeErro)) {
  conferir(`resposta ${codigo} do repasse sai com CSP sandbox, nosniff e no-store`, registro.status === Number(codigo) && protegeResposta(registro.cabecalhos), JSON.stringify(registro.cabecalhos));
}
const requestOriginal = https.request;
const simularNacional = ({ status = 200, tipo, partes }) => {
  const pedidosAoNacional = [];
  https.request = (endereco, opcoes, aoResponder) => {
    const pedido = new EventEmitter();
    pedidosAoNacional.push({ endereco: String(endereco), opcoes });
    pedido.destroy = () => { pedido.destruido = true; };
    pedido.end = () => setImmediate(() => {
      const resposta = new EventEmitter();
      resposta.statusCode = status;
      resposta.headers = { "content-type": tipo };
      aoResponder(resposta);
      for (const parte of partes) {
        if (pedido.destruido) return;
        resposta.emit("data", parte);
      }
      resposta.emit("end");
    });
    return pedido;
  };
  return pedidosAoNacional;
};
simularNacional({ tipo: "text/html; charset=utf-8", partes: [Buffer.from("<p>pagina</p>")] });
const sucessoHtml = await chamarRepasse({ method: "GET", query: { url: "https://adn.nfse.gov.br/x" } });
conferir("resposta HTML do Nacional sai protegida e como download",
  sucessoHtml.status === 200 && protegeResposta(sucessoHtml.cabecalhos) && sucessoHtml.cabecalhos["Content-Disposition"] === "attachment" && sucessoHtml.cabecalhos["Content-Type"] === "text/html; charset=utf-8",
  JSON.stringify(sucessoHtml.cabecalhos));
simularNacional({ tipo: "application/json", partes: [Buffer.from('{"ok":true}')] });
const sucessoJson = await chamarRepasse({ method: "GET", query: { url: "https://adn.nfse.gov.br/x" } });
conferir("resposta JSON do Nacional sai protegida e sem download forçado",
  sucessoJson.status === 200 && protegeResposta(sucessoJson.cabecalhos) && !sucessoJson.cabecalhos["Content-Disposition"] && String(sucessoJson.corpo) === '{"ok":true}');
https.request = requestOriginal;
for (const tipo of ["text/html", "TEXT/HTML; charset=utf-8", "application/xhtml+xml", "image/svg+xml"]) {
  const cabecalhos = cabecalhosDaResposta(tipo);
  conferir(`${tipo} do Nacional vira download`, cabecalhos["Content-Disposition"] === "attachment" && protegeResposta(cabecalhos));
}
for (const tipo of ["application/json", "application/pdf", "application/xml", "text/plain", "text/htmlx", ""]) {
  const cabecalhos = cabecalhosDaResposta(tipo);
  conferir(`${tipo || "tipo vazio"} segue sem download forçado e protegido`, !cabecalhos["Content-Disposition"] && protegeResposta(cabecalhos));
}

console.log(falhas === 0 ? "\nTeste de segurança passou." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
