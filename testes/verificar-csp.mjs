import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAVEGADORES = [
  process.argv[2],
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
].filter(Boolean);
const PFX_DE_TESTE = path.join(RAIZ, "testes", "certificados", "cliente-legado.pfx");
const SENHA_DO_PFX_DE_TESTE = "senha123";
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8"
};

const pausar = (ms) => new Promise((pronto) => setTimeout(pronto, ms));
const regrasDoVercel = JSON.parse(readFileSync(path.join(RAIZ, "vercel.json"), "utf8")).headers
  .map((regra) => ({ casa: new RegExp(`^${regra.source}$`), cabecalhos: regra.headers }));

function aplicarRegrasDoVercel(caminho, resposta) {
  regrasDoVercel.filter((regra) => regra.casa.test(caminho))
    .forEach((regra) => regra.cabecalhos.forEach(({ key, value }) => resposta.setHeader(key, value)));
}

function arquivoDoCaminho(caminho) {
  const relativo = decodeURIComponent(caminho === "/" ? "/index.html" : caminho);
  const alvo = path.normalize(path.join(RAIZ, relativo));
  if (!alvo.startsWith(RAIZ) || !existsSync(alvo) || !statSync(alvo).isFile()) return null;
  return alvo;
}

function subirServidor() {
  const servidor = http.createServer((requisicao, resposta) => {
    const { pathname } = new URL(requisicao.url, "http://local");
    aplicarRegrasDoVercel(pathname, resposta);
    if (pathname === "/api/proxy") {
      resposta.setHeader("Content-Type", "application/json");
      resposta.end(JSON.stringify({ verificacao: "repasse simulado, sem chamada ao gov.br" }));
      return;
    }
    const arquivo = arquivoDoCaminho(pathname);
    resposta.statusCode = arquivo ? 200 : 404;
    resposta.setHeader("Content-Type", arquivo ? TIPOS[path.extname(arquivo)] || "application/octet-stream" : "text/plain");
    resposta.end(arquivo ? readFileSync(arquivo) : "não encontrado");
  });
  return new Promise((pronto) => servidor.listen(0, "127.0.0.1", () => pronto(servidor)));
}

async function abrirNavegador(executavel, pastaPerfil) {
  const processo = spawn(executavel, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${pastaPerfil}`,
    "--no-first-run", "--no-default-browser-check", "about:blank"
  ], { stdio: "ignore" });
  const arquivoPorta = path.join(pastaPerfil, "DevToolsActivePort");
  for (let tentativa = 0; tentativa < 80 && !existsSync(arquivoPorta); tentativa++) await pausar(250);
  const [porta, caminho] = readFileSync(arquivoPorta, "utf8").trim().split("\n");
  return { processo, endereco: `ws://127.0.0.1:${porta}${caminho}` };
}

function conectarCdp(endereco) {
  const socket = new WebSocket(endereco);
  const pendentes = new Map();
  const ouvintes = [];
  let sequencia = 0;
  socket.addEventListener("message", ({ data }) => {
    const mensagem = JSON.parse(data);
    if (mensagem.id && pendentes.has(mensagem.id)) {
      const { resolver, rejeitar } = pendentes.get(mensagem.id);
      pendentes.delete(mensagem.id);
      if (mensagem.error) rejeitar(new Error(mensagem.error.message));
      else resolver(mensagem.result);
      return;
    }
    ouvintes.forEach((ouvinte) => ouvinte(mensagem));
  });
  const enviar = (metodo, parametros = {}, sessionId) => new Promise((resolver, rejeitar) => {
    const id = ++sequencia;
    pendentes.set(id, { resolver, rejeitar });
    socket.send(JSON.stringify({ id, method: metodo, params: parametros, ...(sessionId ? { sessionId } : {}) }));
  });
  return new Promise((pronto) => socket.addEventListener("open", () => pronto({ enviar, ouvir: (ouvinte) => ouvintes.push(ouvinte), fechar: () => socket.close() })));
}

const DETECTOR = `document.addEventListener("securitypolicyviolation", (evento) => {
  console.warn("__CSP__" + JSON.stringify({ diretiva: evento.effectiveDirective, bloqueado: evento.blockedURI, origem: evento.sourceFile, linha: evento.lineNumber }));
}, true);`;

async function verificar(executavel) {
  const servidor = await subirServidor();
  const base = `http://127.0.0.1:${servidor.address().port}/`;
  const pastaPerfil = mkdtempSync(path.join(os.tmpdir(), "verificar-csp-"));
  const { processo, endereco } = await abrirNavegador(executavel, pastaPerfil);
  const cdp = await conectarCdp(endereco);
  const violacoes = [];
  const problemas = [];
  const conferencias = [];

  const { targetId } = await cdp.enviar("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.enviar("Target.attachToTarget", { targetId, flatten: true });
  const naPagina = (metodo, parametros) => cdp.enviar(metodo, parametros, sessionId);
  cdp.ouvir(({ method, params, sessionId: sessao }) => {
    if (sessao !== sessionId) return;
    if (method === "Runtime.consoleAPICalled") {
      const texto = params.args.map((argumento) => argumento.value ?? "").join(" ");
      if (texto.startsWith("__CSP__")) violacoes.push(JSON.parse(texto.slice(7)));
      else if (params.type === "error") problemas.push(`console: ${texto}`);
    }
    if (method === "Runtime.exceptionThrown") problemas.push(`exceção: ${params.exceptionDetails.exception?.description || params.exceptionDetails.text}`);
    if (method === "Log.entryAdded" && /integrity|Content Security Policy|Refused/i.test(params.entry.text)) problemas.push(`log: ${params.entry.text}`);
  });
  await Promise.all(["Page.enable", "Runtime.enable", "Log.enable"].map((metodo) => naPagina(metodo)));
  await naPagina("Page.addScriptToEvaluateOnNewDocument", { source: DETECTOR });
  await cdp.enviar("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: pastaPerfil });

  const avaliar = async (expressao) => (await naPagina("Runtime.evaluate", { expression: expressao, awaitPromise: true, returnByValue: true })).result.value;
  const aguardar = async (expressao, limiteMs = 10000) => {
    for (let decorrido = 0; decorrido < limiteMs; decorrido += 100) {
      if (await avaliar(expressao)) return true;
      await pausar(100);
    }
    return false;
  };
  const clicarBotao = (texto) => avaliar(`[...document.querySelectorAll("button")].find((botao) => botao.textContent.trim() === ${JSON.stringify(texto)})?.click()`);
  const preencher = (seletor, valor) => avaliar(`(() => { const campo = document.querySelector(${JSON.stringify(seletor)}); campo.value = ${JSON.stringify(valor)}; campo.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  const abrirTela = async (id) => {
    await avaliar(`location.hash = ${JSON.stringify(id)}`);
    await aguardar(`document.querySelector(".tela")?.dataset.rota === ${JSON.stringify(id)} || document.title.length > 0`, 3000);
    await pausar(250);
  };

  await naPagina("Page.navigate", { url: base });
  conferencias.push(["menu montado com as definições", await aguardar(`document.querySelectorAll(".menu-item").length > 0`)]);

  const idsDasDefinicoes = ["rotas", "rotas-nacional"].flatMap((nome) =>
    JSON.parse(readFileSync(path.join(RAIZ, "definicoes", `${nome}.json`), "utf8")).rotas.map((rota) => rota.id));
  const idsDoMenu = await avaliar(`[...document.querySelectorAll(".menu-item")].map((item) => item.dataset.rota)`);
  const telas = [...new Set([...idsDoMenu, ...idsDasDefinicoes])];
  for (const id of telas) await abrirTela(id);
  conferencias.push([`${telas.length} telas visitadas`, telas.length > 20]);

  await avaliar(`document.getElementById("themeToggle").click(); document.getElementById("themeToggle").click();`);
  await avaliar(`document.querySelector(".info-icone")?.click()`);

  await abrirTela("consulta");
  await preencher("#apiKeyInput", "chave-ficticia-da-verificacao");
  await preencher(".tela textarea", "ID-FICTICIO");
  await clicarBotao("Consultar");
  conferencias.push(["consulta à API PlugNotas saiu do navegador", await aguardar(`[...document.querySelectorAll(".cell-status")].some((celula) => /\\d/.test(celula.textContent))`, 20000)]);

  await abrirTela("convenio");
  await preencher(".tela textarea", "4115200");
  await clicarBotao("Consultar");
  conferencias.push(["consulta pelo repasse exibida no Retorno", await aguardar(`document.querySelector(".retorno textarea")?.value.includes("repasse simulado")`)]);

  await abrirTela("cnc");
  const campoArquivo = await naPagina("Runtime.evaluate", { expression: `document.querySelector('.tela input[type="file"], .card input[type="file"]')` });
  await naPagina("DOM.enable");
  await naPagina("DOM.setFileInputFiles", { files: [PFX_DE_TESTE], objectId: campoArquivo.result.objectId });
  await preencher('input[type="password"]', SENHA_DO_PFX_DE_TESTE);
  await clicarBotao("Carregar certificado");
  conferencias.push(["forge carregado com SRI e certificado lido", await aguardar(`document.querySelector(".certificado-situacao")?.textContent.includes("EMPRESA TESTE")`)]);
  conferencias.push(["script do forge com integridade", await avaliar(`[...document.scripts].some((script) => script.src.includes("forge-") && script.integrity.startsWith("sha384-"))`)]);

  await avaliar(`document.getElementById("abrirLogs").click(); document.getElementById("exportLogsBtn").click();`);
  conferencias.push(["fonte Quicksand carregada", await avaliar(`document.fonts.ready.then(() => document.fonts.check('600 16px "Quicksand"'))`)]);

  const antesDoControle = { violacoes: violacoes.length, problemas: problemas.length };
  await avaliar(`document.body.appendChild(Object.assign(document.createElement("img"), { src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" })); true`);
  await pausar(500);
  const controle = violacoes.splice(antesDoControle.violacoes);
  problemas.splice(antesDoControle.problemas);
  conferencias.push(["controle: imagem data: bloqueada e detectada", controle.some((violacao) => violacao.diretiva === "img-src")]);

  const versao = (await cdp.enviar("Browser.getVersion")).product;
  const encerrado = new Promise((pronto) => processo.once("exit", pronto));
  await cdp.enviar("Browser.close").catch(() => processo.kill());
  await Promise.race([encerrado, pausar(5000)]);
  cdp.fechar();
  servidor.close();
  try {
    rmSync(pastaPerfil, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    problemas.push(`pasta temporária do navegador não pôde ser apagada: ${pastaPerfil}`);
  }
  return { versao, violacoes, problemas, conferencias };
}

const executavel = NAVEGADORES.find((caminho) => existsSync(caminho));
if (!executavel) {
  console.log("Nenhum Chrome ou Edge encontrado. Informe o caminho: node testes/verificar-csp.mjs <navegador>");
  process.exit(2);
}
const { versao, violacoes, problemas, conferencias } = await verificar(executavel);
console.log(`\n== CSP e SRI no navegador (${versao}) ==`);
conferencias.forEach(([titulo, ok]) => console.log(`  ${ok ? "ok  " : "FALHA"} ${titulo}`));
violacoes.forEach((violacao) => console.log(`  FALHA violação de CSP: ${JSON.stringify(violacao)}`));
problemas.forEach((problema) => console.log(`  aviso ${problema}`));
const falhou = violacoes.length > 0 || conferencias.some(([, ok]) => !ok);
console.log(falhou ? "\nVerificação no navegador falhou." : `\nNenhuma violação de CSP em ${versao}.`);
process.exit(falhou ? 1 : 0);
