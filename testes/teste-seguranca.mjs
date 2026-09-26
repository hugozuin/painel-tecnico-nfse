import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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
  eval: /\beval\b/,
  "new Function": /\bFunction\b/,
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
  eval: "globalThis.eval(x);",
  "new Function": 'const f = new window.Function("return 1");',
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
const integridadeNaInsercao = [];
const anexarNoCabecalho = document.head.appendChild.bind(document.head);
document.head.appendChild = (no) => {
  integridadeNaInsercao.push(no.integrity);
  return anexarNoCabecalho(no);
};
[...telaCertificado.querySelectorAll("button")].find((botao) => botao.textContent === "Carregar certificado").click();
await new Promise((pronto) => setTimeout(pronto, 20));
const scriptForge = document.head.querySelector("script");
conferir("tela carrega o forge pelo caminho versionado", scriptForge?.getAttribute("src") === BIBLIOTECA_FORGE.endereco, scriptForge?.getAttribute("src"));
conferir("tela exige a integridade (SRI) do forge antes de inserir o script",
  integridadeNaInsercao.length === 1 && integridadeNaInsercao[0] === BIBLIOTECA_FORGE.integridade, JSON.stringify(integridadeNaInsercao));

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
const registrosDoRepasse = [];
const escreverNoConsole = console.log;
console.log = (...partes) => (String(partes[0]).startsWith('{"evento":"repasse-nacional"') ? registrosDoRepasse.push(partes[0]) : escreverNoConsole(...partes));
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
const pedidosPorta443 = simularNacional({ tipo: "application/json", partes: [Buffer.from("{}")] });
const porta443 = await chamarRepasse({ method: "GET", query: { url: "https://adn.nfse.gov.br:443/x" } });
conferir("porta 443 explícita em domínio liberado segue para o Nacional",
  porta443.status === 200 && pedidosPorta443.length === 1 && pedidosPorta443[0].endereco === "https://adn.nfse.gov.br/x", JSON.stringify(porta443.corpo));
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
let responderLento = null;
https.request = (endereco, opcoes, aoResponder) => {
  const pedido = new EventEmitter();
  pedido.end = () => {};
  pedido.destroy = () => { pedido.destruido = true; };
  pedidoLento = pedido;
  responderLento = aoResponder;
  return pedido;
};
mock.timers.enable({ apis: ["setTimeout"] });
const consultaLenta = chamarRepasse({ method: "GET", query: { url: "https://adn.nfse.gov.br/x" } });
mock.timers.tick(20000);
const respostaAosPoucos = new EventEmitter();
respostaAosPoucos.statusCode = 200;
respostaAosPoucos.headers = { "content-type": "application/pdf" };
responderLento(respostaAosPoucos);
respostaAosPoucos.emit("data", Buffer.from("x"));
mock.timers.tick(9999);
await Promise.resolve();
const aindaAberta = !pedidoLento?.destruido;
mock.timers.tick(1);
const respostaLenta = await Promise.race([consultaLenta, new Promise((pronto) => setImmediate(() => pronto(null)))]);
mock.timers.reset();
conferir("prazo total de 30 s conta desde o início, mesmo com dados chegando aos poucos",
  aindaAberta && pedidoLento?.destruido && respostaLenta?.status === 502 && respostaLenta?.corpo?.codigo === "ETIMEDOUT", JSON.stringify(respostaLenta?.corpo ?? "sem resposta no prazo"));

console.log("\n== log estruturado do repasse ==");
const CAMPOS_DO_LOG = ["evento", "horario", "metodo", "status", "dominio", "rota", "certificado", "codigo", "duracaoMs"];
const chaveDeAcessoFicticia = "3".repeat(50);
const enderecoComIdentificadores = `https://adn.nfse.gov.br/contribuintes/nfse/${chaveDeAcessoFicticia}?inscricaoFederal=12345678000195`;
registrosDoRepasse.length = 0;
simularNacional({ tipo: "application/json", partes: [Buffer.from("{}")] });
await chamarRepasse({ method: "GET", query: { url: enderecoComIdentificadores } });
simularNacional({ tipo: "application/json", partes: [Buffer.from("{}")] });
await chamarRepasse({ method: "POST", body: { url: enderecoComIdentificadores, certificado: { chave: legado.chave, certificado: legado.certificado } } });
await chamarRepasse({ method: "POST", body: { url: enderecoComIdentificadores, certificado: { chave: "x", certificado: "y" } } });
await chamarRepasse({ method: "PUT" });
https.request = requestOriginal;
const registrosLidos = registrosDoRepasse.map((linha) => JSON.parse(linha));
conferir("uma linha JSON por consulta, só com os campos previstos",
  registrosLidos.length === 4 && registrosLidos.every((registro) => Object.keys(registro).every((campo) => CAMPOS_DO_LOG.includes(campo))), registrosDoRepasse.join(" | "));
const textoDosRegistros = registrosDoRepasse.join("\n");
const vestigiosNoLog = [chaveDeAcessoFicticia, "12345678000195", "inscricaoFederal", "BEGIN", legado.chave.slice(40, 80), legado.certificado.slice(40, 80)]
  .filter((vestigio) => textoDosRegistros.includes(vestigio));
conferir("log sem chave de acesso, CNPJ, consulta da URL, chave ou certificado", vestigiosNoLog.length === 0, vestigiosNoLog.join(", "));
const [registroGet, registroPost, registroPemInvalido, registroRecusa] = registrosLidos;
conferir("log traz domínio, rota sem identificadores, status, método e se levou certificado",
  registroGet?.dominio === "adn.nfse.gov.br" && registroGet.rota === "/contribuintes/nfse/{id}" && registroGet.status === 200
  && registroGet.certificado === false && registroPost?.certificado === true && registroPost.metodo === "POST" && Number.isInteger(registroGet.duracaoMs),
  JSON.stringify(registrosLidos));
conferir("recusas também ficam no log", registroPemInvalido?.status === 400 && registroRecusa?.status === 405 && registroRecusa.metodo === "PUT");
const registrosNoRepasse = procurar(["api/proxy.js"], /\bconsole\.|process\.std(?:out|err)/);
conferir("repasse só escreve o log estruturado",
  registrosNoRepasse.length === 1 && readFileSync("api/proxy.js", "utf8").includes('console.log(JSON.stringify({ evento: "repasse-nacional"'), registrosNoRepasse.join(", "));

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

console.log("\n== perfis e guarda da API Key ==");
const { CHAVES_ARMAZENAMENTO, chaveDaVariante, levarDadosSensiveisParaAba } = await import("../js/shared.js");
const CHAVES_GRAVADAS_NOS_NAVEGADORES = [
  "apiKey", "lembrarApiKey", "perfis", "perfilAtivo", "ids", "modo", "tentativas", "intervalo", "nacional", "esperaEvento",
  "verificar", "verificacoes", "intervaloVerificacao", "ambienteNacional", "variantes", "usuario", "tema"
].map((sufixo) => `resolve-tools:${sufixo}`);
conferir("chaves do navegador continuam as mesmas, porque trocar exige migração",
  JSON.stringify(Object.values(CHAVES_ARMAZENAMENTO)) === JSON.stringify(CHAVES_GRAVADAS_NOS_NAVEGADORES) && chaveDaVariante("consulta") === "resolve-tools:variantes:consulta",
  JSON.stringify(Object.values(CHAVES_ARMAZENAMENTO)));
document.querySelector('.menu-item[data-rota="consulta"]').click();
await esperar(120);
const campoApiKey = document.getElementById("apiKeyInput");
const seletorDePerfis = document.getElementById("perfilSelect");
const botaoApagarPerfis = document.getElementById("apagarPerfisBtn");
const avisoDeGuarda = document.getElementById("avisoGuardaChave")?.textContent.replace(/\s+/g, " ") || "";
conferir("aviso explica que chave e perfis ficam só na aba e não passam pelo servidor",
  ["só nesta aba (sessionStorage)", "somem quando ela é fechada", "Nada fica gravado no navegador", "nunca passa pelo servidor desta ferramenta"]
    .every((trecho) => avisoDeGuarda.includes(trecho)) && !/localStorage|Manter a chave/.test(avisoDeGuarda), avisoDeGuarda);
conferir("sem opção de manter a chave gravada no navegador", !document.getElementById("rememberApiKey") && !document.body.textContent.includes("Manter a chave"));
conferir("aviso sem travessão", !/[–—]/.test(avisoDeGuarda));
conferir("botão de apagar perfis desabilitado sem perfis", botaoApagarPerfis.disabled);
const digitarChave = (chave) => {
  campoApiKey.value = chave;
  campoApiKey.dispatchEvent(new domApp.window.Event("input"));
};
const salvarPerfil = (apelido, chave) => {
  digitarChave(chave);
  document.getElementById("perfilNomeInput").value = apelido;
  document.getElementById("salvarPerfilBtn").click();
};
const escolherPerfil = (apelido) => {
  seletorDePerfis.value = apelido;
  seletorDePerfis.dispatchEvent(new domApp.window.Event("change"));
};
const confirmarModal = async () => {
  await esperar(40);
  document.getElementById("confirmOk").click();
  await esperar(40);
};
const perfisGravados = () => JSON.parse(sessionStorage.getItem(CHAVES_ARMAZENAMENTO.perfis) || "[]");
const chaveGuardada = () => [sessionStorage.getItem(CHAVES_ARMAZENAMENTO.apiKey)];
const CREDENCIAIS_NO_NAVEGADOR = ["apiKey", "lembrarApiKey", "perfis", "perfilAtivo", "idsResolve"].map((nome) => CHAVES_ARMAZENAMENTO[nome]);
const credenciaisGravadasNoNavegador = () => CREDENCIAIS_NO_NAVEGADOR.filter((chave) => localStorage.getItem(chave) !== null)
  .concat(Object.keys(localStorage).filter((chave) => /chave-do-perfil|chave-digitada/.test(localStorage.getItem(chave))));

salvarPerfil("Perfil A", "chave-do-perfil-a");
salvarPerfil("Perfil B", "chave-do-perfil-b");
conferir("botão de apagar perfis habilitado com perfis salvos", !botaoApagarPerfis.disabled && perfisGravados().length === 2);
escolherPerfil("Perfil A");
conferir("perfil escolhido leva a chave ao campo e à aba", campoApiKey.value === "chave-do-perfil-a" && chaveGuardada()[0] === "chave-do-perfil-a");
conferir("perfis, perfil ativo e chave ficam só na aba", credenciaisGravadasNoNavegador().length === 0 && sessionStorage.getItem(CHAVES_ARMAZENAMENTO.perfilAtivo) === "Perfil A",
  credenciaisGravadasNoNavegador().join(", "));
document.getElementById("removerPerfilBtn").click();
await confirmarModal();
conferir("Remover apaga o perfil e a chave dele do campo e do armazenamento",
  perfisGravados().map((perfil) => perfil.nome).join() === "Perfil B" && campoApiKey.value === "" && !chaveGuardada().includes("chave-do-perfil-a"));

escolherPerfil("Perfil B");
botaoApagarPerfis.click();
await esperar(40);
const mensagemDeConfirmacao = document.getElementById("confirmMessage").textContent;
document.getElementById("confirmCancel").click();
await esperar(40);
conferir("cancelar a confirmação não apaga nada", perfisGravados().length === 1 && campoApiKey.value === "chave-do-perfil-b");
conferir("confirmação diz quantos perfis e o que acontece com a chave do campo",
  mensagemDeConfirmacao.includes("O perfil desta aba será apagado") && mensagemDeConfirmacao.includes("chave no campo"), mensagemDeConfirmacao);
botaoApagarPerfis.click();
await confirmarModal();
conferir("Apagar todos os perfis limpa perfis, perfil ativo, campo e chave guardada",
  sessionStorage.getItem(CHAVES_ARMAZENAMENTO.perfis) === null && sessionStorage.getItem(CHAVES_ARMAZENAMENTO.perfilAtivo) === null
  && campoApiKey.value === "" && !chaveGuardada().includes("chave-do-perfil-b") && botaoApagarPerfis.disabled);

salvarPerfil("Perfil C", "chave-do-perfil-c");
digitarChave("chave-digitada-sem-perfil");
botaoApagarPerfis.click();
await confirmarModal();
conferir("chave digitada que não é de perfil continua no campo e guardada",
  perfisGravados().length === 0 && campoApiKey.value === "chave-digitada-sem-perfil" && chaveGuardada().includes("chave-digitada-sem-perfil"));
conferir("nenhuma chave de perfil foi para o log", !/chave-do-perfil|chave-digitada-sem-perfil/.test(textoDosLogs()));
digitarChave("");
conferir("nada da credencial foi gravado no navegador durante o uso", credenciaisGravadasNoNavegador().length === 0, credenciaisGravadasNoNavegador().join(", "));
const gravacoesDeCredencial = procurar(codigoDoSite, /localStorage\.setItem\(CHAVES_ARMAZENAMENTO\.(?:apiKey|lembrarApiKey|perfis|perfilAtivo|idsResolve)\b/);
conferir("nenhum código grava API Key, perfis ou lista do Resolve no localStorage", gravacoesDeCredencial.length === 0, gravacoesDeCredencial.join(", "));
const sessaoAntes = Object.fromEntries(CREDENCIAIS_NO_NAVEGADOR.map((chave) => [chave, sessionStorage.getItem(chave)]));
CREDENCIAIS_NO_NAVEGADOR.forEach((chave) => sessionStorage.removeItem(chave));
localStorage.setItem(CHAVES_ARMAZENAMENTO.apiKey, "chave-antiga-mantida");
localStorage.setItem(CHAVES_ARMAZENAMENTO.lembrarApiKey, "true");
localStorage.setItem(CHAVES_ARMAZENAMENTO.perfis, JSON.stringify([{ nome: "Antigo", chave: "chave-antiga-do-perfil" }]));
localStorage.setItem(CHAVES_ARMAZENAMENTO.idsResolve, "id-antigo");
const levados = levarDadosSensiveisParaAba();
conferir("dados gravados por versão anterior vão para a aba e saem do navegador",
  levados === 3 && CREDENCIAIS_NO_NAVEGADOR.every((chave) => localStorage.getItem(chave) === null)
  && sessionStorage.getItem(CHAVES_ARMAZENAMENTO.apiKey) === "chave-antiga-mantida" && sessionStorage.getItem(CHAVES_ARMAZENAMENTO.idsResolve) === "id-antigo"
  && JSON.parse(sessionStorage.getItem(CHAVES_ARMAZENAMENTO.perfis))[0].chave === "chave-antiga-do-perfil");
conferir("sem nada gravado, a migração não faz nada", levarDadosSensiveisParaAba() === 0);
conferir("a abertura do app faz a migração", /levarDadosSensiveisParaAba\(\)/.test(readFileSync("js/app.js", "utf8")));
Object.entries(sessaoAntes).forEach(([chave, valor]) => (valor === null ? sessionStorage.removeItem(chave) : sessionStorage.setItem(chave, valor)));

console.log("\n== dados sensíveis no que é publicado e versionado ==");
const { varrerSigilo, acharDadosSensiveis, cnpjValido, cpfValido, textosDoConteudo, arquivosDeChave } = await import("./sigilo.mjs");
const permitidosDoForge = new Map([
  [SHA256_FORGE, "SHA-256 do forge vendorizado"],
  [BIBLIOTECA_FORGE.integridade, "SRI do forge vendorizado"]
]);
const completarDocumento = (base, valido) => Array.from({ length: 100 }, (_, dv) => `${base}${String(dv).padStart(2, "0")}`).find(valido);
const cnpjSintetico = completarDocumento("112223330001", cnpjValido);
const cnpjAlfanumericoSintetico = completarDocumento(["12ABC", "34501DE"].join(""), cnpjValido);
const cpfSintetico = completarDocumento("111444777", cpfValido);
const digitosEmZigueZague = (quantidade) => Array.from({ length: quantidade }, (_, indice) => (indice * 7) % 10).join("");
const aleatorio = createHash("sha256").update("controle-da-varredura");
const base64Sintetico = aleatorio.copy().digest("base64");
const exemplosSensiveis = {
  "ID do Mongo": `id ${["5f1a2b3c4d5e", "6f7a8b9c0d1e"].join("")}`,
  UUID: ["8f14e45f", "ceea", "467a", "9b7d", "8c1f3e2a9b10"].join("-"),
  "chave de acesso de 44 dígitos": digitosEmZigueZague(44),
  "chave de acesso com separadores": digitosEmZigueZague(44).match(/.{4}/g).join(" "),
  "chave da NFS-e de 50 dígitos": digitosEmZigueZague(50),
  "sequência de 15 ou mais dígitos": digitosEmZigueZague(18),
  CNPJ: `/empresa/${cnpjSintetico}/webhook`,
  "CNPJ formatado": cnpjSintetico.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"),
  CPF: `"cpfCnpj": "${cpfSintetico}"`,
  "CPF formatado": cpfSintetico.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"),
  JWT: ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0In0", "c2lnbmF0dXJh"].join("."),
  "token Bearer": `Authorization: ${"Bearer"} ${base64Sintetico}`,
  "x-api-key com valor": `"x-api-key": "${"k3yVal0r"}${"Secreto9"}"`,
  "token de serviço": `${"ghp"}_${"a1".repeat(18)}`,
  "hexadecimal longo": aleatorio.copy().digest("hex"),
  "base64 longo": `chave ${base64Sintetico}`,
  "segredo atribuído": `senha = "${"Abc12345"}${"xyz"}"`,
  "e-mail": `contato: ${"consultor"}@${"empresa-real.com.br"}`,
  "chave privada PEM": `${"-----BEGIN RSA "}${"PRIVATE KEY-----"}\n${aleatorio.copy().digest("base64")}${base64Sintetico}`
};
for (const [padrao, texto] of Object.entries(exemplosSensiveis)) {
  const achados = acharDadosSensiveis(texto);
  conferir(`controle: detecta ${padrao}`, achados.some((achado) => achado.padrao === padrao), JSON.stringify(achados));
}
const CNPJ_ALFANUMERICO_OU_PARCIAL = "CNPJ alfanumérico ou com separadores parciais";
const formasParciaisDoCnpj = [
  `"cpfCnpj": "${cnpjAlfanumericoSintetico}"`,
  cnpjAlfanumericoSintetico.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5"),
  cnpjSintetico.replace(/^(.{8})(.{4})(.{2})$/, "$1/$2-$3"),
  cnpjSintetico.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1 $2 $3 $4 $5")
];
for (const texto of formasParciaisDoCnpj) {
  const achados = acharDadosSensiveis(texto);
  conferir(`controle: detecta ${CNPJ_ALFANUMERICO_OU_PARCIAL} (${texto.length} caracteres)`, achados.some((achado) => achado.padrao === CNPJ_ALFANUMERICO_OU_PARCIAL), JSON.stringify(achados));
}
const linhasDoPdfSimulado = textosDoConteudo(`BT 1 0 0 1 72 720 Tm (versao 2) Tj T* (${cpfSintetico} para o cliente) Tj ET`);
conferir("controle: extração do PDF quebra a linha no operador T*",
  linhasDoPdfSimulado.length === 2 && acharDadosSensiveis(linhasDoPdfSimulado.join("\n")).some((achado) => achado.padrao === "CPF"), JSON.stringify(linhasDoPdfSimulado.length));
const cnpjComDigitoErrado = `${cnpjSintetico.slice(0, 13)}${(Number(cnpjSintetico.at(-1)) + 1) % 10}`;
const cnpjAlfanumericoComDigitoErrado = `${cnpjAlfanumericoSintetico.slice(0, 13)}${(Number(cnpjAlfanumericoSintetico.at(-1)) + 1) % 10}`;
const exemplosPublicos = [
  "12345678000195", "29.062.609/0001-77", "12345678909", cnpjComDigitoErrado, cnpjAlfanumericoComDigitoErrado, "9".repeat(15), "0".repeat(13),
  "cliente@exemplo.com.br", "https://usuario:segredo@adn.nfse.gov.br/x", "https://api.plugnotas.com.br@exemplo.invalid/x",
  "codMunicipio=3504107", "1.1502.10.00", "cClassTrib 000001", "ID da nota, um por linha",
  "NFSe/infNFSe/DPS/infDPS/prest/regTrib/opSimpNac/regApTribSN", "-----BEGIN RSA PRIVATE KEY-----"
];
for (const texto of exemplosPublicos) {
  const achados = acharDadosSensiveis(texto);
  conferir(`controle: não acusa ${texto.length > 40 ? `${texto.slice(0, 40)}…` : texto}`, achados.length === 0, JSON.stringify(achados));
}
conferir("controle: hashes do forge só passam como permitidos",
  acharDadosSensiveis(`${SHA256_FORGE} ${BIBLIOTECA_FORGE.integridade}`).length === 2
  && acharDadosSensiveis(`${SHA256_FORGE} ${BIBLIOTECA_FORGE.integridade}`, permitidosDoForge).length === 0);

const varredura = varrerSigilo(permitidosDoForge);
const essenciais = [
  "js/telas/resolve.js", "api/proxy.js", "definicoes/de-para-nacional.json", "definicoes/ibscbs.json", "index.html",
  "CLAUDE.md", "README.md", "vercel.json", ".vercelignore", "ferramentas/gerar_manual.py", "testes/teste.mjs", "testes/sigilo.mjs"
];
conferir("varredura cobre tudo o que o Git versiona ou vai versionar, inclusive a raiz", essenciais.every((arquivo) => varredura.arquivos.includes(arquivo)), essenciais.filter((arquivo) => !varredura.arquivos.includes(arquivo)).join(", "));
conferir("varredura fica fora só do forge e das dependências",
  !varredura.arquivos.some((arquivo) => arquivo === BIBLIOTECA_FORGE.endereco || /^testes\/node_modules\/|package-lock/.test(arquivo))
  && varredura.arquivos.includes("assets/vendor/forge-LICENSE.txt"));
const chavesNoRepositorio = arquivosDeChave();
conferir("nenhum .pfx, .p12, .key ou .pem no repositório", chavesNoRepositorio.length === 0, chavesNoRepositorio.join(", "));
const certificadosIgnorados = ["ca.pem", "servidor.key", "cliente-legado.pfx"]
  .every((arquivo) => spawnSync("git", ["check-ignore", "-q", `testes/certificados/${arquivo}`]).status === 0);
conferir("certificados de teste gerados na execução ficam fora do Git", certificadosIgnorados);
conferir("texto do manual em PDF extraído para a varredura", varredura.manual.fluxos > 0 && varredura.manual.texto.includes("Painel T"));
conferir("nenhum ID, chave, token, CNPJ, CPF ou e-mail fora da lista de permitidos",
  varredura.achados.length === 0,
  varredura.achados.map((achado) => `${achado.arquivo}:${achado.linha}:${achado.coluna} ${achado.padrao} ${achado.valor}`).join("; "));

console.log("\n== cabeçalhos do site e CSP (vercel.json) ==");
const regrasDoVercel = new Map(JSON.parse(readFileSync("vercel.json", "utf8")).headers
  .map((regra) => [regra.source, Object.fromEntries(regra.headers.map(({ key, value }) => [key, value]))]));
const REGRA_GLOBAL = "/(.*)";
const REGRA_DAS_PAGINAS = "/((?!api/).*)";
const globais = regrasDoVercel.get(REGRA_GLOBAL) || {};
const dasPaginas = regrasDoVercel.get(REGRA_DAS_PAGINAS) || {};
conferir("nosniff, Referrer-Policy e X-Robots-Tag valem para tudo",
  globais["X-Content-Type-Options"] === "nosniff" && globais["Referrer-Policy"] === "same-origin" && globais["X-Robots-Tag"] === "noindex, nofollow");
conferir("CSP, COOP e Permissions-Policy só na regra das páginas", !globais["Content-Security-Policy"] && !globais["Cross-Origin-Opener-Policy"] && Boolean(dasPaginas["Content-Security-Policy"]));
const casaRegraDasPaginas = new RegExp(`^${REGRA_DAS_PAGINAS}$`);
conferir("regra das páginas cobre site e manual e deixa o repasse com a própria CSP",
  ["/", "/index.html", "/js/app.js", `/${BIBLIOTECA_FORGE.endereco}`, "/documentacao.pdf", "/definicoes/rotas.json"].every((caminho) => casaRegraDasPaginas.test(caminho))
  && !["/api/proxy", "/api/proxy.js"].some((caminho) => casaRegraDasPaginas.test(caminho)));
const CSP_APROVADA = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "https://fonts.googleapis.com"],
  "font-src": ["https://fonts.gstatic.com"],
  "img-src": ["'self'"],
  "connect-src": ["'self'", ORIGEM_PLUGNOTAS],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'none'"]
};
const diretivas = Object.fromEntries((dasPaginas["Content-Security-Policy"] || "").split(";").map((trecho) => trecho.trim()).filter(Boolean)
  .map((trecho) => { const [nome, ...valores] = trecho.split(/\s+/); return [nome, valores]; }));
const ordenar = (politica) => JSON.stringify(Object.entries(politica).sort(([a], [b]) => a.localeCompare(b)));
conferir("CSP com exatamente as diretivas aprovadas", ordenar(diretivas) === ordenar(CSP_APROVADA), dasPaginas["Content-Security-Policy"]);
conferir("CSP sem unsafe, curinga, data: nem blob:", !Object.values(diretivas).flat().some((valor) => /unsafe|^\*$|^data:$|^blob:$/.test(valor)));
conferir("Permissions-Policy e COOP aprovadas",
  dasPaginas["Permissions-Policy"] === "camera=(), microphone=(), geolocation=()" && dasPaginas["Cross-Origin-Opener-Policy"] === "same-origin");

const configuracao = JSON.parse(readFileSync("definicoes/config.json", "utf8"));
const conexoes = diretivas["connect-src"] || [];
conferir("base do catálogo liberada no connect-src", conexoes.includes(new URL(JSON.parse(readFileSync("definicoes/rotas.json", "utf8")).base).origin));
conferir("leitura remota ligada exige raw.githubusercontent.com no connect-src", !configuracao.atualizacaoRemota || conexoes.includes("https://raw.githubusercontent.com"));
const ORIGENS_SO_DE_LINK = ["https://github.com", "https://raw.githubusercontent.com"];
const origensNoCodigo = [...new Set(codigoDoSite.filter((arquivo) => arquivo.startsWith("js/"))
  .flatMap((arquivo) => [...readFileSync(arquivo, "utf8").matchAll(/https:\/\/[A-Za-z0-9.-]+/g)].map(([origem]) => origem)))];
const origensSemLiberacao = origensNoCodigo.filter((origem) => !conexoes.includes(origem) && !ORIGENS_SO_DE_LINK.includes(origem));
conferir("toda origem https do front está no connect-src ou só aparece em link", origensSemLiberacao.length === 0, origensSemLiberacao.join(", "));
const ambientesDoNacional = JSON.parse(readFileSync("definicoes/rotas-nacional.json", "utf8")).ambientes
  .flatMap((ambiente) => [ambiente.adn, ambiente.sefin]).map((endereco) => new URL(endereco));
const { DOMINIOS_LIBERADOS } = await import("../api/proxy.js");
conferir("hosts do Nacional só pelo repasse: liberados no repasse e fora do connect-src",
  ambientesDoNacional.every((endereco) => DOMINIOS_LIBERADOS.includes(endereco.hostname) && !conexoes.includes(endereco.origin)));

console.log("\n== página, estilos e imagens compatíveis com a CSP ==");
const paginaEstatica = new JSDOM(readFileSync("index.html", "utf8")).window.document;
const todosOsElementos = [...paginaEstatica.querySelectorAll("*")];
conferir("scripts só por arquivo local, sem código inline",
  [...paginaEstatica.scripts].every((script) => script.getAttribute("src") && !script.textContent.trim() && !/^(?:[a-z]+:)?\/\//i.test(script.getAttribute("src"))));
conferir("sem <style> e sem atributo style", !paginaEstatica.querySelector("style") && !todosOsElementos.some((elemento) => elemento.hasAttribute("style")));
conferir("sem atributos de evento inline", !todosOsElementos.some((elemento) => [...elemento.attributes].some((atributo) => /^on/i.test(atributo.name))));
conferir("sem endereços javascript:", !todosOsElementos.some((elemento) => [...elemento.attributes].some((atributo) => /^\s*javascript:/i.test(atributo.value))));
conferir("folhas de estilo locais ou do Google Fonts liberado no style-src",
  [...paginaEstatica.querySelectorAll('link[rel="stylesheet"]')].every((folha) => {
    const endereco = folha.getAttribute("href");
    return !/^(?:[a-z]+:)?\/\//i.test(endereco) || (diretivas["style-src"] || []).includes(new URL(endereco).origin);
  }));
conferir("imagens e ícone locais", [...paginaEstatica.querySelectorAll("img[src], link[rel~='icon']")].every((elemento) => !/^(?:[a-z]+:)?\/\//i.test(elemento.getAttribute("src") || elemento.getAttribute("href"))));
conferir("links em nova aba com rel=noopener", [...paginaEstatica.querySelectorAll('a[target="_blank"]')].every((link) => /\bnoopener\b/.test(link.getAttribute("rel") || "")));
const estilos = readFileSync("styles.css", "utf8");
conferir("styles.css sem @import", !/@import/i.test(estilos));
conferir("styles.css só com url() local", [...estilos.matchAll(/url\(\s*["']?([^"')]+)/gi)].every(([, endereco]) => !/^(?:[a-z]+:|\/\/)/i.test(endereco)));
const svgsDoSite = readdirSync("assets").filter((nome) => nome.endsWith(".svg")).map((nome) => `assets/${nome}`);
const svgsComConteudoAtivo = svgsDoSite.filter((arquivo) => /<script|<style|\sstyle=|\son\w+=|href=["']\s*(?:https?:|javascript:)/i.test(readFileSync(arquivo, "utf8")));
conferir("SVGs sem script, estilo inline nem referência externa", svgsDoSite.length > 0 && svgsComConteudoAtivo.length === 0, svgsComConteudoAtivo.join(", "));
const textoDoForge = bytesForge.toString("latin1");
const criacoesDeFuncao = textoDoForge.match(/new Function/g) || [];
conferir("forge sem eval e com um único new Function, protegido por try e não alcançado em modo não estrito",
  !/(?:^|[^\w.$])eval\s*\(/.test(textoDoForge) && criacoesDeFuncao.length === 1
  && /try\{\w+=\w+\|\|new Function\("return this"\)\(\)\}catch/.test(textoDoForge) && !textoDoForge.includes("use strict"));

console.log(falhas === 0 ? "\nTeste de segurança passou." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
