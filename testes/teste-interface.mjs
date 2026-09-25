import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const dom = new JSDOM(readFileSync("./index.html", "utf8"), { url: "https://demo.local/", pretendToBeVisual: true });
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

const ler = (nome) => JSON.parse(readFileSync(`./definicoes/${nome}.json`, "utf8"));
global.fetch = async (url) => {
  const endereco = String(url);
  if (endereco.startsWith("https://raw.githubusercontent.com")) return { ok: false, status: 404, json: async () => ({}) };
  const local = endereco.match(/^definicoes\/(.+)\.json$/);
  if (local) return { ok: true, status: 200, json: async () => ler(local[1]) };
  return { ok: false, status: 404, json: async () => ({}) };
};

let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const evento = (tipo, alvo, extra = {}) => alvo.dispatchEvent(new dom.window.MouseEvent(tipo, { bubbles: true, ...extra }));
const tecla = (nome) => document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: nome, bubbles: true }));
const digitar = async (campo, valor) => { campo.value = valor; campo.dispatchEvent(new dom.window.Event("input")); await esperar(320); };
const erros = [];
dom.window.addEventListener("error", (e) => erros.push(e.message));

await import("../js/app.js");
const { estadoDoPopup } = await import("../js/info.js");
document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
await esperar(500);
const abrir = async (id) => { document.querySelector(`.menu-item[data-rota="${id}"]`).click(); await esperar(450); };

console.log("\n== identidade ==");
conferir("sem erro de janela", erros.length === 0, erros.join(" | "));
conferir("nome novo no cabeçalho", document.querySelector(".header-titles h1").textContent === "Painel Técnico NFS-e");
conferir("título da aba do navegador", document.title.includes("Painel Técnico NFS-e"), document.title);
conferir("logo nova", document.querySelector(".marca-logo").getAttribute("src") === "assets/logo.svg");
conferir("favicon novo", document.querySelector('link[rel="icon"]').getAttribute("href") === "assets/favicon.svg");
const rodape = document.querySelector(".app-footer").textContent;
conferir("rodapé com Consultoria Técnica NFS-e e autoria", rodape.includes("Consultoria Técnica NFS-e") && rodape.includes("Desenvolvido por Hugo Zuin"));
conferir("rodapé com destaque no nome", document.querySelector(".app-footer strong")?.textContent === "Painel Técnico NFS-e · Consultoria Técnica NFS-e");
conferir("autoria com menos destaque", document.querySelector(".app-footer .assinatura")?.textContent === "Desenvolvido por Hugo Zuin");
conferir("rodapé sem a origem das definições", !rodape.includes("Definições") && !document.getElementById("rodapeDefinicoes"));
const total = ler("rotas").rotas.filter((r) => !r.oculta).length + ler("rotas-nacional").rotas.length + 3;
conferir("botão Repositório oculto pela configuração entregue", document.getElementById("linkRepositorio").hidden);
conferir("menu com a aba de IBS e CBS", document.querySelectorAll(".menu-item").length === total, String(document.querySelectorAll(".menu-item").length));

console.log("\n== título de cada tela ==");
await abrir("xml");
const cabecalho = document.querySelector(".cabecalho-pagina");
conferir("título da tela visível", cabecalho?.querySelector("h1")?.textContent === "Download de XML");
conferir("legenda da tela", cabecalho?.querySelector("p")?.textContent === ler("rotas").rotas.find((r) => r.id === "xml").resumo);
conferir("grupo acima do título", cabecalho?.querySelector(".cabecalho-grupo")?.textContent === "Arquivos");
conferir("cartão sem repetir o título", document.querySelector(".tela .card-header h2")?.textContent === "Requisição");

console.log("\n== consulta de notas agrupada ==");
conferir("menu sem as rotas internas", !document.querySelector('.menu-item[data-rota="consulta-id"]') && !document.querySelector('.menu-item[data-rota="consulta-periodo"]'));
await abrir("consulta");
const endereco = () => document.querySelector(".rota-endereco")?.textContent || "";
const modos = [...document.querySelectorAll(".modo-botao")];
const toggle = document.querySelector('.variantes-controles input[type="checkbox"]');
const cartaoRequisicao = document.querySelector(".variantes-controles")?.closest(".card");
conferir("seletor dentro do cartão Requisição", cartaoRequisicao?.querySelector(".card-header h2")?.textContent === "Requisição");
conferir("seletor logo acima do endereço da rota", Boolean(cartaoRequisicao?.querySelector(".variantes-controles + .rota-endereco")));
conferir("sem bloco exclusivo para o seletor", document.querySelectorAll(".tela > .card").length === 2, String(document.querySelectorAll(".tela > .card").length));
conferir("três formas de consulta", modos.map((b) => b.textContent).join("|") === "ID da nota|idIntegracao|Período");
conferir("título da tela agrupada", document.querySelector(".cabecalho-pagina h1")?.textContent === "Consulta de notas");
conferir("começa pelo ID simplificado", modos[0].classList.contains("ativo") && endereco().endsWith("/nfse/consultar/{item}"), endereco());
toggle.checked = true;
toggle.dispatchEvent(new dom.window.Event("change"));
conferir("toggle troca para a consulta completa", endereco().endsWith("/nfse/{item}"), endereco());
modos[1].click();
conferir("idIntegracao usa a rota com CNPJ", endereco().endsWith("/nfse/consultar/{item}/{cnpj}"), endereco());
conferir("toggle desabilitado sem versão completa", toggle.disabled && !toggle.checked);
modos[2].click();
conferir("período mostra datas e não lista", Boolean(document.querySelector('.tela input[type="date"]')) && !document.querySelector(".tela textarea"));
modos[0].click();
conferir("volta ao ID lembrando a escolha completa", endereco().endsWith("/nfse/{item}") && toggle.checked, endereco());
conferir("cartão de retorno presente na subtela", Boolean(document.querySelector(".cartao-retorno")));

console.log("\n== grupo Empresa ==");
conferir("grupos do menu na ordem", [...document.querySelectorAll(".menu-grupo-titulo")].map((g) => g.textContent).join(",") === "Notas,Arquivos,Ciclo de vida,Empresa,Nacional,Ferramentas",
  [...document.querySelectorAll(".menu-grupo-titulo")].map((g) => g.textContent).join(","));
conferir("três telas de Empresa no menu, sem relatório", ["empresa", "webhook", "certificado"].every((id) => document.querySelector(`.menu-item[data-rota="${id}"]`)) && !document.querySelector('.menu-item[data-rota="relatorio"]'));
await abrir("empresa");
conferir("cadastro sem toggle", !document.querySelector('.variantes-controles input[type="checkbox"]'));
conferir("formas do cadastro", [...document.querySelectorAll(".modo-botao")].map((b) => b.textContent).join("|") === "Por CNPJ|Todas da conta|Logotipo");
conferir("cadastro por CNPJ usa /empresa/{item}", endereco().endsWith("/empresa/{item}"), endereco());
[...document.querySelectorAll(".modo-botao")][1].click();
conferir("lista usa /empresa", endereco().endsWith("/empresa"), endereco());
await abrir("webhook");
const alternadorWebhook = document.querySelector('.variantes-controles input[type="checkbox"]');
conferir("toggle Enviar um teste", document.querySelector(".variantes-controles .switch-text strong")?.textContent === "Enviar um teste");
conferir("webhook da empresa por padrão", endereco().endsWith("/empresa/{item}/webhook"), endereco());
alternadorWebhook.checked = true;
alternadorWebhook.dispatchEvent(new dom.window.Event("change"));
conferir("teste da empresa usa /webhook/verify", endereco().endsWith("/empresa/{item}/webhook/verify"), endereco());
conferir("teste marcado como sensível", document.querySelector(".tela .card-header")?.textContent.includes("ação sensível"));
[...document.querySelectorAll(".modo-botao")][1].click();
conferir("teste da organização usa /webhook/verify", endereco().endsWith("/webhook/verify") && !endereco().includes("empresa"), endereco());

console.log("\n== de-para por tag ==");
await abrir("depara");
conferir("tags listadas", document.querySelectorAll(".depara-item").length === 100, String(document.querySelectorAll(".depara-item").length));
conferir("botão para mostrar mais", !document.querySelector(".tela .btn.btn-outline:not([hidden])")?.hidden);
const busca = document.querySelector('.tela input[type="search"]');
await digitar(busca, "tpRetISSQN");
const primeiro = document.querySelector(".depara-item");
conferir("busca pela tag traz a tag primeiro", primeiro?.querySelector(".tag-nome")?.textContent === "tpRetISSQN");
conferir("tag com a referência do anexo", primeiro?.querySelector(".tag-titulo")?.textContent === "Tipo de retencao do ISSQN");
conferir("lado do PlugNotas informado", primeiro?.textContent.includes("IssRetido") && primeiro?.textContent.includes("não identificado"));
await digitar(busca, "E0580");
conferir("busca por código de rejeição", [...document.querySelectorAll(".tag-nome")].some((t) => t.textContent === "tpRetISSQN"));
await digitar(busca, "retencao do issqn");
conferir("busca pela descrição", [...document.querySelectorAll(".tag-nome")].some((t) => t.textContent === "tpRetISSQN"));
await digitar(busca, "tpRetISSQN");

const icone = document.querySelector(".depara-item .info-icone");
evento("mouseover", icone);
await esperar(30);
conferir("popup abre ao passar o mouse", estadoDoPopup().aberto);
conferir("popup traz as regras de negócio", estadoDoPopup().texto.includes("E0580") && estadoDoPopup().texto.includes("Regras de negócio"));
tecla("Shift");
conferir("Shift fixa o popup", estadoDoPopup().fixado && document.querySelector(".info-popup").classList.contains("fixado"));
evento("mouseout", icone, { relatedTarget: document.body });
await esperar(260);
conferir("popup fixado continua aberto", estadoDoPopup().aberto);
tecla("Escape");
conferir("Esc fecha", !estadoDoPopup().aberto);
evento("click", icone);
conferir("clique também fixa", estadoDoPopup().fixado);
evento("click", document.querySelector(".cabecalho-pagina"));
conferir("clique fora fecha", !estadoDoPopup().aberto);
evento("mouseover", icone);
evento("mouseout", icone, { relatedTarget: document.body });
await esperar(260);
conferir("sem fixar, fecha ao sair", !estadoDoPopup().aberto);

await digitar(busca, "");
const marcador = [...document.querySelectorAll('.tela input[type="checkbox"]')][0];
marcador.checked = true;
marcador.dispatchEvent(new dom.window.Event("change"));
await esperar(50);
const contagem = Number(document.querySelector(".tela .badge-neutral").textContent.split(" ")[0]);
conferir("filtro de tags preenchidas pelo PlugNotas", contagem > 0 && contagem < 430, String(contagem));

console.log("\n== relação IBS e CBS ==");
await abrir("ibscbs");
const campo = document.querySelector('.tela input[type="search"]');
await digitar(campo, "01.01");
const cartao = document.querySelector(".ibscbs-resultado .card");
conferir("item encontrado com a descrição", cartao?.textContent.includes("Análise E Desenvolvimento De Sistemas."));
conferir("NBS listados", cartao?.textContent.includes("1.1502.10.00") && cartao?.textContent.includes("1.1502.90.00"));
const linha90 = [...cartao.querySelectorAll("tbody tr")].find((l) => l.textContent.includes("1.1502.90.00"));
conferir("três cClassTrib no NBS mesclado", linha90?.querySelectorAll(".chips .codigo-info").length === 3);
const iconeClass = linha90.querySelector(".chips .info-icone");
evento("mouseover", iconeClass);
await esperar(30);
conferir("popup com o nome do cClassTrib", estadoDoPopup().texto.includes("Situações tributadas integralmente pelo IBS e CBS."));
tecla("Escape");
[...document.querySelectorAll(".modo-botao")].find((b) => b.textContent.includes("indOp")).click();
await digitar(document.querySelector('.tela input[type="search"]'), "100301");
const cartaoIndOp = document.querySelector(".ibscbs-resultado .card");
conferir("indOp com o tipo do anexo VII", cartaoIndOp?.textContent.includes("Demais serviços, em operações onerosas"));
conferir("itens que usam o indOp", cartaoIndOp?.textContent.includes("01.01"));
conferir("regra do inciso X disponível", document.querySelector(".regra-inciso")?.textContent.includes("100301"));

console.log("\n== validador ==");
await abrir("validador");
await esperar(300);
const botao = [...document.querySelectorAll(".tela button")].find((b) => b.textContent === "Analisar JSON");
conferir("liberado após carregar as referências", !botao.disabled);
document.querySelector(".tela textarea").value = JSON.stringify({
  prestador: { cpfCnpj: "29062609000178" },
  servico: [{ codigo: "010101", valor: { servico: 100 }, discriminacao: "teste", iss: { aliquota: 8 },
    retencao: { pis: { valor: 1 }, csll: { valor: 2 } } }]
});
botao.click();
await esperar(80);
const achados = document.querySelectorAll(".finding");
conferir("achados exibidos", achados.length > 0);
conferir("cada achado mostra a fonte", [...achados].every((a) => a.querySelector(".finding-fonte")?.textContent.startsWith("Fonte:")));
const chip = [...document.querySelectorAll(".tag-xml")].find((t) => t.textContent.startsWith("pAliq"));
conferir("chip da tag pAliq", Boolean(chip));
evento("mouseover", chip.querySelector(".info-icone"));
await esperar(30);
conferir("popup de regras no chip", estadoDoPopup().texto.includes("E0595"));
tecla("Escape");

console.log("\n== logs ==");
conferir("histórico mantido entre telas", document.getElementById("logsPanel").textContent.includes("pronta para uso"));
conferir("origem das definições registrada no log", document.getElementById("logsPanel").textContent.includes("cópia publicada"));
conferir("nenhuma aba traz cartão de logs", !document.getElementById("cardLogs") && !document.querySelector(".tela")?.nextElementSibling);
const botaoLogs = document.getElementById("abrirLogs");
conferir("botão de logs no cabeçalho", Boolean(botaoLogs?.closest(".header-actions")));
conferir("contador no botão", Number(document.getElementById("logCounter").textContent) > 0, document.getElementById("logCounter").textContent);
const fundoLogs = document.getElementById("painelLogsFundo");
conferir("painel começa fechado", fundoLogs.hidden);
botaoLogs.click();
conferir("botão abre o painel", !fundoLogs.hidden);
tecla("Escape");
conferir("Esc fecha o painel", fundoLogs.hidden);
botaoLogs.click();
fundoLogs.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
conferir("clique fora fecha o painel", fundoLogs.hidden);
botaoLogs.click();
document.getElementById("usuarioChip").click();
conferir("identificação abre por cima do painel", !document.getElementById("usuarioModal").hidden);
tecla("Escape");
conferir("Esc fecha só a identificação", document.getElementById("usuarioModal").hidden && !fundoLogs.hidden);
document.getElementById("fecharLogs").click();
conferir("botão de fechar funciona", fundoLogs.hidden);
document.getElementById("clearLogsBtn").click();
conferir("limpar zera o contador do cabeçalho", document.getElementById("logCounter").textContent === "0");
conferir("limpar zera o contador do painel", document.getElementById("logContagemPainel").textContent === "0 registros");

console.log(falhas === 0 ? "\nTodos os testes de interface passaram." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
