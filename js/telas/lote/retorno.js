import {
  criar, mostrarAviso, registrarLog, aguardarDigitacao, baixarArquivo, carimboDeTempo, montarCsv, copiarTexto
} from "../../shared.js";
import { montarCartao } from "../../componentes.js";

const situacaoBoa = /CONCLU|AUTORIZ|SUCESSO|ATIVO/;
const situacaoRuim = /REJEIT|ERRO|NEGAD|FALHA|INVALID/;
const situacaoNeutra = /CANCEL/;

const EXTENSOES = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "application/pdf": "pdf", "application/xml": "xml", "text/xml": "xml" };

export function montarCartaoRetorno(rota, estado, rotuloDaAcao) {
  const area = criar("div", { class: "resultado-area" }, [
    criar("p", {
      class: "field-hint retorno-vazio",
      texto: `Nenhuma requisição executada ainda. O retorno aparece aqui depois de clicar em ${rotuloDaAcao}.`
    })
  ]);
  const botaoExportar = criar("button", {
    type: "button", class: "btn btn-outline btn-sm", texto: "Exportar CSV", disabled: true, hidden: rota.resultado?.tipo !== "tabela",
    aoClicar: () => exportarCsv(estado, rota)
  });
  const botaoCopiar = criar("button", {
    type: "button", class: "btn btn-outline btn-sm", texto: "Copiar retorno",
    aoClicar: () => copiarResultado(estado, rota, rotuloDaAcao)
  });
  const cartao = montarCartao({ titulo: "Retorno", classe: "cartao-retorno", cabecalho: [botaoExportar, botaoCopiar] }, [area]);
  return { cartao, area, botaoExportar };
}

async function copiarResultado(estado, rota, rotuloDaAcao) {
  if (estado.registros.length === 0) {
    mostrarAviso(`Clique em ${rotuloDaAcao} antes de copiar.`, "info");
    return;
  }
  const copiou = await copiarTexto(textoDoResultado(estado, rota));
  mostrarAviso(copiou ? "Retorno copiado." : "Não foi possível copiar.", copiou ? "success" : "error");
}

export function registrarResultado({ rota, estado, area, tabela }, { item, resposta, posicao }) {
  const tipo = rota.resultado?.tipo || "mensagem";

  if (tipo === "arquivo") {
    if (resposta.ok && resposta.blob) {
      const prefixo = rota.resultado.prefixo || rota.id;
      baixarArquivo(resposta.blob, `${prefixo}-${item}.${rota.resultado.extensao || extensaoDoTipo(resposta.blob.type)}`, resposta.blob.type);
      registrarLog(`${rota.titulo}: arquivo de ${item} baixado.`, "success");
    }
    estado.registros.push({ item, status: resposta.status, mensagem: resposta.ok ? "Arquivo baixado" : resposta.mensagem });
    area.appendChild(linhaSimples(item, resposta.ok ? "Arquivo baixado" : resposta.mensagem, resposta.ok));
    return;
  }

  if (tipo === "tabela") {
    const documento = primeiroDocumento(resposta.dados);
    const registro = { item, status: resposta.status, mensagem: resposta.mensagem, ...documento };
    estado.registros.push(registro);
    preencherLinha(tabela, posicao, registro, resposta.ok);
    return;
  }

  if (tipo === "json") {
    estado.registros.push({ item, status: resposta.status, mensagem: resposta.mensagem, dados: resposta.dados, texto: resposta.texto });
    area.appendChild(blocoRetorno(item, resposta, rota.metodo || "GET"));
    return;
  }

  estado.registros.push({ item, status: resposta.status, mensagem: resposta.mensagem });
  area.appendChild(linhaSimples(item, resposta.mensagem || (resposta.ok ? "Solicitação aceita" : "Falha"), resposta.ok));
}

export function registrarConjunto({ rota, estado, area }, rotulo, { resposta, destino }) {
  estado.registros.push({ item: rotulo, status: resposta.status, mensagem: resposta.mensagem, dados: resposta.dados, texto: resposta.texto });
  area.appendChild(blocoRetorno(rotulo, { ...resposta, destino }, rota.metodo || "POST"));
}

function extensaoDoTipo(tipo) {
  return EXTENSOES[String(tipo || "").split(";")[0].trim().toLowerCase()] || "bin";
}

function primeiroDocumento(dados) {
  if (!dados) return {};
  const documento = Array.isArray(dados) ? dados[0] : dados;
  return documento && typeof documento === "object" ? documento : {};
}

export function prepararTabela(area, rota, estado, itens) {
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

function preencherLinha(tabela, posicao, registro, ok) {
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
