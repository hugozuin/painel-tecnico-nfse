import {
  criar, mostrarAviso, separarIdentificadores, aguardarDigitacao, lerArquivoTexto,
  temSegmentoDePonto, AVISO_SEGMENTO_DE_PONTO
} from "../../shared.js";
import { exigirApiKey } from "../../credencial.js";
import { montarCartao } from "../../componentes.js";

export function rotuloAcao(rota) {
  if (rota.resultado?.tipo === "arquivo") return "Baixar arquivos";
  if ((rota.metodo || "GET") === "GET") return "Consultar";
  return "Executar";
}

export function montarCartaoRequisicao(rota, contexto) {
  const entrada = rota.entrada || { tipo: "lote" };
  const campos = {};
  const barraProgresso = criar("div", { class: "progress-fill" });
  const botaoExecutar = criar("button", { type: "button", class: "btn btn-primary", texto: rotuloAcao(rota) });
  const botaoCancelar = criar("button", { type: "button", class: "btn btn-danger", texto: "Cancelar", disabled: true });
  const areaEntrada = entrada.tipo === "formulario" ? null : criar("textarea", {
    class: "text-area",
    rows: 6,
    spellcheck: false,
    placeholder: entrada.exemplo || ""
  });
  const contador = criar("span", { class: "badge badge-neutral", texto: "0 itens" });
  const atualizarContador = () => contarItens(areaEntrada, contador);

  const cartao = montarCartao({
    titulo: "Requisição",
    cabecalho: [
      rota.sensivel ? criar("span", { class: "badge badge-warning", texto: "ação sensível" }) : null,
      entrada.tipo === "formulario" ? null : contador
    ]
  }, [
    contexto.controles || null,
    criar("p", { class: "rota-endereco mono", texto: `${rota.metodo || "GET"} ${contexto.descricaoBase || ""}${rota.caminho}` }),
    rota.observacao ? criar("p", { class: "aviso-caixa", texto: rota.observacao }) : null,
    ...(areaEntrada ? blocoDaLista(rota, entrada, areaEntrada, atualizarContador) : []),
    ...montarCampos(rota, campos),
    criar("div", { class: "exec-buttons" }, [botaoExecutar, botaoCancelar]),
    criar("div", { class: "progress-track" }, [barraProgresso])
  ]);

  areaEntrada?.addEventListener("input", aguardarDigitacao(atualizarContador, 250));
  atualizarContador();
  return { cartao, entrada, areaEntrada, campos, botaoExecutar, botaoCancelar, barraProgresso };
}

function contarItens(areaEntrada, contador) {
  const total = separarIdentificadores(areaEntrada?.value || "").length;
  contador.textContent = `${total} ${total === 1 ? "item" : "itens"}`;
}

function blocoDaLista(rota, entrada, areaEntrada, atualizarContador) {
  return [
    criar("label", { class: "field-label", texto: entrada.rotulo || "Identificadores" }),
    areaEntrada,
    criar("div", { class: "card-actions" }, [
      criar("label", { class: "btn btn-outline btn-sm", texto: "Importar CSV ou TXT", htmlFor: `importar-${rota.id}` }),
      criar("input", {
        type: "file", id: `importar-${rota.id}`, accept: ".csv,.txt", hidden: true,
        aoMudar: async (evento) => {
          const arquivo = evento.target.files?.[0];
          if (!arquivo) return;
          areaEntrada.value = separarIdentificadores(await lerArquivoTexto(arquivo)).join("\n");
          atualizarContador();
          evento.target.value = "";
        }
      }),
      criar("button", {
        type: "button", class: "btn btn-ghost btn-sm", texto: "Limpar",
        aoClicar: () => { areaEntrada.value = ""; atualizarContador(); }
      })
    ])
  ];
}

export function travarRequisicao(requisicao, executando) {
  requisicao.botaoExecutar.disabled = executando;
  requisicao.botaoCancelar.disabled = !executando;
  if (requisicao.areaEntrada) requisicao.areaEntrada.disabled = executando;
  Object.values(requisicao.campos).forEach((campo) => { campo.disabled = executando; });
  requisicao.barraProgresso.classList.toggle("running", executando);
  if (!executando) return;
  requisicao.barraProgresso.style.width = "0%";
}

export function lerPedidoDaTela(rota, contexto, requisicao) {
  const credencial = contexto.exigeApiKey ? exigirApiKey() : "";
  if (contexto.exigeApiKey && !credencial) return null;

  const valores = lerCampos(rota, requisicao.campos);
  if (valores.erro) {
    mostrarAviso(valores.erro, "error");
    return null;
  }

  const formulario = requisicao.entrada.tipo === "formulario";
  const itens = formulario ? [""] : separarIdentificadores(requisicao.areaEntrada.value);
  if (!formulario && itens.length === 0) {
    mostrarAviso("Informe ao menos um item.", "error");
    requisicao.areaEntrada.focus();
    return null;
  }

  if (temSegmentoDePonto([...itens, ...Object.values(valores.dados.caminho)])) {
    mostrarAviso(AVISO_SEGMENTO_DE_PONTO, "error");
    return null;
  }
  return { credencial, dados: valores.dados, itens };
}

function montarCampos(rota, campos) {
  if (!rota.campos?.length) return [];
  const linha = criar("div", { class: "config-row" });

  rota.campos.forEach((definicao) => {
    let entrada;
    if (definicao.tipo === "selecao") {
      entrada = criar("select", { class: "text-input select-input" },
        (definicao.opcoes || []).map((opcao) => criar("option", { value: opcao.valor, texto: opcao.rotulo })));
    } else if (definicao.tipo === "booleano") {
      entrada = criar("input", { type: "checkbox", checked: Boolean(definicao.padrao) });
    } else {
      entrada = criar("input", {
        type: { data: "date", competencia: "month" }[definicao.tipo] || "text",
        class: "text-input",
        placeholder: definicao.exemplo || "",
        spellcheck: false
      });
    }

    campos[definicao.id] = entrada;
    linha.appendChild(criar("div", { class: "config-field" }, [
      criar("label", { class: "field-label" }, [
        definicao.rotulo,
        definicao.obrigatorio ? null : criar("span", { class: "label-optional", texto: " (opcional)" })
      ]),
      definicao.tipo === "booleano"
        ? criar("label", { class: "checkbox-row" }, [entrada, criar("span", { texto: definicao.dica || "" })])
        : entrada,
      definicao.dica && definicao.tipo !== "booleano" ? criar("p", { class: "field-hint", texto: definicao.dica }) : null
    ]));
  });

  return [linha];
}

function lerCampos(rota, campos) {
  const dados = { caminho: {}, corpo: {}, consulta: {} };

  for (const definicao of rota.campos || []) {
    const entrada = campos[definicao.id];
    let valor = definicao.tipo === "booleano" ? entrada.checked : entrada.value.trim();

    if (definicao.somenteNumeros && typeof valor === "string") valor = valor.replace(/\D/g, "");
    if (definicao.obrigatorio && (valor === "" || valor === null)) {
      return { erro: `Preencha o campo ${definicao.rotulo}.` };
    }
    if (valor === "" && definicao.tipo !== "booleano") continue;

    const [destino, chave] = (definicao.destino || `corpo.${definicao.id}`).split(".");
    dados[destino][chave] = definicao.tipo === "lista"
      ? String(valor).split(",").map((parte) => parte.trim()).filter(Boolean)
      : valor;
  }

  return { dados };
}
