/* Monta a tela de uma rota a partir da definição do catálogo. Tudo que
   aparece aqui vem do arquivo de definições: título, campos, método,
   caminho e formato do resultado. */

import {
  criar, mostrarAviso, pedirConfirmacao, registrarLog, separarIdentificadores,
  aguardarDigitacao, criarPoolExecucao, baixarArquivo, carimboDeTempo, montarCsv,
  copiarTexto, lerArquivoTexto, pausar
} from "../shared.js";
import { criarSessaoRequisicoes, requisitar } from "../plugnotas.js";
import { exigirApiKey } from "../credencial.js";

const situacaoBoa = /CONCLU|AUTORIZ|SUCESSO|ATIVO/;
const situacaoRuim = /REJEIT|ERRO|NEGAD|FALHA|INVALID/;
const situacaoNeutra = /CANCEL/;

export function montarTelaRota(container, rota, contexto) {
  const estado = {
    sessao: criarSessaoRequisicoes(),
    pool: criarPoolExecucao(contexto.concorrencia || 5),
    executando: false,
    linhas: [],
    registros: []
  };

  const campos = {};
  const entrada = rota.entrada || { tipo: "lote" };

  const areaResultado = criar("div", { class: "resultado-area" });
  const barraProgresso = criar("div", { class: "progress-fill" });
  const botaoExecutar = criar("button", { type: "button", class: "btn btn-primary", texto: rotuloAcao(rota) });
  const botaoCancelar = criar("button", { type: "button", class: "btn btn-danger", texto: "Cancelar", disabled: true });
  const botaoExportar = criar("button", { type: "button", class: "btn btn-outline btn-sm", texto: "Exportar CSV", disabled: true, hidden: rota.resultado?.tipo !== "tabela" });

  const areaEntrada = entrada.tipo === "formulario" ? null : criar("textarea", {
    class: "text-area",
    rows: 6,
    spellcheck: false,
    placeholder: entrada.exemplo || ""
  });

  const contador = criar("span", { class: "badge badge-neutral", texto: "0 itens" });

  container.appendChild(criar("section", { class: "card" }, [
    criar("div", { class: "card-header" }, [
      criar("h2", { texto: "Requisição" }),
      rota.sensivel ? criar("span", { class: "badge badge-warning", texto: "ação sensível" }) : null,
      entrada.tipo === "formulario" ? null : contador
    ]),
    criar("div", { class: "card-body" }, [
      contexto.controles || null,
      criar("p", { class: "rota-endereco mono", texto: `${rota.metodo || "GET"} ${contexto.descricaoBase || ""}${rota.caminho}` }),
      rota.observacao ? criar("p", { class: "aviso-caixa", texto: rota.observacao }) : null,
      ...(areaEntrada ? [
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
      ] : []),
      ...montarCampos(rota, campos),
      criar("div", { class: "exec-buttons" }, [botaoExecutar, botaoCancelar]),
      criar("div", { class: "progress-track" }, [barraProgresso])
    ])
  ]));

  const cartaoResultado = criar("section", { class: "card cartao-retorno" }, [
    criar("div", { class: "card-header" }, [
      criar("h2", { texto: "Retorno" }),
      botaoExportar,
      criar("button", {
        type: "button", class: "btn btn-outline btn-sm", texto: "Copiar retorno",
        aoClicar: async () => {
          if (estado.registros.length === 0) {
            mostrarAviso(`Clique em ${rotuloAcao(rota)} antes de copiar.`, "info");
            return;
          }
          const copiou = await copiarTexto(textoDoResultado(estado, rota));
          mostrarAviso(copiou ? "Retorno copiado." : "Não foi possível copiar.", copiou ? "success" : "error");
        }
      })
    ]),
    criar("div", { class: "card-body" }, [areaResultado])
  ]);
  areaResultado.appendChild(criar("p", {
    class: "field-hint retorno-vazio",
    texto: `Nenhuma requisição executada ainda. O retorno aparece aqui depois de clicar em ${rotuloAcao(rota)}.`
  }));
  container.appendChild(cartaoResultado);

  function atualizarContador() {
    const total = separarIdentificadores(areaEntrada?.value || "").length;
    contador.textContent = `${total} ${total === 1 ? "item" : "itens"}`;
  }

  areaEntrada?.addEventListener("input", aguardarDigitacao(atualizarContador, 250));

  botaoExecutar.addEventListener("click", () => executar());
  botaoCancelar.addEventListener("click", () => {
    if (!estado.executando) return;
    estado.sessao.cancelar();
    registrarLog(`${rota.titulo}: cancelamento solicitado.`, "warn");
  });
  botaoExportar.addEventListener("click", () => exportarCsv(estado, rota));

  async function executar() {
    if (estado.executando) return;

    const credencial = contexto.exigeApiKey ? exigirApiKey() : "";
    if (contexto.exigeApiKey && !credencial) return;

    const valores = lerCampos(rota, campos);
    if (valores.erro) {
      mostrarAviso(valores.erro, "error");
      return;
    }

    const itens = entrada.tipo === "formulario" ? [""] : separarIdentificadores(areaEntrada.value);
    if (entrada.tipo !== "formulario" && itens.length === 0) {
      mostrarAviso("Informe ao menos um item.", "error");
      areaEntrada.focus();
      return;
    }

    if (rota.confirmar) {
      const quantidade = entrada.tipo === "formulario" ? "" : ` Itens informados: ${itens.length}.`;
      const confirmou = await pedirConfirmacao(rota.titulo, `${rota.confirmar}${quantidade}`);
      if (!confirmou) return;
    }

    estado.sessao.reiniciar();
    estado.registros = [];
    estado.linhas = [];
    estado.executando = true;
    alternar(true);
    areaResultado.textContent = "";

    registrarLog(`${rota.titulo}: iniciando com ${entrada.tipo === "formulario" ? "1 requisição" : `${itens.length} item(ns)`}.`);

    if (entrada.tipo === "lote-conjunto") {
      await executarConjunto(itens, valores.dados, credencial);
    } else {
      await executarItemAItem(itens, valores.dados, credencial);
    }

    estado.executando = false;
    alternar(false);
    botaoExportar.disabled = estado.registros.length === 0;
    if (!estado.sessao.cancelada) mostrarAviso(`${rota.titulo} concluída.`, "success");
  }

  async function executarItemAItem(itens, dados, credencial) {
    const tabela = rota.resultado?.tipo === "tabela" ? prepararTabela(areaResultado, rota, estado, itens) : null;
    let concluidos = 0;

    await estado.pool.executar(itens, async (item, posicao) => {
      const alvo = montarEndereco(rota, contexto, item, dados);
      const resposta = await requisitar({
        ...prepararPedido(rota, contexto, alvo),
        apiKey: credencial,
        sessao: estado.sessao,
        comoBlob: rota.resultado?.tipo === "arquivo"
      });

      registrarResultado({ item, resposta: { ...resposta, destino: alvo.url }, posicao, tabela });
      concluidos++;
      barraProgresso.style.width = `${Math.round((concluidos / itens.length) * 100)}%`;
      if (rota.sensivel) await pausar(150);
    }, () => estado.sessao.cancelada);
  }

  async function executarConjunto(itens, dados, credencial) {
    const alvo = montarEndereco(rota, contexto, "", dados);
    const resposta = await requisitar({
      ...prepararPedido(rota, contexto, { ...alvo, corpo: itens }),
      apiKey: credencial,
      sessao: estado.sessao
    });
    barraProgresso.style.width = "100%";
    const rotulo = `${itens.length} item(ns) enviados`;
    estado.registros.push({ item: rotulo, status: resposta.status, mensagem: resposta.mensagem, dados: resposta.dados, texto: resposta.texto });
    areaResultado.appendChild(blocoRetorno(rotulo, { ...resposta, destino: alvo.url }, rota.metodo || "POST"));
  }

  function registrarResultado({ item, resposta, posicao, tabela }) {
    const tipo = rota.resultado?.tipo || "mensagem";

    if (tipo === "arquivo") {
      if (resposta.ok && resposta.blob) {
        const prefixo = rota.resultado.prefixo || rota.id;
        baixarArquivo(resposta.blob, `${prefixo}-${item}.${rota.resultado.extensao || extensaoDoTipo(resposta.blob.type)}`, resposta.blob.type);
        registrarLog(`${rota.titulo}: arquivo de ${item} baixado.`, "success");
      }
      estado.registros.push({ item, status: resposta.status, mensagem: resposta.ok ? "Arquivo baixado" : resposta.mensagem });
      areaResultado.appendChild(linhaSimples(item, resposta.ok ? "Arquivo baixado" : resposta.mensagem, resposta.ok));
      return;
    }

    if (tipo === "tabela") {
      const documento = primeiroDocumento(resposta.dados);
      const registro = { item, status: resposta.status, mensagem: resposta.mensagem, ...documento };
      estado.registros.push(registro);
      preencherLinha(tabela, posicao, rota, registro, resposta.ok);
      return;
    }

    if (tipo === "json") {
      estado.registros.push({ item, status: resposta.status, mensagem: resposta.mensagem, dados: resposta.dados, texto: resposta.texto });
      areaResultado.appendChild(blocoRetorno(item, resposta, rota.metodo || "GET"));
      return;
    }

    estado.registros.push({ item, status: resposta.status, mensagem: resposta.mensagem });
    areaResultado.appendChild(linhaSimples(item, resposta.mensagem || (resposta.ok ? "Solicitação aceita" : "Falha"), resposta.ok));
  }

  function alternar(executando) {
    botaoExecutar.disabled = executando;
    botaoCancelar.disabled = !executando;
    if (areaEntrada) areaEntrada.disabled = executando;
    Object.values(campos).forEach((campo) => { campo.disabled = executando; });
    barraProgresso.classList.toggle("running", executando);
    if (!executando) return;
    barraProgresso.style.width = "0%";
  }

  atualizarContador();
}

const EXTENSOES = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "application/pdf": "pdf", "application/xml": "xml", "text/xml": "xml" };

function extensaoDoTipo(tipo) {
  return EXTENSOES[String(tipo || "").split(";")[0].trim().toLowerCase()] || "bin";
}

function rotuloAcao(rota) {
  if (rota.resultado?.tipo === "arquivo") return "Baixar arquivos";
  if ((rota.metodo || "GET") === "GET") return "Consultar";
  return "Executar";
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

function montarEndereco(rota, contexto, item, dados) {
  let caminho = rota.caminho;
  caminho = caminho.replace("{item}", encodeURIComponent(item));
  Object.entries(dados.caminho).forEach(([chave, valor]) => {
    caminho = caminho.replace(`{${chave}}`, encodeURIComponent(valor));
  });

  const consulta = new URLSearchParams(dados.consulta);
  if (rota.parametroItem && item) {
    const [, chave] = rota.parametroItem.split(".");
    consulta.set(chave, item);
  }

  const base = contexto.base(rota);
  const url = `${base}${caminho}${consulta.toString() ? `?${consulta}` : ""}`;
  const semCorpo = (rota.metodo || "GET") === "GET" || Object.keys(dados.corpo).length === 0;
  const corpo = semCorpo ? undefined : dados.corpo;

  return { url, corpo };
}

function prepararPedido(rota, contexto, alvo) {
  if (contexto.prepararPedido) return contexto.prepararPedido(alvo, rota);
  return { url: alvo.url, metodo: rota.metodo || "GET", corpo: alvo.corpo };
}

function primeiroDocumento(dados) {
  if (!dados) return {};
  const documento = Array.isArray(dados) ? dados[0] : dados;
  return documento && typeof documento === "object" ? documento : {};
}

function prepararTabela(area, rota, estado, itens) {
  const colunas = rota.resultado.colunas || [];
  const corpo = criar("tbody");

  itens.forEach((item) => {
    const linha = criar("tr", {}, [
      criar("td", { class: "mono", texto: item }),
      ...colunas.map(() => criar("td", { texto: "—" })),
      criar("td", { class: "cell-status", texto: "—" })
    ]);
    corpo.appendChild(linha);
    estado.linhas.push({ elemento: linha, texto: item.toLowerCase() });
  });

  const filtro = criar("input", {
    type: "search", class: "text-input", placeholder: "Filtrar resultado", spellcheck: false,
    aoDigitar: aguardarDigitacao((evento) => {
      const termo = evento.target.value.trim().toLowerCase();
      estado.linhas.forEach((registro) => {
        registro.elemento.hidden = Boolean(termo) && !registro.texto.includes(termo);
      });
    }, 200)
  });

  area.appendChild(criar("div", { class: "table-toolbar" }, [filtro]));
  area.appendChild(criar("div", { class: "table-wrapper" }, [
    criar("table", { class: "data-table" }, [
      criar("thead", {}, [
        criar("tr", {}, [
          criar("th", { texto: "Item" }),
          ...colunas.map((coluna) => criar("th", { texto: coluna.titulo })),
          criar("th", { texto: "HTTP" })
        ])
      ]),
      corpo
    ])
  ]));

  return { corpo, colunas };
}

function preencherLinha(tabela, posicao, rota, registro, ok) {
  const linha = tabela.corpo.children[posicao];
  if (!linha) return;

  tabela.colunas.forEach((coluna, indice) => {
    const celula = linha.children[indice + 1];
    const valor = registro[coluna.campo];
    celula.textContent = "";

    if (coluna.estilo === "situacao") {
      const texto = String(valor ?? (ok ? "sem situação" : "falha")).toUpperCase();
      celula.appendChild(criar("span", { class: `badge ${distintivoSituacao(texto, ok)}`, texto }));
      return;
    }
    celula.textContent = valor === undefined || valor === null || valor === "" ? "—" : String(valor);
  });

  const status = linha.lastElementChild;
  status.textContent = registro.status ?? "—";
  status.className = `cell-status ${ok ? "status-ok" : "status-erro"}`;
}

function distintivoSituacao(texto, ok) {
  if (!ok) return "badge-error";
  if (situacaoRuim.test(texto)) return "badge-error";
  if (situacaoBoa.test(texto)) return "badge-success";
  if (situacaoNeutra.test(texto)) return "badge-neutral";
  return "badge-warning";
}

function linhaSimples(item, mensagem, ok) {
  return criar("div", { class: `linha-resultado ${ok ? "ok" : "erro"}` }, [
    criar("span", { class: "mono", texto: item }),
    criar("span", { texto: mensagem || "" })
  ]);
}

export function textoDoRetorno(resposta) {
  if (resposta.dados !== null && resposta.dados !== undefined) return JSON.stringify(resposta.dados, null, 2);
  return resposta.texto || resposta.mensagem || "";
}

function blocoRetorno(item, resposta, metodo) {
  const corpo = textoDoRetorno(resposta);
  const campo = criar("textarea", {
    class: "text-area code-area retorno-corpo",
    readOnly: true,
    spellcheck: false,
    rows: Math.min(18, Math.max(4, corpo.split("\n").length + 1)),
    value: corpo || "(retorno vazio)"
  });
  return criar("section", { class: `retorno ${resposta.ok ? "retorno-ok" : "retorno-erro"}` }, [
    criar("header", {}, [
      criar("span", { class: "mono", texto: item }),
      criar("span", { class: `badge ${resposta.ok ? "badge-success" : "badge-error"}`, texto: resposta.status ? `HTTP ${resposta.status}` : "Sem resposta" }),
      resposta.tipo ? criar("span", { class: "retorno-meta", texto: resposta.tipo }) : null,
      Number.isFinite(resposta.duracaoMs) ? criar("span", { class: "retorno-meta", texto: `${resposta.duracaoMs} ms` }) : null,
      criar("button", {
        type: "button", class: "btn btn-outline btn-xs", texto: "Copiar retorno",
        aoClicar: async () => {
          const copiou = await copiarTexto(corpo);
          mostrarAviso(copiou ? "Retorno copiado." : "Não foi possível copiar.", copiou ? "success" : "error");
        }
      })
    ]),
    resposta.destino ? criar("p", { class: "retorno-url", texto: `${metodo} ${resposta.destino}` }) : null,
    campo
  ]);
}

function textoDoResultado(estado, rota) {
  return estado.registros.map((registro) => {
    if (rota.resultado?.tipo === "json") {
      return `${registro.item}\n${textoDoRetorno(registro)}`;
    }
    const partes = Object.entries(registro)
      .filter(([chave]) => chave !== "item" && chave !== "dados")
      .map(([chave, valor]) => `${chave}: ${valor}`);
    return `${registro.item} | ${partes.join(" | ")}`;
  }).join("\n\n");
}

function exportarCsv(estado, rota) {
  if (estado.registros.length === 0) return;
  const colunas = rota.resultado.colunas || [];
  const conteudo = montarCsv(
    ["Item", ...colunas.map((coluna) => coluna.titulo), "HTTP", "Mensagem"],
    estado.registros.map((registro) => [
      registro.item,
      ...colunas.map((coluna) => registro[coluna.campo] ?? ""),
      registro.status ?? "",
      registro.mensagem ?? ""
    ])
  );
  baixarArquivo(conteudo, `${rota.id}-${carimboDeTempo()}.csv`, "text/csv;charset=utf-8");
  mostrarAviso("CSV exportado.", "success");
}

