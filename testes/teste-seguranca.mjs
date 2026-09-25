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
  await repasse(Object.defineProperties({ headers: {}, query: {} }, Object.getOwnPropertyDescriptors(requisicao)), resposta);
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
for (const tipo of ["text/html", "TEXT/HTML; charset=utf-8", "application/xhtml+xml", "image/svg+xml"]) {
  const cabecalhos = cabecalhosDaResposta(tipo);
  conferir(`${tipo} do Nacional vira download`, cabecalhos["Content-Disposition"] === "attachment" && protegeResposta(cabecalhos));
}
for (const tipo of ["application/json", "application/pdf", "application/xml", "text/plain", "text/htmlx", ""]) {
  const cabecalhos = cabecalhosDaResposta(tipo);
  conferir(`${tipo || "tipo vazio"} segue sem download forçado e protegido`, !cabecalhos["Content-Disposition"] && protegeResposta(cabecalhos));
}

console.log("\n== entrada do repasse: tamanho e certificado ==");
const { problemaNoCertificado } = await import("../api/proxy.js");
const { lerCertificado } = await import("../js/certificado.js");
const forge = (await import("node-forge")).default;
const LIMITE_CORPO = 64 * 1024;
const destinoLiberado = "https://adn.nfse.gov.br/cnc/consulta/cad";
let corpoLido = false;
const porCabecalho = await chamarRepasse({
  method: "POST",
  headers: { "content-length": String(LIMITE_CORPO + 1) },
  get body() { corpoLido = true; return {}; }
});
conferir("413 pelo content-length, sem ler o corpo", porCabecalho.status === 413 && !corpoLido && protegeResposta(porCabecalho.cabecalhos), JSON.stringify(porCabecalho));
conferir("413 por corpo em texto acima de 64 KB sem content-length",
  (await chamarRepasse({ method: "POST", body: JSON.stringify({ url: destinoLiberado, sobra: "x".repeat(LIMITE_CORPO) }) })).status === 413);
conferir("413 por corpo já interpretado acima de 64 KB",
  (await chamarRepasse({ method: "POST", body: { url: destinoLiberado, sobra: "x".repeat(LIMITE_CORPO) } })).status === 413);

const certificadosDeTeste = ["cliente-legado.pfx", "cliente-moderno.pfx"].map((arquivo) =>
  lerCertificado(readFileSync(`testes/certificados/${arquivo}`), "senha123", forge));
const pemDeArquivo = (arquivo) => readFileSync(`testes/certificados/${arquivo}`, "utf8");
for (const [indice, lido] of certificadosDeTeste.entries()) {
  const corpo = JSON.stringify({ url: destinoLiberado, certificado: { chave: lido.chave, certificado: lido.certificado } });
  conferir(`PEM gerado pela tela é aceito (PFX ${indice + 1}, ${Buffer.byteLength(corpo)} bytes)`, problemaNoCertificado(lido) === "" && Buffer.byteLength(corpo) < LIMITE_CORPO / 8);
}
const [legado] = certificadosDeTeste;
const cadeiaComFimLf = legado.certificado.replaceAll("\r\n", "\n");
const casosDePem = [
  ["chave e cadeia com fim de linha LF", { chave: legado.chave.replaceAll("\r\n", "\n"), certificado: cadeiaComFimLf }, true],
  ["chave PKCS#8 (PRIVATE KEY)", { chave: pemDeArquivo("servidor.key"), certificado: pemDeArquivo("servidor.pem") + pemDeArquivo("ca.pem") }, true],
  ["chave EC PRIVATE KEY", { chave: legado.chave.replaceAll("RSA PRIVATE KEY", "EC PRIVATE KEY"), certificado: cadeiaComFimLf }, true],
  ["chave cifrada (ENCRYPTED PRIVATE KEY)", { chave: legado.chave.replaceAll("RSA PRIVATE KEY", "ENCRYPTED PRIVATE KEY"), certificado: cadeiaComFimLf }, false],
  ["chave com Proc-Type cifrado", { chave: legado.chave.replace("-----\r\n", "-----\r\nProc-Type: 4,ENCRYPTED\r\n"), certificado: cadeiaComFimLf }, false],
  ["marcadores BEGIN e END diferentes", { chave: legado.chave.replace("END RSA PRIVATE KEY", "END PRIVATE KEY"), certificado: cadeiaComFimLf }, false],
  ["texto antes da chave", { chave: `extra\n${legado.chave}`, certificado: cadeiaComFimLf }, false],
  ["só o cabeçalho da chave", { chave: "-----BEGIN RSA PRIVATE KEY-----", certificado: cadeiaComFimLf }, false],
  ["cadeia vazia", { chave: legado.chave, certificado: "" }, false],
  ["chave dentro da cadeia", { chave: legado.chave, certificado: cadeiaComFimLf + legado.chave }, false],
  ["texto depois da cadeia", { chave: legado.chave, certificado: `${cadeiaComFimLf}fim` }, false],
  ["cadeia com 11 certificados", { chave: legado.chave, certificado: pemDeArquivo("ca.pem").repeat(11) }, false]
];
for (const [titulo, certificado, aceito] of casosDePem) {
  const problema = problemaNoCertificado(certificado);
  conferir(`${aceito ? "aceita" : "recusa"} ${titulo}`, aceito ? problema === "" : problema !== "", problema);
}
const inicioPatologico = performance.now();
problemaNoCertificado({ chave: `-----BEGIN RSA PRIVATE KEY-----\n${"A".repeat(LIMITE_CORPO)}`, certificado: "" });
problemaNoCertificado({ chave: legado.chave, certificado: `-----BEGIN CERTIFICATE-----\n${"A\n".repeat(LIMITE_CORPO / 2)}` });
conferir("validação de PEM rápida mesmo com 64 KB malformados", performance.now() - inicioPatologico < 50, `${Math.round(performance.now() - inicioPatologico)} ms`);

const pedidosPemInvalido = simularNacional({ tipo: "application/json", partes: [Buffer.from("{}")] });
const pemInvalido = await chamarRepasse({ method: "POST", body: { url: destinoLiberado, certificado: { chave: "-----BEGIN RSA PRIVATE KEY-----", certificado: "x" } } });
conferir("PEM inválido recusado com 400 antes de chamar o Nacional", pemInvalido.status === 400 && pedidosPemInvalido.length === 0, JSON.stringify(pemInvalido.corpo));
const pedidosPemValido = simularNacional({ tipo: "application/json", partes: [Buffer.from('{"contribuinte":{}}')] });
const pemValido = await chamarRepasse({ method: "POST", body: { url: destinoLiberado, certificado: { chave: legado.chave, certificado: legado.certificado } } });
conferir("PEM válido segue para o Nacional na conexão TLS",
  pemValido.status === 200 && pedidosPemValido.length === 1 && pedidosPemValido[0].opcoes.key === legado.chave && pedidosPemValido[0].opcoes.cert === legado.certificado);

console.log("\n== saída do repasse: tamanho e prazo ==");
const megabyte = Buffer.alloc(1024 * 1024, 65);
simularNacional({ tipo: "application/pdf", partes: [megabyte, megabyte, megabyte, megabyte, megabyte] });
const respostaGrande = await chamarRepasse({ method: "GET", query: { url: "https://adn.nfse.gov.br/danfse/x" } });
conferir("resposta acima de 4 MB vira 502 explicado", respostaGrande.status === 502 && respostaGrande.corpo?.codigo === "ERESPOSTAGRANDE" && respostaGrande.corpo?.dica !== "" && protegeResposta(respostaGrande.cabecalhos), JSON.stringify(respostaGrande.corpo));
simularNacional({ tipo: "application/pdf", partes: [megabyte, megabyte, megabyte, megabyte] });
const respostaNoLimite = await chamarRepasse({ method: "GET", query: { url: "https://adn.nfse.gov.br/danfse/x" } });
conferir("resposta de 4 MB ainda é entregue", respostaNoLimite.status === 200 && respostaNoLimite.corpo.length === 4 * 1024 * 1024);

const { mock } = await import("node:test");
let pedidoLento = null;
https.request = () => {
  const pedido = new EventEmitter();
  pedido.end = () => {};
  pedido.destroy = () => { pedido.destruido = true; };
  pedidoLento = pedido;
  return pedido;
};
mock.timers.enable({ apis: ["setTimeout"] });
const consultaLenta = chamarRepasse({ method: "GET", query: { url: "https://adn.nfse.gov.br/x" } });
mock.timers.tick(29999);
await Promise.resolve();
const aindaAberta = !pedidoLento?.destruido;
mock.timers.tick(1);
const respostaLenta = await consultaLenta;
mock.timers.reset();
conferir("prazo total de 30 s encerra a conexão lenta", aindaAberta && pedidoLento?.destruido && respostaLenta.status === 502 && respostaLenta.corpo?.codigo === "ETIMEDOUT", JSON.stringify(respostaLenta.corpo));
https.request = requestOriginal;

const registrosNoRepasse = procurar(["api/proxy.js"], /\bconsole\.|process\.std(?:out|err)/);
conferir("repasse não registra nada em log", registrosNoRepasse.length === 0, registrosNoRepasse.join(", "));

console.log("\n== certificado A1 sem vestígio no navegador ==");
const domApp = new JSDOM(readFileSync("index.html", "utf8"), { url: "https://painel.local/" });
Object.assign(global, {
  window: domApp.window,
  document: domApp.window.document,
  localStorage: domApp.window.localStorage,
  sessionStorage: domApp.window.sessionStorage,
  location: domApp.window.location,
  history: domApp.window.history,
  Blob: domApp.window.Blob,
  FileReader: domApp.window.FileReader
});
Object.defineProperty(global, "navigator", { value: domApp.window.navigator, configurable: true });
const copiados = [];
Object.defineProperty(domApp.window.navigator, "clipboard", { value: { writeText: async (texto) => { copiados.push(String(texto)); } }, configurable: true });
const arquivosBaixados = [];
URL.createObjectURL = (blob) => { arquivosBaixados.push(blob); return "blob:teste"; };
URL.revokeObjectURL = () => {};
globalThis.forge = forge;
const pedidosDoApp = [];
global.fetch = async (url, opcoes = {}) => {
  const endereco = String(url);
  pedidosDoApp.push({ url: endereco, metodo: opcoes.method || "GET", corpo: opcoes.body ? JSON.parse(opcoes.body) : null });
  const definicao = endereco.match(/^definicoes\/(.+)\.json$/);
  if (definicao) return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(`definicoes/${definicao[1]}.json`, "utf8")) };
  return { ok: true, status: 200, headers: { get: () => "application/json" }, text: async () => '{"contribuinte":{"situacao":"Ativo"}}' };
};
const esperar = (ms) => new Promise((pronto) => setTimeout(pronto, ms));
const { textoDosLogs } = await import("../js/shared.js");
const { certificadoAtual } = await import("../js/certificado.js");
await import("../js/app.js");
document.dispatchEvent(new domApp.window.Event("DOMContentLoaded"));
await esperar(400);

document.querySelector('.menu-item[data-rota="cnc"]').click();
await esperar(80);
const cartaoA1 = [...document.querySelectorAll(".card")].find((cartao) => cartao.textContent.includes("Certificado digital"));
const campoSenha = cartaoA1.querySelector('input[type="password"]');
const pfxLegado = readFileSync("testes/certificados/cliente-legado.pfx");
const SENHA_DO_TESTE = "senha123";
const carregarA1 = async (senha) => {
  Object.defineProperty(cartaoA1.querySelector('input[type="file"]'), "files", { value: [new domApp.window.File([pfxLegado], "certificado.pfx")], configurable: true });
  campoSenha.value = senha;
  [...cartaoA1.querySelectorAll("button")].find((botao) => botao.textContent === "Carregar certificado").click();
  await esperar(400);
};
await carregarA1("senha-errada-do-teste");
conferir("senha errada é apagada do campo", campoSenha.value === "" && certificadoAtual() === null);
await carregarA1(SENHA_DO_TESTE);
conferir("certificado carregado e senha apagada do campo", certificadoAtual() !== null && campoSenha.value === "");

const listaContribuintes = document.querySelector(".tela textarea");
listaContribuintes.value = "12345678000195";
listaContribuintes.dispatchEvent(new domApp.window.Event("input"));
await esperar(300);
[...document.querySelectorAll(".config-field")].find((bloco) => bloco.textContent.includes("Código IBGE do município")).querySelector("input").value = "3504107";
[...document.querySelectorAll("button")].find((botao) => botao.textContent.trim() === "Consultar").click();
await esperar(500);
const envioAoRepasse = pedidosDoApp.filter((pedido) => pedido.url === "api/proxy" && pedido.metodo === "POST").pop();
conferir("consulta usou o certificado pelo repasse", Boolean(envioAoRepasse?.corpo?.certificado?.chave));

for (const botao of document.querySelectorAll("button")) if (botao.textContent === "Copiar retorno") botao.click();
document.getElementById("exportLogsBtn").click();
await esperar(80);
const textosBaixados = await Promise.all(arquivosBaixados.map((blob) => blob.text()));

const miolo = (pem) => pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
const trechos = (texto, tamanho, passo) => {
  const lista = [];
  for (let inicio = 0; inicio + tamanho <= texto.length; inicio += passo) lista.push(texto.slice(inicio, inicio + tamanho));
  return lista;
};
const vestigios = {
  senha: [SENHA_DO_TESTE, "senha-errada-do-teste"],
  "marcador PEM": ["PRIVATE KEY", "BEGIN CERTIFICATE"],
  "base64 da chave": trechos(miolo(envioAoRepasse?.corpo?.certificado?.chave || ""), 40, 97),
  "base64 da cadeia": trechos(miolo(envioAoRepasse?.corpo?.certificado?.certificado || ""), 40, 97),
  "base64 do PFX": trechos(pfxLegado.toString("base64"), 40, 97),
  "bytes do PFX": trechos(pfxLegado.toString("latin1"), 24, 131)
};
const encontrarVestigios = (texto) => Object.entries(vestigios).filter(([, agulhas]) => agulhas.some((agulha) => texto.includes(agulha))).map(([nome]) => nome);
conferir("controle: os padrões acham a chave no corpo enviado ao repasse",
  ["marcador PEM", "base64 da chave", "base64 da cadeia"].every((nome) => encontrarVestigios(JSON.stringify(envioAoRepasse?.corpo || {})).includes(nome)));
const conteudoDoArmazenamento = (armazenamento) => Array.from({ length: armazenamento.length }, (_, indice) => {
  const chave = armazenamento.key(indice);
  return `${chave}=${armazenamento.getItem(chave)}`;
}).join("\n");
const lugaresDoNavegador = {
  localStorage: conteudoDoArmazenamento(localStorage),
  sessionStorage: conteudoDoArmazenamento(sessionStorage),
  "document.cookie": document.cookie,
  "logs da sessão": textoDosLogs(),
  "painel de logs": document.getElementById("logsPanel").textContent,
  "DOM": document.documentElement.outerHTML,
  "valores dos campos": [...document.querySelectorAll("input, textarea, select")].map((campo) => campo.value).join("\n"),
  "área de transferência": copiados.join("\n"),
  "arquivos baixados": textosBaixados.join("\n"),
  "window.name e history.state": `${domApp.window.name}|${JSON.stringify(history.state)}`
};
conferir("houve cópia do retorno e exportação de logs para varrer", copiados.length > 0 && textosBaixados.some((texto) => texto.includes("Logs da sessao")));
for (const [lugar, texto] of Object.entries(lugaresDoNavegador)) {
  const achados = encontrarVestigios(texto);
  conferir(`sem senha, PEM ou PFX em ${lugar}`, achados.length === 0, achados.join(", "));
}
[...cartaoA1.querySelectorAll("button")].find((botao) => botao.textContent === "Remover").click();
conferir("Remover descarta o certificado da memória", certificadoAtual() === null);

const armazenamentosSemTeste = procurar(codigoDoSite, /\bindexedDB\b|\bcaches\.|\bdocument\.cookie\b|\bcookieStore\b|\bsendBeacon\b/);
conferir("código não usa IndexedDB, CacheStorage, cookie nem sendBeacon, que o jsdom não cobre", armazenamentosSemTeste.length === 0, armazenamentosSemTeste.join(", "));

console.log(falhas === 0 ? "\nTeste de segurança passou." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
