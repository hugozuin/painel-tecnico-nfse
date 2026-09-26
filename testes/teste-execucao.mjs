import { JSDOM } from "jsdom";
import forge from "node-forge";
import { readFileSync } from "node:fs";

const dom = new JSDOM(readFileSync("./index.html", "utf8"), { url: "https://demo.local/" });
global.window = dom.window;
globalThis.forge = forge;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
global.location = dom.window.location;
global.history = dom.window.history;
global.Blob = dom.window.Blob;
global.FileReader = dom.window.FileReader;
const baixados = [];
global.URL.createObjectURL = (blob) => { baixados.push(blob); return "blob:teste"; };
global.URL.revokeObjectURL = () => {};
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });

const ler = (arquivo) => JSON.parse(readFileSync(`./definicoes/${arquivo}.json`, "utf8"));
const chamadas = [];
const situacoes = { N1: "REJEITADO", N2: "REJEITADO" };

const resposta = (status, corpo, tipo = "json") => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  text: async () => (typeof corpo === "string" ? corpo : JSON.stringify(corpo)),
  json: async () => corpo,
  blob: async () => new dom.window.Blob([String(corpo)], { type: tipo })
});

global.fetch = async (url, opcoes = {}) => {
  const endereco = String(url);
  chamadas.push({ url: endereco, metodo: opcoes.method || "GET", corpo: opcoes.body ? JSON.parse(opcoes.body) : null, chave: opcoes.headers?.["x-api-key"] ?? null });

  if (endereco.startsWith("https://raw.githubusercontent.com")) return { ok: false, status: 404, json: async () => ({}) };
  const local = endereco.match(/^definicoes\/(.+)\.json$/);
  if (local) return { ok: true, status: 200, json: async () => ler(local[1]) };

  if (endereco.includes("/nfse/resolve/")) {
    const id = endereco.split("/").pop();
    situacoes[id] = "CONCLUIDO";
    return resposta(200, { message: "Solicitacao recebida" });
  }
  if (endereco.includes("/nfse/consultar/")) {
    const id = endereco.split("/").pop();
    return resposta(200, { id, situacao: situacoes[id] || "CONCLUIDO", numeroNfse: "900", codigoVerificacao: "ABC", mensagem: "ok" });
  }
  if (endereco.includes("/nfse/xml/")) return resposta(200, "<xml/>", "application/xml");
  if (endereco.includes("/nfse/sincronizar")) return resposta(200, { aceitos: 2 });
  if (endereco.includes("/nfse/email/")) return resposta(200, { message: "E-mail enviado" });
  if (endereco.includes("api/proxy")) {
    if (JSON.parse(opcoes.body || "{}").url?.includes("/cnc/")) return resposta(200, { contribuinte: { situacao: "Ativo", inscricaoFederal: "12345678000195" } });
    return resposta(200, { convenio: { aderente: true } });
  }
  return resposta(404, { message: "nao mapeado" });
};

let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const aguardarAte = async (condicao, limiteMs = 5000) => {
  const fim = Date.now() + limiteMs;
  while (!condicao() && Date.now() < fim) await esperar(10);
};
const abrirTela = async (id) => {
  itens.find((item) => item.dataset.rota === id).click();
  await aguardarAte(() => document.querySelector(`.tela[data-rota="${id}"]`)?.childElementCount > 0);
};
const clicar = (texto) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === texto)?.click();
const confirmar = async () => { await esperar(60); document.getElementById("confirmOk").click(); };

await import("../js/app.js");
document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
await aguardarAte(() => document.querySelector(".tela textarea"));
const itens = [...document.querySelectorAll(".menu-item")];

console.log("\n== resolve com conferência ==");
document.getElementById("apiKeyInput").value = "chave";
document.getElementById("apiKeyInput").dispatchEvent(new dom.window.Event("input"));
const areaIds = document.querySelector("textarea");
areaIds.value = "N1\nN2";
areaIds.dispatchEvent(new dom.window.Event("input"));
await aguardarAte(() => document.querySelector(".tela").textContent.includes("2 IDs válidos"));
clicar("Executar resolve");
await confirmar();
await aguardarAte(() => document.getElementById("logsPanel").textContent.includes("Resolve concluído"));

const linhas = [...document.querySelectorAll("tbody tr")].filter((l) => l.querySelector(".cell-desfecho"));
conferir("duas linhas de resultado", linhas.length === 2, String(linhas.length));
conferir("situação antes lida", linhas[0].children[2].textContent === "REJEITADO", linhas[0].children[2].textContent);
conferir("situação depois lida", linhas[0].children[3].textContent === "CONCLUIDO", linhas[0].children[3].textContent);
conferir("desfecho Resolvido", linhas[0].querySelector(".cell-desfecho").textContent === "Resolvido");
conferir("consulta antes e depois de cada nota",
  chamadas.filter((c) => c.url.includes("/nfse/consultar/")).length >= 4);

console.log("\n== consulta agrupada executa a rota escolhida ==");
await abrirTela("consulta");
document.getElementById("apiKeyInput").value = "chave";
document.getElementById("apiKeyInput").dispatchEvent(new dom.window.Event("input"));
const listaConsulta = document.querySelector(".tela textarea");
listaConsulta.value = "N9";
listaConsulta.dispatchEvent(new dom.window.Event("input"));
clicar("Consultar");
await aguardarAte(() => chamadas.some((c) => c.url.endsWith("/nfse/consultar/N9")));
conferir("consulta simplificada chama /nfse/consultar", chamadas.some((c) => c.url.endsWith("/nfse/consultar/N9")));
const alternadorCompleta = document.querySelector('.variantes-controles input[type="checkbox"]');
alternadorCompleta.checked = true;
alternadorCompleta.dispatchEvent(new dom.window.Event("change"));
const listaCompleta = document.querySelector(".tela textarea");
listaCompleta.value = "N9";
listaCompleta.dispatchEvent(new dom.window.Event("input"));
clicar("Consultar");
await aguardarAte(() => chamadas.some((c) => /\/nfse\/N9$/.test(c.url)));
conferir("consulta completa chama /nfse/{id}", chamadas.some((c) => /\/nfse\/N9$/.test(c.url)));

console.log("\n== empresa: teste de webhook e certificados ==");
await abrirTela("webhook");
document.getElementById("apiKeyInput").value = "chave";
document.getElementById("apiKeyInput").dispatchEvent(new dom.window.Event("input"));
const alternadorTeste = document.querySelector('.variantes-controles input[type="checkbox"]');
alternadorTeste.checked = true;
alternadorTeste.dispatchEvent(new dom.window.Event("change"));
const listaWebhook = document.querySelector(".tela textarea");
listaWebhook.value = "29062609000177";
listaWebhook.dispatchEvent(new dom.window.Event("input"));
clicar("Executar");
await confirmar();
await aguardarAte(() => chamadas.some((c) => c.url.endsWith("/empresa/29062609000177/webhook/verify")));
const chamadaTeste = chamadas.find((c) => c.url.endsWith("/empresa/29062609000177/webhook/verify"));
conferir("teste de webhook pede confirmação e usa POST", chamadaTeste?.metodo === "POST");
conferir("teste de webhook vai sem corpo, como na documentação", chamadaTeste && chamadaTeste.corpo === null);

await abrirTela("certificado");
[...document.querySelectorAll(".modo-botao")].find((b) => b.textContent === "Todos da conta").click();
await esperar(80);
clicar("Consultar");
await aguardarAte(() => chamadas.some((c) => c.url.endsWith("/certificado") && c.metodo === "GET"));
conferir("lista de certificados chama GET /certificado", chamadas.some((c) => c.url.endsWith("/certificado") && c.metodo === "GET"));

console.log("\n== rota de arquivo (XML) ==");
await abrirTela("xml");
document.getElementById("apiKeyInput").value = "chave";
document.getElementById("apiKeyInput").dispatchEvent(new dom.window.Event("input"));
document.querySelector("textarea").value = "X1\nX2";
document.querySelector("textarea").dispatchEvent(new dom.window.Event("input"));
const antesDoDownload = baixados.length;
clicar("Baixar arquivos");
await aguardarAte(() => baixados.length - antesDoDownload === 2 && document.querySelectorAll(".linha-resultado").length === 2);
conferir("baixou um arquivo por id", baixados.length - antesDoDownload === 2, String(baixados.length - antesDoDownload));
conferir("chamou a rota de XML", chamadas.filter((c) => c.url.includes("/nfse/xml/")).length === 2);
conferir("mostra linhas de resultado", document.querySelectorAll(".linha-resultado").length === 2);

console.log("\n== rota com corpo e confirmação (e-mail) ==");
await abrirTela("email");
document.getElementById("apiKeyInput").value = "chave";
document.getElementById("apiKeyInput").dispatchEvent(new dom.window.Event("input"));
document.querySelector("textarea").value = "E1";
document.querySelector("textarea").dispatchEvent(new dom.window.Event("input"));
const campoDestinatarios = [...document.querySelectorAll(".config-field")]
  .find((bloco) => bloco.textContent.includes("Destinatários"))?.querySelector("input");
conferir("campo de destinatários encontrado", Boolean(campoDestinatarios));
campoDestinatarios.value = "consultor@exemplo.com.br, cliente@exemplo.com.br";
clicar("Executar");
await confirmar();
await aguardarAte(() => chamadas.some((c) => c.url.includes("/nfse/email/")));
const chamadaEmail = chamadas.find((c) => c.url.includes("/nfse/email/"));
conferir("enviou POST para a rota de e-mail", chamadaEmail?.metodo === "POST");
conferir("montou a lista de destinatários",
  Array.isArray(chamadaEmail?.corpo?.destinatarios) && chamadaEmail.corpo.destinatarios.length === 2,
  JSON.stringify(chamadaEmail?.corpo));
conferir("enviou a marcação de reenvio", chamadaEmail?.corpo?.reenvio === true);

console.log("\n== rota de conjunto (sincronizar) ==");
await abrirTela("sincronizar");
document.getElementById("apiKeyInput").value = "chave";
document.getElementById("apiKeyInput").dispatchEvent(new dom.window.Event("input"));
document.querySelector("textarea").value = "S1\nS2\nS3";
document.querySelector("textarea").dispatchEvent(new dom.window.Event("input"));
clicar("Executar");
await confirmar();
await aguardarAte(() => chamadas.some((c) => c.url.includes("/nfse/sincronizar")));
const chamadaSinc = chamadas.filter((c) => c.url.includes("/nfse/sincronizar"));
conferir("uma única chamada para o lote", chamadaSinc.length === 1, String(chamadaSinc.length));
conferir("corpo é a lista de ids",
  Array.isArray(chamadaSinc[0]?.corpo) && chamadaSinc[0].corpo.length === 3,
  JSON.stringify(chamadaSinc[0]?.corpo));

console.log("\n== rota do Nacional pelo repasse ==");
await abrirTela("convenio");
const cartaoRetorno = document.querySelector(".cartao-retorno");
conferir("cartão de retorno já visível antes de consultar", Boolean(cartaoRetorno) && !cartaoRetorno.hidden);
conferir("cartão de retorno com estado vazio", cartaoRetorno?.textContent.includes("Nenhuma requisição executada ainda"));
conferir("retorno é o último cartão da tela, logo abaixo da requisição",
  cartaoRetorno?.parentElement.lastElementChild === cartaoRetorno && !cartaoRetorno?.parentElement.nextElementSibling);
document.querySelector("textarea").value = "4115200";
document.querySelector("textarea").dispatchEvent(new dom.window.Event("input"));
clicar("Consultar");
await aguardarAte(() => document.querySelector(".retorno textarea")?.value.includes("aderente"));
const chamadaProxy = chamadas.find((c) => c.url.startsWith("api/proxy"));
conferir("passou pelo repasse", Boolean(chamadaProxy), chamadaProxy?.url);
conferir("repasse aponta para o ADN", chamadaProxy?.corpo?.url === "https://adn.nfse.gov.br/parametrizacao/4115200/convenio", JSON.stringify(chamadaProxy?.corpo));
conferir("sem certificado vai por POST, com a URL só no corpo",
  chamadaProxy?.url === "api/proxy" && chamadaProxy.metodo === "POST" && !("certificado" in (chamadaProxy.corpo || {})), JSON.stringify(chamadaProxy));
const chamadasAoRepasse = chamadas.filter((c) => c.url.startsWith("api/proxy"));
conferir("não mandou API Key ao Nacional", chamadasAoRepasse.length > 0 && chamadasAoRepasse.every((c) => c.chave === null));
const retorno = document.querySelector(".retorno");
conferir("retorno visível na tela", Boolean(retorno) && !retorno.closest(".card").hidden && retorno.closest(".card").classList.contains("cartao-retorno"));
conferir("retorno mostra a URL chamada no Nacional", retorno?.querySelector(".retorno-url")?.textContent === "GET https://adn.nfse.gov.br/parametrizacao/4115200/convenio", retorno?.querySelector(".retorno-url")?.textContent);
conferir("retorno completo em campo", retorno?.querySelector("textarea")?.value.includes("aderente"));

console.log("\n== contribuinte com certificado ==");
await abrirTela("cnc");
const cartaoCertificado = [...document.querySelectorAll(".card")].find((c) => c.textContent.includes("Certificado digital"));
conferir("cartão de certificado na tela do Nacional", Boolean(cartaoCertificado));
const campoArquivo = cartaoCertificado.querySelector('input[type="file"]');
Object.defineProperty(campoArquivo, "files", { value: [new dom.window.File([readFileSync("./testes/certificados/cliente-legado.pfx")], "certificado.pfx")] });
cartaoCertificado.querySelector('input[type="password"]').value = "senha123";
[...cartaoCertificado.querySelectorAll("button")].find((b) => b.textContent === "Carregar certificado").click();
await aguardarAte(() => cartaoCertificado.textContent.includes("EMPRESA TESTE LTDA:12345678000195"));
conferir("mostra o titular do certificado", cartaoCertificado.textContent.includes("EMPRESA TESTE LTDA:12345678000195"));
conferir("senha apagada do campo", cartaoCertificado.querySelector('input[type="password"]').value === "");
const listaCnc = document.querySelector(".tela textarea");
listaCnc.value = "12345678000195";
listaCnc.dispatchEvent(new dom.window.Event("input"));
[...document.querySelectorAll(".config-field")].find((b) => b.textContent.includes("Código IBGE do município")).querySelector("input").value = "3504107";
const retornosAntesDoCnc = document.querySelectorAll(".retorno").length;
clicar("Consultar");
await aguardarAte(() => document.querySelectorAll(".retorno").length > retornosAntesDoCnc
  && [...document.querySelectorAll(".retorno")].pop().querySelector("textarea")?.value.includes("12345678000195"));
const chamadaCnc = chamadas.filter((c) => c.url === "api/proxy" && c.metodo === "POST").pop();
conferir("com certificado usa POST no repasse", Boolean(chamadaCnc));
conferir("URL do contribuinte montada", chamadaCnc?.corpo?.url === "https://adn.nfse.gov.br/cnc/consulta/cad?codMunicipio=3504107&inscricaoFederal=12345678000195", chamadaCnc?.corpo?.url);
conferir("envia chave e certificado em PEM", chamadaCnc?.corpo?.certificado?.chave?.startsWith("-----BEGIN RSA PRIVATE KEY-----") && chamadaCnc?.corpo?.certificado?.certificado?.includes("BEGIN CERTIFICATE"));
conferir("a senha não sai do navegador", !JSON.stringify(chamadaCnc?.corpo || {}).includes("senha123"));
const retornoCnc = [...document.querySelectorAll(".retorno")].pop();
conferir("retorno do contribuinte exibido e visível", retornoCnc?.querySelector("textarea")?.value.includes("12345678000195") && !retornoCnc.closest(".card").hidden);
[...cartaoCertificado.querySelectorAll("button")].find((b) => b.textContent === "Remover").click();
const chamadasAntesDaRemocao = chamadas.length;
clicar("Consultar");
await aguardarAte(() => chamadas.length > chamadasAntesDaRemocao);
const semCertificado = chamadas[chamadas.length - 1];
conferir("removido o certificado, o corpo segue sem ele",
  semCertificado.url === "api/proxy" && semCertificado.metodo === "POST" && semCertificado.corpo?.url?.includes("/cnc/consulta/cad") && !("certificado" in semCertificado.corpo), JSON.stringify(semCertificado));

console.log("\n== itens . e .. não desviam o caminho da rota ==");
const avisos = () => [...document.querySelectorAll(".toast")].map((aviso) => aviso.textContent);
const chamadasAntesDosPontos = chamadas.length;
await abrirTela("xml");
document.querySelector("textarea").value = "X9\n..";
document.querySelector("textarea").dispatchEvent(new dom.window.Event("input"));
await esperar(300);
clicar("Baixar arquivos");
await esperar(300);
conferir("rota de arquivo recusa o item .. sem chamar a API", chamadas.length === chamadasAntesDosPontos && avisos().some((texto) => texto.includes('"."')));
await abrirTela("webhook");
const alternadorTestePontos = document.querySelector('.variantes-controles input[type="checkbox"]');
alternadorTestePontos.checked = true;
alternadorTestePontos.dispatchEvent(new dom.window.Event("change"));
document.querySelector(".tela textarea").value = "..";
document.querySelector(".tela textarea").dispatchEvent(new dom.window.Event("input"));
await esperar(300);
clicar("Executar");
await esperar(300);
conferir("teste de webhook da empresa com .. não vira o teste da organização",
  document.getElementById("confirmModal").hidden && chamadas.length === chamadasAntesDosPontos && !chamadas.some((c) => c.url.endsWith("/webhook/verify") && !c.url.includes("/empresa/")));
await abrirTela("resolve");
document.querySelector("textarea").value = "N1\n.";
document.querySelector("textarea").dispatchEvent(new dom.window.Event("input"));
await esperar(400);
clicar("Executar resolve");
await esperar(300);
conferir("resolve recusa o item . antes de confirmar", document.getElementById("confirmModal").hidden && chamadas.length === chamadasAntesDosPontos);

console.log("\n== destino da API Key em todos os fluxos ==");
const comChave = chamadas.filter((c) => c.chave);
conferir("toda chamada com API Key vai só para a API PlugNotas",
  comChave.length > 0 && comChave.every((c) => new URL(c.url).origin === "https://api.plugnotas.com.br"),
  comChave.filter((c) => !c.url.startsWith("https://api.plugnotas.com.br/")).map((c) => c.url).join(", "));
conferir("nenhuma chamada ao repasse leva API Key", chamadas.filter((c) => c.url.startsWith("api/proxy")).every((c) => c.chave === null));

console.log(falhas === 0 ? "\nTeste de execução passou." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
