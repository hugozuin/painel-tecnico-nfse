import { criar } from "./shared.js";

export function montarCartao({ titulo, passo, classe, oculto, cabecalho = [] }, corpo = []) {
  return criar("section", { class: classe ? `card ${classe}` : "card", hidden: oculto }, [
    titulo === undefined ? null : criar("div", { class: "card-header" }, [
      passo ? criar("span", { class: "card-step", texto: passo }) : null,
      criar("h2", {}, titulo),
      ...cabecalho
    ]),
    criar("div", { class: "card-body" }, corpo)
  ]);
}

export function montarInterruptor(alternador, titulo, explicacao) {
  return criar("label", { class: "switch-row" }, [
    criar("span", { class: "switch" }, [alternador, criar("span", { class: "switch-slider" })]),
    criar("span", { class: "switch-text" }, [
      criar("strong", { texto: titulo }),
      typeof explicacao === "string" ? criar("small", { texto: explicacao }) : explicacao
    ])
  ]);
}
