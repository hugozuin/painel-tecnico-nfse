/* Resolve em lote com conferência da situação na rota de consulta. O status
   HTTP do resolve indica só que a solicitação foi recebida, por isso a
   situação exibida vem da consulta feita antes e depois. */

import {
  criar, CHAVES_ARMAZENAMENTO, pausar, mostrarAviso, pedirConfirmacao, registrarLog,
  separarIdentificadores, aguardarDigitacao, criarPoolExecucao, baixarArquivo,
  carimboDeTempo, montarCsv, copiarTexto, lerArquivoTexto, identificacao
} from "../shared.js";
import { criarSessaoRequisicoes, consultarNota, consultarEventos, executarResolve } from "../plugnotas.js";
import { exigirApiKey } from "../credencial.js";

const situacaoConcluida = /CONCLU|AUTORIZ/;
const situacaoRejeitada = /REJEIT|ERRO|NEGAD|INVALID/;
const situacaoCancelada = /CANCEL/;
const situacaoEmAndamento = /PROCESS|PENDEN|ANDAMENT|AGUARD|ENVIAD/;

export function classificarSituacao(situacao) {
  const texto = String(situacao || "").toUpperCase();
  if (!texto) return "desconhecida";
  if (situacaoCancelada.test(texto)) return "cancelada";
  if (situacaoRejeitada.test(texto)) return "rejeitada";
  if (situacaoConcluida.test(texto)) return "concluida";
  if (situacaoEmAndamento.test(texto)) return "andamento";
  return "desconhecida";
}

export function definirDesfecho({ situacaoAntes, situacaoDepois, resolveOk }) {
  const depois = classificarSituacao(situacaoDepois);
  const antes = classificarSituacao(situacaoAntes);

  if (depois === "concluida") {
    return antes === "concluida"
      ? { chave: "ja-concluida", rotulo: "Já estava concluída", sucesso: true }
      : { chave: "resolvido", rotulo: "Resolvido", sucesso: true };
  }
  if (!resolveOk) return { chave: "erro", rotulo: "Resolve recusado pela API", sucesso: false };
  if (depois === "cancelada") return { chave: "cancelada", rotulo: "Cancelada na prefeitura", sucesso: false };
  if (depois === "rejeitada") return { chave: "rejeitada", rotulo: "Continua rejeitada", sucesso: false };
  if (depois === "andamento") return { chave: "andamento", rotulo: "Ainda em processamento", sucesso: false };
  return { chave: "sem-leitura", rotulo: "Resolve aceito, situação não lida", sucesso: true };
}

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
  evento: ["Consultando eventos", "badge-info pulsing"],
  aguardando: ["Aguardando Nacional", "badge-info pulsing"],
  consultando: ["Lendo situação", "badge-info pulsing"],
  processando: ["Processando", "badge-warning pulsing"],
  verificando: ["Conferindo situação", "badge-info pulsing"]
};

export function montarTelaResolve(container) {
  const painel = {
    modo: localStorage.getItem(CHAVES_ARMAZENAMENTO.modoIdentificacao) === "individual" ? "individual" : "unica",
    ids: [],
    identificacoes: new Map(),
    executando: false,
    sessao: criarSessaoRequisicoes(),
    pool: criarPoolExecucao(5),
    resultados: [],
    linhas: [],
    contadores: { total: 0, feitas: 0, sucessos: 0, falhas: 0 },
    inicio: null
  };

  const areaIds = criar("textarea", {
    class: "text-area", rows: 7, spellcheck: false,
    placeholder: "ID da nota, um por linha",
    value: localStorage.getItem(CHAVES_ARMAZENAMENTO.idsResolve) || ""
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
  const cartaoResultados = criar("section", { class: "card", hidden: true }, [
    criar("div", { class: "card-header" }, [criar("h2", { texto: "Resultados" }), botaoResumo, botaoCsv]),
    criar("div", { class: "card-body" }, [
      criar("div", { class: "table-toolbar" }, [filtro, contadorLinhas]),
      criar("div", { class: "table-wrapper" }, [
        criar("table", { class: "data-table" }, [
          criar("thead", {}, [criar("tr", {}, [
            "ID nota", "Identificação", "Situação antes", "Situação depois", "HTTP", "Resultado", "Mensagem", "Tempo"
          ].map((titulo) => criar("th", { texto: titulo })))]),
          corpoResultados
        ])
      ])
    ])
  ]);

  container.appendChild(criar("section", { class: "card" }, [
    criar("div", { class: "card-header" }, [criar("span", { class: "card-step", texto: "1" }), criar("h2", { texto: "IDs das notas" }), contadorIds]),
    criar("div", { class: "card-body" }, [
      criar("label", { class: "field-label", texto: "Cole um ID por linha" }),
      areaIds,
      criar("div", { class: "card-actions" }, [
        criar("button", { type: "button", class: "btn btn-outline", texto: "Formatar IDs", aoClicar: formatar }),
        criar("label", { class: "btn btn-outline", texto: "Importar CSV ou TXT", htmlFor: "resolveArquivo" }),
        criar("input", { type: "file", id: "resolveArquivo", accept: ".csv,.txt", hidden: true, aoMudar: importar }),
        criar("button", { type: "button", class: "btn btn-ghost", texto: "Limpar lista", aoClicar: limpar })
      ]),
      criar("div", { class: "nacional-box" }, [
        criar("label", { class: "switch-row" }, [
          criar("span", { class: "switch" }, [nacional, criar("span", { class: "switch-slider" })]),
          criar("span", { class: "switch-text" }, [
            criar("strong", { texto: "Emissões do emissor Nacional" }),
            criar("small", { texto: "Envia a consulta de eventos antes do resolve, recomendado quando o resolve sozinho não traz todos os dados da emissão." })
          ])
        ]),
        blocoNacional
      ])
    ])
  ]));

  container.appendChild(criar("section", { class: "card" }, [
    criar("div", { class: "card-header" }, [criar("span", { class: "card-step", texto: "2" }), criar("h2", { texto: "Identificação da nota" })]),
    criar("div", { class: "card-body" }, [
      criar("div", { class: "tabs" }, [abaUnica, abaIndividual]),
      painelUnica,
      painelIndividual
    ])
  ]));

  container.appendChild(criar("section", { class: "card" }, [
    criar("div", { class: "card-header" }, [criar("span", { class: "card-step", texto: "3" }), criar("h2", { texto: "Execução" })]),
    criar("div", { class: "card-body" }, [
      criar("div", { class: "config-row" }, [
        criar("div", { class: "config-field" }, [criar("label", { class: "field-label", texto: "Tentativas por nota" }), tentativas]),
        criar("div", { class: "config-field" }, [criar("label", { class: "field-label", texto: "Intervalo entre tentativas (ms)" }), intervalo])
      ]),
      criar("p", { class: "field-hint", texto: "As tentativas valem para erros temporários. No HTTP 429 a ferramenta respeita o Retry-After e reduz a concorrência. A espera de quando o resolve já está em execução é independente disso." }),
      criar("div", { class: "verify-box" }, [
        criar("label", { class: "switch-row" }, [
          criar("span", { class: "switch" }, [verificar, criar("span", { class: "switch-slider" })]),
          criar("span", { class: "switch-text" }, [
            criar("strong", { texto: "Conferir a situação na rota de consulta após o resolve" }),
            criar("small", { texto: "O resolve responde apenas que a solicitação foi recebida. Com esta opção o resultado mostra a situação real da nota." })
          ])
        ]),
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
    ])
  ]));

  container.appendChild(cartaoResultados);

  areaIds.addEventListener("input", aguardarDigitacao(() => {
    atualizarIds();
    localStorage.setItem(CHAVES_ARMAZENAMENTO.idsResolve, areaIds.value);
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
    const falhas = painel.resultados.filter((linha) => !linha.sucesso).map((linha) => linha.id);
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
    localStorage.setItem(CHAVES_ARMAZENAMENTO.idsResolve, areaIds.value);
    mostrarAviso(`${lista.length} ID(s) organizados.`, "success");
  }

  async function importar(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    areaIds.value = separarIdentificadores(await lerArquivoTexto(arquivo)).join("\n");
    atualizarIds();
    localStorage.setItem(CHAVES_ARMAZENAMENTO.idsResolve, areaIds.value);
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
    localStorage.removeItem(CHAVES_ARMAZENAMENTO.idsResolve);
  }

  function lerConfiguracao() {
    return {
      tentativas: parseInt(tentativas.value, 10) || 3,
      intervalo: Math.max(parseInt(intervalo.value, 10) || 1000, 0),
      nacional: nacional.checked,
      esperaNacional: parseInt(esperaNacional.value, 10) || 15000,
      verificar: verificar.checked,
      verificacoes: parseInt(verificacoes.value, 10) || 3,
      intervaloVerificacao: Math.max(parseInt(intervaloVerificacao.value, 10) || 10000, 1000)
    };
  }

  function montarItens(ids) {
    if (painel.modo === "unica") {
      const valor = identificacaoUnica.value.trim();
      return ids.map((id) => ({ id, identificacao: valor }));
    }
    return ids.map((id) => ({ id, identificacao: (painel.identificacoes.get(id) || "").trim() }));
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

    const configuracao = lerConfiguracao();
    const itens = montarItens(ids);
    const semIdentificacao = itens.filter((item) => !item.identificacao).length;
    const detalheIdentificacao = semIdentificacao === 0 ? ""
      : semIdentificacao === itens.length ? " Todas serão enviadas sem identificacaoNota."
      : ` ${semIdentificacao} dela(s) será(ão) enviada(s) sem identificacaoNota.`;
    const detalheNacional = configuracao.nacional
      ? ` Modo Nacional ativo: consulta de eventos e espera de ${configuracao.esperaNacional / 1000}s antes do resolve.`
      : "";
    const detalheVerificacao = configuracao.verificar
      ? ` A situação será conferida na rota de consulta em até ${configuracao.verificacoes} verificação(ões).`
      : " A conferência pós resolve está desligada: o resultado refletirá apenas a resposta HTTP.";

    const confirmou = await pedirConfirmacao(
      "Executar resolve",
      `Serão processadas ${itens.length} nota(s).${detalheIdentificacao}${detalheNacional}${detalheVerificacao} Deseja continuar?`
    );
    if (!confirmou) return;

    painel.sessao.reiniciar();
    painel.pool = criarPoolExecucao(5);
    painel.resultados = [];
    painel.contadores = { total: itens.length, feitas: 0, sucessos: 0, falhas: 0 };
    painel.inicio = performance.now();

    montarTabela(itens);
    atualizarContadores();
    alternar(true);
    registrarLog(`Resolve iniciado: ${itens.length} nota(s), até ${configuracao.tentativas} tentativa(s), intervalo de ${configuracao.intervalo}ms.`);

    if (configuracao.nacional) await processarNacional(itens, apiKey, configuracao);
    else {
      await painel.pool.executar(itens,
        (item, posicao) => tratarNota(item, posicao, apiKey, configuracao),
        () => painel.sessao.cancelada);
    }

    encerrar();
  }

  async function processarNacional(itens, apiKey, configuracao) {
    registrarLog(`Nacional ativo: consultando eventos de ${itens.length} nota(s).`);
    const comFalha = new Set();

    await painel.pool.executar(itens, async (item, posicao) => {
      marcar(posicao, "evento");
      const evento = await consultarEventos({
        id: item.id, apiKey, sessao: painel.sessao,
        tentativas: configuracao.tentativas, intervalo: configuracao.intervalo
      });
      if (!evento.ok && evento.mensagem !== "Cancelado") {
        comFalha.add(posicao);
        concluir(posicao, {
          id: item.id, identificacao: item.identificacao, situacaoAntes: "", situacaoDepois: "",
          status: evento.status ?? null, rotulo: "Erro na consulta de eventos", chave: "erro",
          sucesso: false, mensagem: evento.mensagem, duracaoMs: 0
        });
      }
    }, () => painel.sessao.cancelada);

    if (painel.sessao.cancelada) return;

    const pendentes = itens
      .map((item, posicao) => ({ item, posicao }))
      .filter((entrada) => !comFalha.has(entrada.posicao));

    registrarLog(`Aguardando ${configuracao.esperaNacional / 1000}s para o Nacional processar os eventos.`, "warn");
    pendentes.forEach((entrada) => marcar(entrada.posicao, "aguardando"));
    await pausar(configuracao.esperaNacional);
    if (painel.sessao.cancelada) return;

    await painel.pool.executar(pendentes,
      (entrada) => tratarNota(entrada.item, entrada.posicao, apiKey, configuracao),
      () => painel.sessao.cancelada);
  }

  async function tratarNota(item, posicao, apiKey, configuracao) {
    const inicio = performance.now();
    let situacaoAntes = "";

    if (configuracao.verificar) {
      marcar(posicao, "consultando");
      const leitura = await consultarNota({ identificador: item.id, apiKey, sessao: painel.sessao });
      situacaoAntes = leitura.nota?.situacao || "";
      if (situacaoAntes) {
        registrarLog(`ID ${item.id}: situação antes do resolve: ${situacaoAntes}.`);
        atualizarCelula(posicao, 2, situacaoAntes);
      }
    }

    marcar(posicao, "processando");
    const resolve = await executarResolve({
      id: item.id, identificacao: item.identificacao, apiKey, sessao: painel.sessao,
      tentativas: configuracao.tentativas, intervalo: configuracao.intervalo,
      aoReduzirRitmo: () => painel.pool.reduzir()
    });

    if (resolve.desfecho === "cancelado") {
      concluir(posicao, {
        id: item.id, identificacao: item.identificacao, situacaoAntes, situacaoDepois: "",
        status: null, rotulo: "Cancelado", chave: "cancelado", sucesso: false,
        mensagem: resolve.mensagem, duracaoMs: Math.round(performance.now() - inicio)
      });
      return;
    }

    const resolveOk = resolve.desfecho === "solicitado";

    if (!configuracao.verificar) {
      const rotulo = resolveOk ? "Resolve aceito" : resolve.desfecho === "processando-api" ? "Em processamento na API" : "Erro";
      concluir(posicao, {
        id: item.id, identificacao: item.identificacao, situacaoAntes, situacaoDepois: "",
        status: resolve.status, rotulo,
        chave: resolveOk ? "sem-leitura" : resolve.desfecho === "processando-api" ? "andamento" : "erro",
        sucesso: resolveOk, mensagem: resolve.mensagem,
        duracaoMs: Math.round(performance.now() - inicio)
      });
      return;
    }

    marcar(posicao, "verificando");
    const conferencia = await conferir(item.id, apiKey, resolveOk ? configuracao : { ...configuracao, verificacoes: 1 }, situacaoAntes);
    const desfecho = definirDesfecho({ situacaoAntes, situacaoDepois: conferencia.situacao, resolveOk });

    concluir(posicao, {
      id: item.id, identificacao: item.identificacao, situacaoAntes,
      situacaoDepois: conferencia.situacao, status: resolve.status,
      rotulo: desfecho.rotulo, chave: desfecho.chave, sucesso: desfecho.sucesso,
      mensagem: conferencia.mensagem || resolve.mensagem,
      duracaoMs: Math.round(performance.now() - inicio)
    });
  }

  async function conferir(id, apiKey, configuracao, situacaoAntes) {
    let situacao = "";
    let mensagem = "";

    for (let tentativa = 1; tentativa <= configuracao.verificacoes; tentativa++) {
      if (painel.sessao.cancelada) break;
      if (tentativa > 1) await pausar(configuracao.intervaloVerificacao);

      const leitura = await consultarNota({ identificador: id, apiKey, sessao: painel.sessao });
      situacao = leitura.nota?.situacao || situacao;
      mensagem = leitura.nota?.mensagem || leitura.mensagem || mensagem;
      registrarLog(`ID ${id}: verificação ${tentativa}/${configuracao.verificacoes} retornou ${situacao || "situação vazia"}.`);

      const categoria = classificarSituacao(situacao);
      const mudou = situacao && situacao !== situacaoAntes;
      if (categoria === "concluida" || categoria === "cancelada" || (categoria === "rejeitada" && mudou)) break;
    }

    return { situacao, mensagem };
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
    painel.pool.restaurar();

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
      registrarLog(`Execução cancelada. ${feitas} de ${total} processadas.`, "warn");
      mostrarAviso("Processamento cancelado.", "error");
      return;
    }
    registrarLog(`Resolve concluído em ${segundos}s: ${sucessos} sucesso(s), ${falhas} falha(s).`, falhas === 0 ? "success" : "warn");
    mostrarAviso(falhas === 0 ? "Processamento concluído." : `Concluído com ${falhas} falha(s).`, falhas === 0 ? "success" : "error");
  }

  function exportarCsv() {
    if (painel.resultados.length === 0) return;
    const conteudo = montarCsv(
      ["ID", "Identificacao enviada", "Situacao antes", "Situacao depois", "Status HTTP", "Resultado", "Mensagem", "Tempo (ms)", "Data e hora"],
      painel.resultados.map((linha) => [
        linha.id, linha.identificacao, linha.situacaoAntes, linha.situacaoDepois,
        linha.status ?? "", linha.rotulo, linha.mensagem, linha.duracaoMs, linha.quando
      ])
    );
    baixarArquivo(conteudo, `resolve-notas-${carimboDeTempo()}.csv`, "text/csv;charset=utf-8");
    mostrarAviso("CSV exportado.", "success");
  }

  function montarResumo() {
    const { feitas, sucessos, falhas } = painel.contadores;
    const autor = identificacao.ler();
    const linhas = [
      `Resolve em lote executado em ${new Date().toLocaleString("pt-BR")}${autor ? ` por ${autor}` : ""}`,
      `Notas processadas: ${feitas} | Sucesso: ${sucessos} | Falha: ${falhas}`,
      ""
    ];

    const agrupado = new Map();
    painel.resultados.forEach((linha) => {
      if (!agrupado.has(linha.rotulo)) agrupado.set(linha.rotulo, []);
      agrupado.get(linha.rotulo).push(linha);
    });

    agrupado.forEach((lista, rotulo) => {
      linhas.push(`${rotulo} (${lista.length}):`);
      lista.forEach((linha) => {
        const situacao = linha.situacaoDepois ? ` situacao ${linha.situacaoDepois}` : "";
        const mensagem = linha.mensagem ? ` - ${linha.mensagem}` : "";
        linhas.push(`  ${linha.id}${situacao}${mensagem}`);
      });
      linhas.push("");
    });

    return linhas.join("\n").trim();
  }
}
