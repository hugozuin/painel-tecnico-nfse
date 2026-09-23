/* Telas do Ambiente Nacional. As consultas passam pelo repasse em api/proxy
   porque os servidores do gov.br não liberam CORS para o navegador. */

import { criar, CHAVES_ARMAZENAMENTO, registrarLog } from "../shared.js";
import { definicoes } from "../definicoes.js";
import { montarTelaRota } from "./lote.js";

export function montarTelaNacional(container, rota) {
  const ambientes = definicoes.rotasNacional?.ambientes || [];
  const salvo = localStorage.getItem(CHAVES_ARMAZENAMENTO.ambienteNacional) || ambientes[0]?.id;

  const seletor = criar("select", { class: "text-input select-input" },
    ambientes.map((ambiente) => criar("option", { value: ambiente.id, texto: ambiente.rotulo })));
  seletor.value = salvo;

  seletor.addEventListener("change", () => {
    localStorage.setItem(CHAVES_ARMAZENAMENTO.ambienteNacional, seletor.value);
    registrarLog(`Ambiente do Nacional alterado para ${seletor.value}.`);
  });

  container.appendChild(criar("section", { class: "card card-credencial" }, [
    criar("div", { class: "card-header" }, [criar("h2", { texto: "Ambiente do Nacional" })]),
    criar("div", { class: "card-body" }, [
      criar("div", { class: "config-row" }, [
        criar("div", { class: "config-field" }, [
          criar("label", { class: "field-label", texto: "Servidor usado nas consultas" }),
          seletor
        ])
      ]),
      criar("p", { class: "field-hint", texto: "As consultas do Nacional são públicas e não usam a API Key do PlugNotas. Elas passam pelo repasse da própria aplicação porque os servidores do gov.br não liberam chamadas direto do navegador." })
    ])
  ]));

  montarTelaRota(container, rota, {
    exigeApiKey: false,
    concorrencia: 3,
    descricaoBase: "",
    base: () => {
      const ambiente = ambientes.find((item) => item.id === seletor.value) || ambientes[0];
      return ambiente?.[rota.servidor] || "";
    },
    transformarUrl: (url) => `api/proxy?url=${encodeURIComponent(url)}`
  });
}
