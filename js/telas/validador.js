import { criar, mostrarAviso, registrarLog, copiarTexto, lerArquivoTexto } from "../shared.js";
import { analisarEmissao } from "../analise.js";
import { definicoes, carregarDefinicao } from "../definicoes.js";
import { chipDaTag, entradaPorChave, reiniciarIndiceTags } from "../tags.js";

const rotuloSeveridade = { erro: "Erro", alerta: "Alerta", informacao: "Observação" };
const classeSeveridade = { erro: "badge-error", alerta: "badge-warning", informacao: "badge-info" };

export async function montarTelaValidador(container) {
  let ultimosAchados = [];
  const area = criar("textarea", {
    class: "text-area code-area", rows: 14, spellcheck: false,
    placeholder: '{ "prestador": { ... }, "tomador": { ... }, "servico": [ ... ], "ibscbs": { ... } }'
  });
  const distintivo = criar("span", { class: "badge badge-neutral", texto: "Carregando referências" });
  const botaoAnalisar = criar("button", { type: "button", class: "btn btn-primary", texto: "Analisar JSON", disabled: true });
  const resumo = criar("div", { class: "findings-summary" });
  const lista = criar("div", { class: "findings-list" });
  const cartaoResultado = criar("section", { class: "card", hidden: true }, [
    criar("div", { class: "card-header" }, [
      criar("h2", { texto: "Achados da análise" }),
      criar("button", { type: "button", class: "btn btn-outline btn-sm", texto: "Copiar achados", aoClicar: copiarAchados })
    ]),
    criar("div", { class: "card-body" }, [resumo, lista])
  ]);

  container.appendChild(criar("section", { class: "card" }, [
    criar("div", { class: "card-header" }, [criar("h2", { texto: "JSON de emissão" }), distintivo]),
    criar("div", { class: "card-body" }, [
      criar("p", { class: "field-hint", texto: "Cole o corpo enviado no POST /nfse. A análise acontece no seu navegador e nada é enviado para a API nem para o servidor desta ferramenta." }),
      area,
      criar("div", { class: "card-actions" }, [
        botaoAnalisar,
        criar("label", { class: "btn btn-outline", texto: "Importar arquivo", htmlFor: "validadorArquivo" }),
        criar("input", {
          type: "file", id: "validadorArquivo", accept: ".json,.txt", hidden: true,
          aoMudar: async (evento) => {
            const arquivo = evento.target.files?.[0];
            if (!arquivo) return;
            area.value = await lerArquivoTexto(arquivo);
            analisar();
            evento.target.value = "";
          }
        }),
        criar("button", {
          type: "button", class: "btn btn-outline", texto: "Formatar",
          aoClicar: () => {
            try {
              area.value = JSON.stringify(JSON.parse(area.value), null, 2);
              mostrarAviso("JSON formatado.", "success");
            } catch (erro) {
              mostrarAviso(`JSON inválido: ${erro.message}`, "error");
            }
          }
        }),
        criar("button", {
          type: "button", class: "btn btn-ghost", texto: "Limpar",
          aoClicar: () => {
            area.value = "";
            cartaoResultado.hidden = true;
            distintivo.textContent = "Aguardando conteúdo";
          }
        })
      ]),
      criar("p", { class: "field-hint", texto: `Regras declarativas: ${definicoes.regras?.regras?.length || 0}, em definicoes/regras-validacao.json. As conferências de leiaute usam o de-para do Nacional.` })
    ])
  ]));
  container.appendChild(cartaoResultado);

  botaoAnalisar.addEventListener("click", analisar);
  await Promise.all([carregarDefinicao("de-para-nacional"), carregarDefinicao("ibscbs")]);
  reiniciarIndiceTags();
  botaoAnalisar.disabled = false;
  distintivo.textContent = "Pronto para analisar";

  function analisar() {
    const conteudo = area.value.trim();
    if (!conteudo) {
      mostrarAviso("Cole o JSON antes de analisar.", "error");
      return;
    }
    let documento;
    try {
      documento = JSON.parse(conteudo);
    } catch (erro) {
      ultimosAchados = [{ severidade: "erro", titulo: "JSON inválido", campo: "documento", detalhe: erro.message, fonte: "Leitura do JSON", tags: [] }];
      desenhar();
      distintivo.textContent = "JSON inválido";
      return;
    }
    ultimosAchados = analisarEmissao(documento, { regras: definicoes.regras, dePara: definicoes.dePara, ibscbs: definicoes.ibscbs });
    desenhar();
    const erros = ultimosAchados.filter((item) => item.severidade === "erro").length;
    distintivo.textContent = erros > 0 ? `${erros} erro(s) encontrados` : "Sem erros bloqueantes";
    registrarLog(`Validador: ${ultimosAchados.length} achado(s), sendo ${erros} erro(s).`, erros > 0 ? "warn" : "success");
  }

  function desenhar() {
    lista.textContent = "";
    resumo.textContent = "";
    const contagem = { erro: 0, alerta: 0, informacao: 0 };
    ultimosAchados.forEach((item) => { contagem[item.severidade]++; });
    Object.entries(contagem).forEach(([severidade, quantidade]) => {
      resumo.appendChild(criar("span", { class: `badge ${classeSeveridade[severidade]}`, texto: `${quantidade} ${rotuloSeveridade[severidade]}${quantidade === 1 ? "" : "s"}` }));
    });
    if (ultimosAchados.length === 0) {
      lista.appendChild(criar("p", { class: "field-hint", texto: "Nenhum achado nas conferências disponíveis. Isso não substitui a validação da prefeitura." }));
    }
    const fragmento = document.createDocumentFragment();
    ultimosAchados.forEach((item) => fragmento.appendChild(montarAchado(item)));
    lista.appendChild(fragmento);
    cartaoResultado.hidden = false;
  }

  async function copiarAchados() {
    if (ultimosAchados.length === 0) {
      mostrarAviso("Analise um JSON antes de copiar.", "info");
      return;
    }
    const texto = ultimosAchados.map((item) => {
      const tags = (item.tags || []).map((chave) => entradaPorChave(chave)?.tag || chave.split("/").pop());
      return [
        `[${rotuloSeveridade[item.severidade]}] ${item.titulo}`,
        `Campo: ${item.campo}`,
        item.detalhe,
        `Fonte: ${item.fonte}`,
        tags.length ? `Tags do XML: ${tags.join(", ")}` : ""
      ].filter(Boolean).join("\n");
    }).join("\n\n");
    const copiou = await copiarTexto(texto);
    mostrarAviso(copiou ? "Achados copiados." : "Não foi possível copiar.", copiou ? "success" : "error");
  }
}

function montarAchado(item) {
  const tags = (item.tags || []).map((chave) => chipDaTag(chave));
  return criar("article", { class: `finding finding-${item.severidade}` }, [
    criar("header", {}, [
      criar("span", { class: `badge ${classeSeveridade[item.severidade]}`, texto: rotuloSeveridade[item.severidade] }),
      criar("strong", { texto: item.titulo })
    ]),
    criar("code", { texto: item.campo }),
    criar("p", { texto: item.detalhe }),
    criar("p", { class: "finding-fonte", texto: `Fonte: ${item.fonte}` }),
    tags.length ? criar("div", { class: "finding-tags" }, [criar("span", { class: "field-hint", texto: "Tags do XML:" }), ...tags]) : null
  ]);
}
