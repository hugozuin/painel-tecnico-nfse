import { criar, CHAVES_ARMAZENAMENTO, registrarLog } from "../shared.js";
import { definicoes } from "../definicoes.js";
import { montarTelaRota } from "./lote.js";
import { certificadoAtual, montarCartaoCertificado } from "../certificado.js";
import { montarCartao } from "../componentes.js";

export function montarTelaNacional(container, rota) {
  const ambientes = definicoes.rotasNacional?.ambientes || [];
  const seletor = criar("select", { class: "text-input select-input" },
    ambientes.map((ambiente) => criar("option", { value: ambiente.id, texto: ambiente.rotulo })));
  seletor.value = localStorage.getItem(CHAVES_ARMAZENAMENTO.ambienteNacional) || ambientes[0]?.id;

  seletor.addEventListener("change", () => {
    localStorage.setItem(CHAVES_ARMAZENAMENTO.ambienteNacional, seletor.value);
    registrarLog(`Ambiente do Nacional alterado para ${seletor.value}.`);
  });

  container.appendChild(montarCartao({ titulo: "Ambiente do Nacional", classe: "card-credencial" }, [
      criar("div", { class: "config-row" }, [
        criar("div", { class: "config-field" }, [criar("label", { class: "field-label", texto: "Servidor usado nas consultas" }), seletor])
      ]),
      criar("p", { class: "field-hint", texto: "As consultas do Nacional não usam a API Key do PlugNotas. Elas passam pelo repasse da própria aplicação, porque os servidores do gov.br não aceitam chamadas direto do navegador." })
  ]));

  montarCartaoCertificado(container);

  montarTelaRota(container, rota, {
    exigeApiKey: false,
    concorrencia: 3,
    descricaoBase: "",
    base: () => {
      const ambiente = ambientes.find((item) => item.id === seletor.value) || ambientes[0];
      return ambiente?.[rota.servidor] || "";
    },
    prepararPedido: (alvo) => {
      const certificado = certificadoAtual();
      return {
        url: "api/proxy",
        metodo: "POST",
        corpo: certificado
          ? { url: alvo.url, certificado: { chave: certificado.chave, certificado: certificado.certificado } }
          : { url: alvo.url }
      };
    }
  });
}
