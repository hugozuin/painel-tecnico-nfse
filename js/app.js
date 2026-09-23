/* Ponto de entrada. O menu e as telas saem do catálogo de rotas, então
   acrescentar uma rota no arquivo de definições cria a tela sem mexer aqui. */

import {
  elemento, criar, iniciarTema, identificacao, atualizarRotuloUsuario,
  mostrarAviso, baixarArquivo, carimboDeTempo, restaurarLogs, limparLogs, textoDosLogs, registrarLog
} from "./shared.js";
import { carregarDefinicoes, definicoes, enderecoRepositorio } from "./definicoes.js";
import { iniciarCredencial } from "./credencial.js";
import { iniciarInfo, fecharPopup } from "./info.js";
import { montarTelaRota } from "./telas/lote.js";
import { montarTelaResolve } from "./telas/resolve.js";
import { montarTelaNacional } from "./telas/nacional.js";
import { montarTelaDePara } from "./telas/depara.js";
import { montarTelaIbsCbs } from "./telas/ibscbs.js";
import { montarTelaValidador } from "./telas/validador.js";

export const NOME_APLICACAO = "Painel Técnico NFS-e";

const telasFixas = [
  {
    id: "depara", grupo: "Ferramentas", titulo: "De-para do Nacional", tela: "depara", ordem: 1,
    resumo: "Tags do XML do Nacional com a descrição e as regras de negócio do anexo VI, e o campo do PlugNotas que preenche cada uma."
  },
  {
    id: "ibscbs", grupo: "Ferramentas", titulo: "Relação IBS e CBS", tela: "ibscbs", ordem: 2,
    resumo: "Pesquise um item da LC 116 ou um código de operação (indOp) e veja os NBS e cClassTrib relacionados nos anexos VII e VIII."
  },
  {
    id: "validador", grupo: "Ferramentas", titulo: "Validador de JSON", tela: "validador", ordem: 3,
    resumo: "Confere o corpo de emissão antes do envio. Cada achado informa a fonte: anexos do Nacional, lib, script ou cálculo."
  }
];

const ordemGrupos = ["Notas", "Arquivos", "Ciclo de vida", "Nacional", "Ferramentas"];

let catalogo = [];
let navegacao = 0;

function montarCatalogo() {
  const plugnotas = (definicoes.rotas?.rotas || []).map((rota) => ({ ...rota, origem: "plugnotas" }));
  const nacional = (definicoes.rotasNacional?.rotas || []).map((rota) => ({ ...rota, origem: "nacional" }));
  catalogo = [...plugnotas, ...nacional, ...telasFixas];
}

function desenharMenu() {
  const menu = elemento("menuLateral");
  menu.textContent = "";
  const posicao = (grupo) => {
    const indice = ordemGrupos.indexOf(grupo);
    return indice === -1 ? ordemGrupos.length : indice;
  };
  const grupos = [...new Set(catalogo.map((rota) => rota.grupo))].sort((a, b) => posicao(a) - posicao(b));

  grupos.forEach((grupo) => {
    const itens = catalogo
      .filter((rota) => rota.grupo === grupo)
      .sort((primeira, segunda) => (primeira.ordem || 99) - (segunda.ordem || 99));
    menu.appendChild(criar("div", { class: "menu-grupo" }, [
      criar("span", { class: "menu-grupo-titulo", texto: grupo }),
      ...itens.map((rota) => criar("a", { class: "menu-item", href: `#${rota.id}`, dados: { rota: rota.id }, title: rota.resumo || "" }, [
        criar("span", { class: "menu-item-titulo", texto: rota.titulo }),
        rota.sensivel ? criar("span", { class: "menu-marca", texto: "sensível" }) : null
      ]))
    ]));
  });
}

function cabecalhoDaPagina(rota) {
  return criar("header", { class: "cabecalho-pagina" }, [
    criar("span", { class: "cabecalho-grupo", texto: rota.grupo }),
    criar("h1", { texto: rota.titulo }),
    rota.resumo ? criar("p", { texto: rota.resumo }) : null
  ]);
}

function abrirRota(id) {
  const rota = catalogo.find((item) => item.id === id) || catalogo[0];
  if (!rota) return;
  const marca = ++navegacao;
  fecharPopup();

  const conteudo = elemento("conteudo");
  conteudo.textContent = "";
  document.title = `${rota.titulo} · ${NOME_APLICACAO}`;
  document.querySelectorAll(".menu-item").forEach((item) => item.classList.toggle("ativo", item.dataset.rota === rota.id));

  conteudo.appendChild(cabecalhoDaPagina(rota));
  if (rota.origem === "plugnotas") {
    conteudo.appendChild(elemento("tplCredencial").content.cloneNode(true));
    iniciarCredencial();
  }

  const tela = criar("div", { class: "tela", dados: { rota: rota.id } });
  conteudo.appendChild(tela);
  conteudo.appendChild(elemento("tplLogs").content.cloneNode(true));
  ligarLogs();
  restaurarLogs();
  atualizarRotuloUsuario();

  let montagem;
  if (rota.tela === "resolve") montagem = montarTelaResolve(tela);
  else if (rota.tela === "depara") montagem = montarTelaDePara(tela);
  else if (rota.tela === "ibscbs") montagem = montarTelaIbsCbs(tela);
  else if (rota.tela === "validador") montagem = montarTelaValidador(tela);
  else if (rota.origem === "nacional") montagem = montarTelaNacional(tela, rota);
  else {
    montagem = montarTelaRota(tela, rota, {
      exigeApiKey: true,
      concorrencia: 5,
      descricaoBase: definicoes.rotas?.base || "",
      base: () => definicoes.rotas?.base || ""
    });
  }
  Promise.resolve(montagem).catch((erro) => {
    if (marca === navegacao) registrarLog(`Falha ao montar a tela ${rota.titulo}: ${erro.message}`, "error");
  });

  if (location.hash !== `#${rota.id}`) history.replaceState(null, "", `#${rota.id}`);
  document.querySelector(".app-shell")?.classList.remove("menu-aberto");
}

function ligarLogs() {
  elemento("usuarioChip").addEventListener("click", () => identificacao.solicitar());
  elemento("clearLogsBtn").addEventListener("click", limparLogs);
  elemento("exportLogsBtn").addEventListener("click", () => {
    const conteudo = textoDosLogs().trim();
    if (!conteudo) {
      mostrarAviso("Não há logs para exportar.", "info");
      return;
    }
    const cabecalho = [
      `Logs da sessao - ${NOME_APLICACAO}`,
      `Usuario: ${identificacao.ler() || "nao identificado"}`,
      `Exportado em: ${new Date().toLocaleString("pt-BR")}`,
      "=".repeat(64),
      "",
      ""
    ].join("\n");
    baixarArquivo(cabecalho + conteudo + "\n", `logs-painel-${carimboDeTempo()}.txt`, "text/plain;charset=utf-8");
    mostrarAviso("Logs exportados.", "success");
  });
}

function ligarNavegacao() {
  window.addEventListener("hashchange", () => abrirRota(location.hash.replace("#", "")));
  elemento("menuLateral").addEventListener("click", (evento) => {
    const item = evento.target.closest(".menu-item");
    if (!item) return;
    evento.preventDefault();
    abrirRota(item.dataset.rota);
  });
  elemento("alternarMenu").addEventListener("click", () => {
    document.querySelector(".app-shell")?.classList.toggle("menu-aberto");
  });
}

async function iniciar() {
  iniciarTema();
  iniciarInfo();
  ligarNavegacao();
  await carregarDefinicoes();
  montarCatalogo();
  desenharMenu();

  const endereco = enderecoRepositorio();
  if (definicoes.config?.botaoRepositorio === true && endereco) {
    const link = elemento("linkRepositorio");
    link.href = endereco;
    link.hidden = false;
  }

  abrirRota(location.hash.replace("#", ""));
  registrarLog("Ferramenta carregada e pronta para uso.");
}

document.addEventListener("DOMContentLoaded", iniciar);
