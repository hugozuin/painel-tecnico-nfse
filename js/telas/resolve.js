import {
  criar, CHAVES_ARMAZENAMENTO, mostrarAviso, pedirConfirmacao, registrarLog,
  separarIdentificadores, aguardarDigitacao, baixarArquivo,
  carimboDeTempo, montarCsv, copiarTexto, lerArquivoTexto, identificacao,
  temSegmentoDePonto, AVISO_SEGMENTO_DE_PONTO
} from "../shared.js";
import { criarSessaoRequisicoes } from "../plugnotas.js";
import { exigirApiKey } from "../credencial.js";
import { montarCartao, montarInterruptor } from "../componentes.js";
import {
  executarLoteResolve, montarItensResolve, normalizarConfiguracaoResolve, mensagemDeConfirmacaoResolve,
  idsComFalha, CABECALHO_CSV_RESOLVE, linhasCsvResolve, resumoParaTicket
} from "../fluxo-resolve.js";

const classePorChave = {
  resolvido: "badge-success",
  "ja-concluida": "badge-success",
  "sem-leitura": "badge-success",
  andamento: "badge-warning",
  rejeitada: "badge-error",
  cancelada: "badge-error",
  erro: "badge-error",
  cancelado: "badge-neutral"
};

const estagios = {
  evento: ["Consultando eventos", "badge-info"],
  aguardando: ["Aguardando Nacional", "badge-info"],
  consultando: ["Lendo situação", "badge-info"],
  processando: ["Processando", "badge-warning pulsing"],
  verificando: ["Conferindo situação", "badge-info"]
};

export function montarTelaResolve(container) {
  const painel = {
    modo: localStorage.getItem(CHAVES_ARMAZENAMENTO.modoIdentificacao) === "individual" ? "individual" : "unica",
    ids: [],
    identificacoes: new Map(),
    executando: false,
    sessao: criarSessaoRequisicoes(),
    resultados: [],
    linhas: [],
    contadores: { total: 0, feitas: 0, sucessos: 0, falhas: 0 },
    inicio: null
  };

  const areaIds = criar("textarea", {
    class: "text-area", rows: 7, spellcheck: false,
    placeholder: "ID da nota, um por linha",
    value: sessionStorage.getItem(CHAVES_ARMAZENAMENTO.idsResolve) || ""
  });
  const contadorIds = criar("span", { class: "badge badge-neutral", texto: "0 IDs válidos" });

  const nacional = criar("input", { type: "checkbox", checked: localStorage.getItem(CHAVES_ARMAZENAMENTO.nacional) === "true" });
  const esperaNacional = criar("select", { class: "text-input select-input" },
    [10000, 15000, 20000, 30000, 45000, 60000].map((valor) =>
      criar("option", { value: String(valor), texto: `${valor / 1000} segundos` })));
  esperaNacional.value = localStorage.getItem(CHAVES_ARMAZENAMENTO.esperaEvento) || "15000";
  const blocoNacional = criar("div", { class: "config-field nacional-wait", hidden: !nacional.checked }, [
    criar("label", { class: "field-label", texto: "Espera entre a consulta de eventos e o resolve" }),
    esperaNacional,
    criar("p", { class: "field-hint", texto: "A espera é feita uma vez para o lote inteiro, não por nota." })
  ]);

  const identificacaoUnica = criar("input", { type: "text", class: "text-input", placeholder: "codigoVerificacao (opcional)", spellcheck: false });
  const corpoIndividual = criar("tbody");
  const painelUnica = criar("div", { class: "tab-panel", hidden: painel.modo !== "unica" }, [
    criar("label", { class: "field-label" }, ["Valor aplicado a todas as notas ", criar("span", { class: "label-optional", texto: "(opcional)" })]),
    identificacaoUnica,
    criar("p", { class: "field-hint", texto: "Em branco, as notas são resolvidas sem informar identificacaoNota." })
  ]);
  const painelIndividual = criar("div", { class: "tab-panel", hidden: painel.modo !== "individual" }, [
    criar("div", { class: "table-wrapper" }, [
      criar("table", { class: "data-table" }, [
        criar("thead", {}, [criar("tr", {}, [
          criar("th", { texto: "ID da nota" }),
          criar("th", { texto: "identificacaoNota (opcional)" })
        ])]),
        corpoIndividual
      ])
    ])
  ]);

  const abaUnica = criar("button", { type: "button", class: `tab ${painel.modo === "unica" ? "active" : ""}`, texto: "Identificação única" });
  const abaIndividual = criar("button", { type: "button", class: `tab ${painel.modo === "individual" ? "active" : ""}`, texto: "Identificação individual" });

  const tentativas = criar("select", { class: "text-input select-input" },
    [1, 3, 5].map((valor) => criar("option", { value: String(valor), texto: `${valor} tentativa${valor === 1 ? "" : "s"}` })));
  tentativas.value = localStorage.getItem(CHAVES_ARMAZENAMENTO.tentativas) || "3";
  const intervalo = criar("input", { type: "number", class: "text-input", min: "0", step: "100", value: localStorage.getItem(CHAVES_ARMAZENAMENTO.intervalo) || "1000" });

  const verificar = criar("input", { type: "checkbox", checked: localStorage.getItem(CHAVES_ARMAZENAMENTO.verificarAposResolve) !== "false" });
  const verificacoes = criar("select", { class: "text-input select-input" },
    [1, 3, 6, 12].map((valor) => criar("option", { value: String(valor), texto: valor === 1 ? "1 verificação" : `até ${valor} verificações` })));
  verificacoes.value = localStorage.getItem(CHAVES_ARMAZENAMENTO.verificacoes) || "3";
  const intervaloVerificacao = criar("input", { type: "number", class: "text-input", min: "1000", step: "1000", value: localStorage.getItem(CHAVES_ARMAZENAMENTO.intervaloVerificacao) || "10000" });
  const blocoVerificacao = criar("div", { class: "config-row verify-config", hidden: !verificar.checked }, [
    criar("div", { class: "config-field" }, [criar("label", { class: "field-label", texto: "Verificações após o resolve" }), verificacoes]),
    criar("div", { class: "config-field" }, [criar("label", { class: "field-label", texto: "Intervalo entre verificações (ms)" }), intervaloVerificacao])
  ]);

  const botaoExecutar = criar("button", { type: "button", class: "btn btn-primary", texto: "Executar resolve" });
  const botaoReprocessar = criar("button", { type: "button", class: "btn btn-outline", texto: "Reprocessar apenas as falhas", hidden: true });
  const botaoCancelar = criar("button", { type: "button", class: "btn btn-danger", texto: "Cancelar processamento", disabled: true });
  const barraProgresso = criar("div", { class: "progress-fill" });

  const estatisticas = {
    total: criar("span", { class: "stat-value", texto: "0" }),
    feitas: criar("span", { class: "stat-value", texto: "0" }),
    pendentes: criar("span", { class: "stat-value", texto: "0" }),
    sucessos: criar("span", { class: "stat-value", texto: "0" }),
    falhas: criar("span", { class: "stat-value", texto: "0" })
  };

  const corpoResultados = criar("tbody");
  const filtro = criar("input", { type: "search", class: "text-input", placeholder: "Filtrar por ID, situação ou mensagem", spellcheck: false });
  const contadorLinhas = criar("span", { class: "badge badge-neutral", texto: "0 linhas" });
  const botaoCsv = criar("button", { type: "button", class: "btn btn-outline btn-sm", texto: "Exportar CSV", disabled: true });
  const botaoResumo = criar("button", { type: "button", class: "btn btn-outline btn-sm", texto: "Copiar resumo para o ticket", disabled: true });
  const cartaoResultados = montarCartao({ titulo: "Resultados", oculto: true, cabecalho: [botaoResumo, botaoCsv] }, [
      criar("div", { class: "table-toolbar" }, [filtro, contadorLinhas]),
      criar("div", { class: "table-wrapper" }, [
        criar("table", { class: "data-table" }, [
          criar("thead", {}, [criar("tr", {}, [
            "ID nota", "Identificação", "Situação antes", "Situação depois", "HTTP", "Resultado", "Mensagem", "Tempo"
          ].map((titulo) => criar("th", { texto: titulo })))]),
          corpoResultados
        ])
      ])
  ]);

  container.appendChild(montarCartao({ titulo: "IDs das notas", passo: "1", cabecalho: [contadorIds] }, [
      criar("label", { class: "field-label", texto: "Cole um ID por linha" }),
      areaIds,
      criar("div", { class: "card-actions" }, [
        criar("button", { type: "button", class: "btn btn-outline", texto: "Formatar IDs", aoClicar: formatar }),
        criar("label", { class: "btn btn-outline", texto: "Importar CSV ou TXT", htmlFor: "resolveArquivo" }),
        criar("input", { type: "file", id: "resolveArquivo", accept: ".csv,.txt", hidden: true, aoMudar: importar }),
        criar("button", { type: "button", class: "btn btn-ghost", texto: "Limpar lista", aoClicar: limpar })
      ]),
      criar("div", { class: "nacional-box" }, [
        montarInterruptor(nacional, "Emissões do emissor Nacional",
          "Envia a consulta de eventos antes do resolve, recomendado quando o resolve sozinho não traz todos os dados da emissão."),
        blocoNacional
      ])
  ]));

  container.appendChild(montarCartao({ titulo: "Identificação da nota", passo: "2" }, [
      criar("div", { class: "tabs" }, [abaUnica, abaIndividual]),
      painelUnica,
      painelIndividual
  ]));

  container.appendChild(montarCartao({ titulo: "Execução", passo: "3" }, [
      criar("div", { class: "config-row" }, [
        criar("div", { class: "config-field" }, [criar("label", { class: "field-label", texto: "Tentativas por nota" }), tentativas]),
        criar("div", { class: "config-field" }, [criar("label", { class: "field-label", texto: "Intervalo entre tentativas (ms)" }), intervalo])
      ]),
      criar("p", { class: "field-hint", texto: "As tentativas valem para erros temporários. No HTTP 429 a ferramenta respeita o Retry-After e reduz a concorrência. A espera de quando o resolve já está em execução é independente disso." }),
      criar("div", { class: "verify-box" }, [
        montarInterruptor(verificar, "Conferir a situação na rota de consulta após o resolve",
          "O resolve responde apenas que a solicitação foi recebida. Com esta opção o resultado mostra a situação real da nota."),
        blocoVerificacao
      ]),
      criar("div", { class: "exec-buttons" }, [botaoExecutar, botaoReprocessar, botaoCancelar]),
      criar("div", { class: "progress-track" }, [barraProgresso]),
      criar("div", { class: "stats-grid" }, [
        criar("div", { class: "stat" }, [estatisticas.total, criar("span", { class: "stat-label", texto: "Total" })]),
        criar("div", { class: "stat" }, [estatisticas.feitas, criar("span", { class: "stat-label", texto: "Processadas" })]),
        criar("div", { class: "stat" }, [estatisticas.pendentes, criar("span", { class: "stat-label", texto: "Pendentes" })]),
        criar("div", { class: "stat stat-success" }, [estatisticas.sucessos, criar("span", { class: "stat-label", texto: "Sucessos" })]),
        criar("div", { class: "stat stat-error" }, [estatisticas.falhas, criar("span", { class: "stat-label", texto: "Falhas" })])
      ])
  ]));

  container.appendChild(cartaoResultados);

  areaIds.addEventListener("input", aguardarDigitacao(() => {
    atualizarIds();
    sessionStorage.setItem(CHAVES_ARMAZENAMENTO.idsResolve, areaIds.value);
  }, 300));

  corpoIndividual.addEventListener("input", (evento) => {
    if (evento.target.classList.contains("cell-input")) {
      painel.identificacoes.set(evento.target.dataset.id, evento.target.value);
    }
  });

  abaUnica.addEventListener("click", () => trocarModo("unica"));
  abaIndividual.addEventListener("click", () => trocarModo("individual"));

  nacional.addEventListener("change", () => {
    blocoNacional.hidden = !nacional.checked;
    localStorage.setItem(CHAVES_ARMAZENAMENTO.nacional, String(nacional.checked));
  });
  esperaNacional.addEventListener("change", () => localStorage.setItem(CHAVES_ARMAZENAMENTO.esperaEvento, esperaNacional.value));
  tentativas.addEventListener("change", () => localStorage.setItem(CHAVES_ARMAZENAMENTO.tentativas, tentativas.value));
  intervalo.addEventListener("change", () => localStorage.setItem(CHAVES_ARMAZENAMENTO.intervalo, intervalo.value));
  verificar.addEventListener("change", () => {
    blocoVerificacao.hidden = !verificar.checked;
    localStorage.setItem(CHAVES_ARMAZENAMENTO.verificarAposResolve, String(verificar.checked));
  });
  verificacoes.addEventListener("change", () => localStorage.setItem(CHAVES_ARMAZENAMENTO.verificacoes, verificacoes.value));
  intervaloVerificacao.addEventListener("change", () => localStorage.setItem(CHAVES_ARMAZENAMENTO.intervaloVerificacao, intervaloVerificacao.value));

  botaoExecutar.addEventListener("click", () => executarLote(painel.ids));
  botaoCancelar.addEventListener("click", () => {
    if (!painel.executando) return;
    painel.sessao.cancelar();
    registrarLog("Cancelamento solicitado pelo consultor.", "warn");
  });
  botaoReprocessar.addEventListener("click", () => {
    const falhas = idsComFalha(painel.resultados);
    if (falhas.length === 0) {
      mostrarAviso("Não há falhas para reprocessar.", "info");
      return;
    }
    executarLote(falhas);
  });

  filtro.addEventListener("input", aguardarDigitacao(() => {
    const termo = filtro.value.trim().toLowerCase();
    let visiveis = 0;
    painel.linhas.forEach((registro) => {
      const combina = !termo || registro.texto.includes(termo);
      registro.elemento.hidden = !combina;
      if (combina) visiveis++;
    });
    contadorLinhas.textContent = `${visiveis} linha${visiveis === 1 ? "" : "s"}`;
  }, 200));

  botaoCsv.addEventListener("click", exportarCsv);
  botaoResumo.addEventListener("click", async () => {
    const copiou = await copiarTexto(montarResumo());
    mostrarAviso(copiou ? "Resumo copiado." : "Não foi possível copiar.", copiou ? "success" : "error");
  });

  atualizarIds();

  function atualizarIds() {
    painel.ids = separarIdentificadores(areaIds.value);
    contadorIds.textContent = `${painel.ids.length} ID${painel.ids.length === 1 ? "" : "s"} válido${painel.ids.length === 1 ? "" : "s"}`;
    if (painel.modo === "individual") desenharIndividual();
  }

  function desenharIndividual() {
    corpoIndividual.textContent = "";
    if (painel.ids.length === 0) {
      corpoIndividual.appendChild(criar("tr", { class: "empty-row" }, [
        criar("td", { colSpan: 2, texto: "Informe os IDs na etapa 1 para montar a tabela." })
      ]));
      return;
    }

    const atuais = new Set(painel.ids);
    painel.identificacoes.forEach((_, chave) => { if (!atuais.has(chave)) painel.identificacoes.delete(chave); });

    const fragmento = document.createDocumentFragment();
    painel.ids.forEach((id) => {
      fragmento.appendChild(criar("tr", {}, [
        criar("td", { class: "mono", texto: id }),
        criar("td", {}, [criar("input", {
          type: "text", class: "cell-input", placeholder: "codigoVerificacao (opcional)",
          dados: { id }, value: painel.identificacoes.get(id) || ""
        })])
      ]));
    });
    corpoIndividual.appendChild(fragmento);
  }

  function trocarModo(modo) {
    painel.modo = modo;
    abaUnica.classList.toggle("active", modo === "unica");
    abaIndividual.classList.toggle("active", modo === "individual");
    painelUnica.hidden = modo !== "unica";
    painelIndividual.hidden = modo !== "individual";
    localStorage.setItem(CHAVES_ARMAZENAMENTO.modoIdentificacao, modo);
    if (modo === "individual") desenharIndividual();
  }

  function formatar() {
    const lista = separarIdentificadores(areaIds.value);
    if (lista.length === 0) {
      mostrarAviso("Não há IDs para formatar.", "info");
      return;
    }
    areaIds.value = lista.join("\n");
    atualizarIds();
    sessionStorage.setItem(CHAVES_ARMAZENAMENTO.idsResolve, areaIds.value);
    mostrarAviso(`${lista.length} ID(s) organizados.`, "success");
  }

  async function importar(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    areaIds.value = separarIdentificadores(await lerArquivoTexto(arquivo)).join("\n");
    atualizarIds();
    sessionStorage.setItem(CHAVES_ARMAZENAMENTO.idsResolve, areaIds.value);
    mostrarAviso("Lista importada.", "success");
    evento.target.value = "";
  }

  async function limpar() {
    if (!areaIds.value.trim()) return;
    const confirmou = await pedirConfirmacao("Limpar lista", "Os IDs digitados serão apagados. Deseja continuar?");
    if (!confirmou) return;
    areaIds.value = "";
    painel.identificacoes.clear();
    atualizarIds();
    sessionStorage.removeItem(CHAVES_ARMAZENAMENTO.idsResolve);
  }

  function lerConfiguracao() {
    return normalizarConfiguracaoResolve({
      tentativas: tentativas.value,
      intervalo: intervalo.value,
      nacional: nacional.checked,
      esperaNacional: esperaNacional.value,
      verificar: verificar.checked,
      verificacoes: verificacoes.value,
      intervaloVerificacao: intervaloVerificacao.value
    });
  }

  function montarItens(ids) {
    return montarItensResolve(ids, {
      modo: painel.modo,
      identificacaoUnica: identificacaoUnica.value,
      identificacoes: painel.identificacoes
    });
  }

  async function executarLote(ids) {
    if (painel.executando) return;
    const apiKey = exigirApiKey();
    if (!apiKey) return;

    if (ids.length === 0) {
      mostrarAviso("Informe ao menos um ID válido.", "error");
      areaIds.focus();
      return;
    }

    if (temSegmentoDePonto(ids)) {
      mostrarAviso(AVISO_SEGMENTO_DE_PONTO, "error");
      areaIds.focus();
      return;
    }

    const configuracao = lerConfiguracao();
    const itens = montarItens(ids);
    const confirmou = await pedirConfirmacao("Executar resolve", mensagemDeConfirmacaoResolve(itens, configuracao));
    if (!confirmou) return;

    painel.sessao.reiniciar();
    painel.resultados = [];
    painel.contadores = { total: itens.length, feitas: 0, sucessos: 0, falhas: 0 };
    painel.inicio = performance.now();

    montarTabela(itens);
    atualizarContadores();
    alternar(true);

    await executarLoteResolve({
      itens, apiKey, configuracao, sessao: painel.sessao,
      aoMudarEstagio: marcar,
      aoLerSituacaoAntes: (posicao, situacao) => atualizarCelula(posicao, 2, situacao),
      aoConcluir: concluir
    });

    encerrar();
  }

  function montarTabela(itens) {
    painel.linhas = [];
    corpoResultados.textContent = "";
    const fragmento = document.createDocumentFragment();

    itens.forEach((item) => {
      const linha = criar("tr", {}, [
        criar("td", { class: "mono", texto: item.id }),
        criar("td", { texto: item.identificacao || "sem identificação" }),
        criar("td", { texto: "—" }),
        criar("td", { texto: "—" }),
        criar("td", { texto: "—" }),
        criar("td", { class: "cell-desfecho" }, [criar("span", { class: "badge badge-neutral", texto: "Pendente" })]),
        criar("td", { texto: "—" }),
        criar("td", { texto: "—" })
      ]);
      fragmento.appendChild(linha);
      painel.linhas.push({ elemento: linha, texto: `${item.id} ${item.identificacao}`.toLowerCase() });
    });

    corpoResultados.appendChild(fragmento);
    cartaoResultados.hidden = false;
    contadorLinhas.textContent = `${itens.length} linha${itens.length === 1 ? "" : "s"}`;
  }

  function marcar(posicao, estagio) {
    const linha = painel.linhas[posicao]?.elemento;
    const definicao = estagios[estagio];
    if (!linha || !definicao) return;
    const celula = linha.querySelector(".cell-desfecho");
    celula.textContent = "";
    celula.appendChild(criar("span", { class: `badge ${definicao[1]}`, texto: definicao[0] }));
  }

  function atualizarCelula(posicao, indice, valor) {
    const linha = painel.linhas[posicao]?.elemento;
    if (linha) linha.children[indice].textContent = valor || "—";
  }

  function concluir(posicao, resultado) {
    painel.resultados.push({ ...resultado, quando: new Date().toLocaleString("pt-BR") });
    painel.contadores.feitas++;
    if (resultado.sucesso) painel.contadores.sucessos++;
    else painel.contadores.falhas++;

    const registro = painel.linhas[posicao];
    if (registro) {
      const linha = registro.elemento;
      linha.children[2].textContent = resultado.situacaoAntes || "—";
      linha.children[3].textContent = resultado.situacaoDepois || "—";
      linha.children[4].textContent = resultado.status ?? "—";
      linha.children[6].textContent = resultado.mensagem || "—";
      linha.children[7].textContent = `${resultado.duracaoMs}ms`;

      const celula = linha.querySelector(".cell-desfecho");
      celula.textContent = "";
      celula.appendChild(criar("span", { class: `badge ${classePorChave[resultado.chave] || "badge-neutral"}`, texto: resultado.rotulo }));

      registro.texto = [resultado.id, resultado.identificacao, resultado.situacaoAntes,
        resultado.situacaoDepois, resultado.rotulo, resultado.mensagem].join(" ").toLowerCase();
    }

    atualizarContadores();
  }

  function atualizarContadores() {
    const { total, feitas, sucessos, falhas } = painel.contadores;
    estatisticas.total.textContent = total;
    estatisticas.feitas.textContent = feitas;
    estatisticas.pendentes.textContent = Math.max(total - feitas, 0);
    estatisticas.sucessos.textContent = sucessos;
    estatisticas.falhas.textContent = falhas;
    barraProgresso.style.width = `${total ? Math.round((feitas / total) * 100) : 0}%`;
  }

  function alternar(executando) {
    painel.executando = executando;
    botaoExecutar.disabled = executando;
    botaoCancelar.disabled = !executando;
    botaoReprocessar.disabled = executando;
    areaIds.disabled = executando;
    identificacaoUnica.disabled = executando;
    [tentativas, intervalo, nacional, esperaNacional, verificar, verificacoes, intervaloVerificacao]
      .forEach((campo) => { campo.disabled = executando; });
    botaoCsv.disabled = executando || painel.resultados.length === 0;
    botaoResumo.disabled = executando || painel.resultados.length === 0;
    barraProgresso.classList.toggle("running", executando);
  }

  function encerrar() {
    alternar(false);
    const segundos = ((performance.now() - painel.inicio) / 1000).toFixed(1);
    const { total, feitas, sucessos, falhas } = painel.contadores;
    botaoReprocessar.hidden = falhas === 0;

    if (painel.sessao.cancelada) {
      const canceladas = painel.resultados.filter((resultado) => resultado.chave === "cancelado").length;
      registrarLog(`Execução cancelada: ${feitas - canceladas} de ${total} nota(s) concluídas e ${canceladas} marcada(s) como Cancelado.`, "warn");
      mostrarAviso("Processamento cancelado.", "error");
      return;
    }
    registrarLog(`Resolve concluído em ${segundos}s: ${sucessos} sucesso(s), ${falhas} falha(s).`, falhas === 0 ? "success" : "warn");
    mostrarAviso(falhas === 0 ? "Processamento concluído." : `Concluído com ${falhas} falha(s).`, falhas === 0 ? "success" : "error");
  }

  function exportarCsv() {
    if (painel.resultados.length === 0) return;
    const conteudo = montarCsv(CABECALHO_CSV_RESOLVE, linhasCsvResolve(painel.resultados));
    baixarArquivo(conteudo, `resolve-notas-${carimboDeTempo()}.csv`, "text/csv;charset=utf-8");
    mostrarAviso("CSV exportado.", "success");
  }

  function montarResumo() {
    return resumoParaTicket({
      resultados: painel.resultados,
      contadores: painel.contadores,
      autor: identificacao.ler(),
      quando: new Date().toLocaleString("pt-BR")
    });
  }
}
