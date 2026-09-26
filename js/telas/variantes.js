import { criar, CHAVES_ARMAZENAMENTO } from "../shared.js";

export function varianteEscolhida(rota, modo, alternada) {
  const variante = rota.variantes.find((item) => item.id === modo) || rota.variantes[0];
  const usaAlternativa = Boolean(alternada && variante.alternativa && rota.alternancia);
  return { variante, idRota: usaAlternativa ? variante.alternativa : variante.rota, usaAlternativa };
}

export function montarTelaVariantes(container, rota, { rotaPorId, montarSubtela }) {
  const chave = `${CHAVES_ARMAZENAMENTO.variantes}:${rota.id}`;
  let salvo = {};
  try {
    salvo = JSON.parse(localStorage.getItem(chave) || "{}");
  } catch {
    salvo = {};
  }
  let modo = rota.variantes.some((item) => item.id === salvo.modo) ? salvo.modo : rota.variantes[0].id;
  let alternada = Boolean(salvo.alternada);
  const alternancia = rota.alternancia || null;

  const botoes = rota.variantes.map((variante) => criar("button", {
    type: "button", class: "modo-botao", texto: variante.rotulo, dados: { modo: variante.id }
  }));
  const alternador = criar("input", { type: "checkbox" });
  const explicacao = criar("small");
  const controles = criar("div", { class: "variantes-controles" }, [
    criar("div", { class: "config-field" }, [
      criar("span", { class: "field-label", texto: rota.rotuloVariantes || "Consultar por" }),
      criar("div", { class: "modo-seletor" }, botoes)
    ]),
    alternancia
      ? criar("label", { class: "switch-row" }, [
          criar("span", { class: "switch" }, [alternador, criar("span", { class: "switch-slider" })]),
          criar("span", { class: "switch-text" }, [criar("strong", { texto: alternancia.rotulo }), explicacao])
        ])
      : null
  ]);

  function desenhar() {
    const { variante, idRota, usaAlternativa } = varianteEscolhida(rota, modo, alternada);
    botoes.forEach((botao) => botao.classList.toggle("ativo", botao.dataset.modo === variante.id));
    if (alternancia) {
      alternador.disabled = !variante.alternativa;
      alternador.checked = usaAlternativa;
      explicacao.textContent = !variante.alternativa
        ? (alternancia.indisponivel || "").replace("{variante}", variante.rotulo)
        : usaAlternativa ? alternancia.ligada : alternancia.desligada;
    }
    localStorage.setItem(chave, JSON.stringify({ modo: variante.id, alternada }));
    container.textContent = "";
    const alvo = rotaPorId(idRota);
    if (alvo) montarSubtela(container, alvo, controles);
  }

  botoes.forEach((botao) => botao.addEventListener("click", () => {
    modo = botao.dataset.modo;
    desenhar();
  }));
  alternador.addEventListener("change", () => {
    alternada = alternador.checked;
    desenhar();
  });
  desenhar();
}
