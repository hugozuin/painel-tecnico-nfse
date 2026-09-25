import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const ler = (arquivo) => JSON.parse(readFileSync(`./definicoes/${arquivo}.json`, "utf8"));
let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let remotoLigado = true;
async function abrirApp(respostaRemota) {
  const dom = new JSDOM(readFileSync("./index.html", "utf8"), { url: "https://demo.local/" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  global.sessionStorage = dom.window.sessionStorage;
  global.location = dom.window.location;
  global.history = dom.window.history;
  global.Blob = dom.window.Blob;
  global.FileReader = dom.window.FileReader;
  global.URL.createObjectURL = () => "blob:teste";
  global.URL.revokeObjectURL = () => {};
  Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });

  global.fetch = async (url) => {
    const endereco = String(url);
    if (endereco.startsWith("https://raw.githubusercontent.com")) return respostaRemota(endereco);
    const local = endereco.match(/^definicoes\/(.+)\.json$/);
    if (local && local[1] === "config") return { ok: true, status: 200, json: async () => ({ ...ler("config"), atualizacaoRemota: remotoLigado, botaoRepositorio: remotoLigado }) };
    if (local) return { ok: true, status: 200, json: async () => ler(local[1]) };
    return { ok: false, status: 404, json: async () => ({}) };
  };

  await import(`../js/app.js?v=${Math.random()}`);
  document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await esperar(400);
  return dom;
}

console.log("\n== rota nova publicada no repositório ==");
const rotasNovas = ler("rotas");
rotasNovas.rotas.push({
  id: "certificado",
  grupo: "Notas",
  titulo: "Consulta de certificado",
  resumo: "Rota adicionada pelo repositório, sem mexer no código.",
  metodo: "GET",
  caminho: "/certificado/{item}",
  entrada: { tipo: "lote", rotulo: "IDs de certificado" },
  resultado: { tipo: "json" },
  ordem: 9
});

await abrirApp((endereco) => {
  if (endereco.includes("rotas.json")) return { ok: true, status: 200, json: async () => rotasNovas };
  return { ok: false, status: 404, json: async () => ({}) };
});

const itens = [...document.querySelectorAll(".menu-item")].map((i) => i.dataset.rota);
conferir("rota nova aparece no menu", itens.includes("certificado"), itens.join(","));
conferir("log indica atualização pelo repositório",
  document.getElementById("logsPanel").textContent.includes("atualizadas pelo repositório"));

document.querySelector('[data-rota="certificado"]').click();
await esperar(80);
const botaoRepositorio = document.getElementById("linkRepositorio");
conferir("botão volta ao ligar botaoRepositorio", !botaoRepositorio.hidden && botaoRepositorio.href.includes("github.com"));
conferir("tela da rota nova é montada", document.body.textContent.includes("Consulta de certificado"));
conferir("usa o caminho publicado", document.querySelector(".rota-endereco").textContent.includes("/certificado/{item}"));

console.log("\n== arquivo remoto inválido é ignorado ==");
await abrirApp((endereco) => {
  if (endereco.includes("rotas.json")) return { ok: true, status: 200, json: async () => ({ rotas: "isto não é uma lista" }) };
  return { ok: false, status: 404, json: async () => ({}) };
});

const itensDepois = [...document.querySelectorAll(".menu-item")].map((i) => i.dataset.rota);
conferir("mantém o catálogo publicado", itensDepois.includes("resolve") && itensDepois.includes("xml"));
conferir("não quebra a aplicação", document.querySelectorAll(".menu-item").length > 10, String(itensDepois.length));
conferir("registra o motivo no log",
  document.getElementById("logsPanel").textContent.includes("ignorada"),
  document.getElementById("logsPanel").textContent.slice(0, 200));

console.log("\n== repositório fora do ar ==");
await abrirApp(() => { throw new Error("sem rede"); });
conferir("segue com a cópia publicada", document.querySelectorAll(".menu-item").length > 10);
conferir("log informa a cópia publicada",
  document.getElementById("logsPanel").textContent.includes("cópia publicada"));

console.log("\n== configuração entregue (repositório privado) ==");
remotoLigado = false;
let consultouGitHub = false;
await abrirApp(() => { consultouGitHub = true; return { ok: false, status: 404, json: async () => ({}) }; });
conferir("config entregue desliga a leitura remota", ler("config").atualizacaoRemota === false);
conferir("painel não consulta o GitHub", !consultouGitHub);
conferir("botão oculto com a configuração entregue", document.getElementById("linkRepositorio").hidden);
conferir("menu completo com a cópia publicada", document.querySelectorAll(".menu-item").length > 10);

console.log(falhas === 0 ? "\nTeste de atualização passou." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
