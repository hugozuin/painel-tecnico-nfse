import { criar, aguardarDigitacao } from "../shared.js";
import { carregarDefinicao } from "../definicoes.js";
import { iconeInfo } from "../info.js";
import { normalizarBusca } from "./depara.js";

const LIMITE_ITENS = 20;
const LIMITE_LINHAS = 300;

export function normalizarItem(texto) {
  const valor = String(texto || "").trim();
  if (/^\d{1,2}\.\d{1,2}$/.test(valor)) {
    const [grupo, subitem] = valor.split(".");
    return `${grupo.padStart(2, "0")}.${subitem.padStart(2, "0")}`;
  }
  if (/^\d{3,4}$/.test(valor)) {
    const completo = valor.padStart(4, "0");
    return `${completo.slice(0, 2)}.${completo.slice(2)}`;
  }
  return "";
}

export function normalizarIndOp(texto) {
  const valor = String(texto || "").trim();
  return /^\d{1,6}$/.test(valor) ? valor.padStart(6, "0") : "";
}

export function buscarItens(dados, consulta) {
  const codigo = normalizarItem(consulta);
  if (codigo) return dados.itens[codigo] !== undefined ? [codigo] : [];
  const prefixo = String(consulta || "").trim().match(/^(\d{1,2})\.?$/);
  if (prefixo) {
    const grupo = `${prefixo[1].padStart(2, "0")}.`;
    return Object.keys(dados.itens).filter((item) => item.startsWith(grupo));
  }
  const termos = normalizarBusca(consulta).split(/\s+/).filter(Boolean);
  if (termos.length === 0) return [];
  return Object.entries(dados.itens)
    .filter(([item, descricao]) => termos.every((termo) => normalizarBusca(`${item} ${descricao}`).includes(termo)))
    .map(([item]) => item);
}

export function buscarIndOp(dados, consulta) {
  const codigo = normalizarIndOp(consulta);
  if (codigo) return dados.indOp[codigo] ? [codigo] : [];
  const termos = normalizarBusca(consulta).split(/\s+/).filter(Boolean);
  if (termos.length === 0) return [];
  return Object.entries(dados.indOp)
    .filter(([, info]) => termos.every((termo) =>
      normalizarBusca(`${info.tipoOperacao} ${info.caracteristica} ${info.local}`).includes(termo)))
    .map(([codigo]) => codigo);
}

export function agruparRelacoes(relacoes, chave) {
  const grupos = new Map();
  relacoes.forEach((relacao) => {
    const identificador = chave(relacao);
    if (!grupos.has(identificador)) grupos.set(identificador, { relacao, classificacoes: [] });
    const classificacao = relacao[6];
    const grupo = grupos.get(identificador);
    if (classificacao && !grupo.classificacoes.includes(classificacao)) grupo.classificacoes.push(classificacao);
  });
  return [...grupos.values()];
}

export async function montarTelaIbsCbs(container) {
  const carregando = criar("p", { class: "field-hint", texto: "Carregando as tabelas do IBS e da CBS…" });
  container.appendChild(carregando);
  const dados = await carregarDefinicao("ibscbs");
  carregando.remove();

  if (!dados) {
    container.appendChild(criar("p", { class: "aviso-caixa", texto: "Não foi possível carregar as tabelas. Confira o log da sessão." }));
    return;
  }

  let modo = "item";
  const botaoItem = criar("button", { type: "button", class: "modo-botao ativo", texto: "Item da LC 116" });
  const botaoIndOp = criar("button", { type: "button", class: "modo-botao", texto: "Código de operação (indOp)" });
  const busca = criar("input", { type: "search", class: "text-input", spellcheck: false });
  const sugestoes = criar("datalist", { id: "sugestoesIbsCbs" });
  busca.setAttribute("list", "sugestoesIbsCbs");
  const resultado = criar("div", { class: "ibscbs-resultado" });

  const rotulos = dados.cabecalhoIndOp || [];

  container.appendChild(criar("section", { class: "card" }, [
    criar("div", { class: "card-body" }, [
      criar("div", { class: "modo-seletor" }, [botaoItem, botaoIndOp]),
      busca,
      sugestoes,
      criar("p", { class: "field-hint", texto: `Fontes: ${dados.fontes?.indOp || "anexo VII"} e ${dados.fontes?.correlacao || "anexo VIII"}. Passe o mouse no ícone de cada código para ver a descrição.` })
    ])
  ]));
  container.appendChild(resultado);
  container.appendChild(montarRegraIncisoX(dados.regraIncisoX));

  function trocarModo(novo) {
    modo = novo;
    botaoItem.classList.toggle("ativo", modo === "item");
    botaoIndOp.classList.toggle("ativo", modo === "indop");
    busca.value = "";
    preencherSugestoes();
    desenhar();
    busca.focus();
  }

  function preencherSugestoes() {
    sugestoes.textContent = "";
    busca.placeholder = modo === "item"
      ? "Digite o item (ex.: 01.01 ou 0101) ou parte da descrição"
      : "Digite o indOp (ex.: 100301) ou parte da descrição da operação";
    const opcoes = modo === "item"
      ? Object.entries(dados.itens).map(([codigo, descricao]) => [codigo, descricao])
      : Object.entries(dados.indOp).map(([codigo, info]) => [codigo, info.tipoOperacao]);
    const fragmento = document.createDocumentFragment();
    opcoes.forEach(([codigo, descricao]) => fragmento.appendChild(criar("option", { value: codigo, label: descricao })));
    sugestoes.appendChild(fragmento);
  }

  function desenhar() {
    resultado.textContent = "";
    const consulta = busca.value.trim();
    if (!consulta) return;

    const encontrados = modo === "item" ? buscarItens(dados, consulta) : buscarIndOp(dados, consulta);
    if (encontrados.length === 0) {
      resultado.appendChild(criar("section", { class: "card" }, [
        criar("div", { class: "card-body" }, [criar("p", { class: "field-hint", texto: "Nada encontrado nos anexos para essa pesquisa." })])
      ]));
      return;
    }

    const limite = modo === "item" ? LIMITE_ITENS : 10;
    encontrados.slice(0, limite).forEach((codigo) => {
      resultado.appendChild(modo === "item" ? cartaoDoItem(codigo) : cartaoDoIndOp(codigo));
    });
    if (encontrados.length > limite) {
      resultado.appendChild(criar("p", { class: "field-hint", texto: `Mostrando ${limite} de ${encontrados.length} resultados. Refine a pesquisa para ver os demais.` }));
    }
  }

  function codigoComInfo(tipo, codigo, construir) {
    return criar("span", { class: "codigo-info" }, [
      criar("code", { texto: codigo }),
      iconeInfo(`${tipo}:${codigo}`, construir, `Descrição de ${tipo} ${codigo}`)
    ]);
  }

  function popupSimples(titulo, texto, fonte) {
    return () => criar("div", {}, [
      criar("p", { class: "popup-titulo", texto: titulo }),
      criar("p", { class: "popup-texto", texto: texto || "Sem descrição no anexo." }),
      criar("p", { class: "popup-fonte", texto: `Fonte: ${fonte}` })
    ]);
  }

  const infoItem = (codigo) => codigoComInfo("item", codigo,
    popupSimples(`Item ${codigo} da LC 116`, dados.itens[codigo], dados.fontes.correlacao));
  const infoNbs = (codigo) => codigoComInfo("NBS", codigo,
    popupSimples(`NBS ${codigo}`, dados.nbs[codigo], dados.fontes.correlacao));
  const infoClassificacao = (codigo) => codigoComInfo("cClassTrib", codigo,
    popupSimples(`cClassTrib ${codigo}`, dados.cClassTrib[codigo], dados.fontes.correlacao));
  const infoIndOp = (codigo) => codigoComInfo("indOp", codigo, () => conteudoIndOp(codigo));

  function conteudoIndOp(codigo) {
    const info = dados.indOp[codigo];
    if (!info) {
      return criar("div", {}, [
        criar("p", { class: "popup-titulo", texto: `indOp ${codigo}` }),
        criar("p", { class: "popup-vazio", texto: "Código não encontrado no anexo VII." })
      ]);
    }
    const campos = [
      [rotulos[1] || "Tipo de operação", info.tipoOperacao],
      [rotulos[2] || "Característica do fornecimento", info.caracteristica],
      [rotulos[3] || "Local do fornecimento", info.local],
      [rotulos[4] || "Dispositivo legal", info.dispositivoLegal],
      [rotulos[5] || "Observação", info.observacao],
      [rotulos[6] || "indNFe", info.indNFe],
      [rotulos[7] || "indNFSe", info.indNFSe]
    ].filter(([, valor]) => valor);
    return criar("div", {}, [
      criar("p", { class: "popup-titulo", texto: `indOp ${codigo}` }),
      ...campos.flatMap(([rotulo, valor]) => [criar("h4", { texto: rotulo }), criar("p", { class: "popup-texto", texto: valor })]),
      criar("p", { class: "popup-fonte", texto: `Fonte: ${dados.fontes.indOp}` })
    ]);
  }

  function tabela(cabecalho, linhas) {
    return criar("div", { class: "table-wrapper" }, [
      criar("table", { class: "data-table tabela-ibscbs" }, [
        criar("thead", {}, [criar("tr", {}, cabecalho.map((titulo) => criar("th", { texto: titulo })))]),
        criar("tbody", {}, linhas)
      ])
    ]);
  }

  function celula(conteudo) {
    return criar("td", {}, Array.isArray(conteudo) ? conteudo : [conteudo]);
  }

  function chips(classificacoes) {
    return criar("div", { class: "chips" }, classificacoes.map((codigo) => infoClassificacao(codigo)));
  }

  function cartaoDoItem(item) {
    const relacoes = dados.relacoes.filter((relacao) => relacao[0] === item);
    const grupos = agruparRelacoes(relacoes, (relacao) => relacao.slice(1, 6).join("|"));
    const linhas = grupos.slice(0, LIMITE_LINHAS).map(({ relacao, classificacoes }) => criar("tr", {}, [
      celula(infoNbs(relacao[1])),
      celula(relacao[4] ? infoIndOp(relacao[4]) : "—"),
      celula(relacao[2] || "—"),
      celula(relacao[3] || "—"),
      celula(dados.locais[relacao[5]] || "—"),
      celula(chips(classificacoes))
    ]));
    return criar("section", { class: "card" }, [
      criar("div", { class: "card-header" }, [
        criar("h2", {}, [infoItem(item)]),
        criar("span", { class: "ibscbs-descricao", texto: dados.itens[item] })
      ]),
      criar("div", { class: "card-body" }, [
        tabela(["NBS", "indOp", "PS onerosa? (S/N)", "Adq. exterior? (S/N)", "Local incidência IBS", "cClassTrib"], linhas)
      ])
    ]);
  }

  function cartaoDoIndOp(codigo) {
    const info = dados.indOp[codigo];
    const relacoes = dados.relacoes.filter((relacao) => relacao[4] === codigo);
    const grupos = agruparRelacoes(relacoes, (relacao) => [relacao[0], relacao[1], relacao[2], relacao[3]].join("|"));
    const linhas = grupos.slice(0, LIMITE_LINHAS).map(({ relacao, classificacoes }) => criar("tr", {}, [
      celula(infoItem(relacao[0])),
      celula(infoNbs(relacao[1])),
      celula(relacao[2] || "—"),
      celula(relacao[3] || "—"),
      celula(chips(classificacoes))
    ]));
    const detalhes = [
      [rotulos[2] || "Característica do fornecimento", info.caracteristica],
      [rotulos[3] || "Local do fornecimento", info.local],
      [rotulos[4] || "Dispositivo legal", info.dispositivoLegal]
    ].filter(([, valor]) => valor);
    return criar("section", { class: "card" }, [
      criar("div", { class: "card-header" }, [
        criar("h2", {}, [infoIndOp(codigo)]),
        criar("span", { class: "ibscbs-descricao", texto: info.tipoOperacao })
      ]),
      criar("div", { class: "card-body" }, [
        criar("dl", { class: "ibscbs-detalhes" }, detalhes.flatMap(([rotulo, valor]) => [
          criar("dt", { texto: rotulo }), criar("dd", { texto: valor })
        ])),
        relacoes.length
          ? tabela(["Item LC 116", "NBS", "PS onerosa? (S/N)", "Adq. exterior? (S/N)", "cClassTrib"], linhas)
          : criar("p", { class: "field-hint", texto: "Este indOp não aparece na tabela de correlação do anexo VIII." }),
        grupos.length > LIMITE_LINHAS
          ? criar("p", { class: "field-hint", texto: `Mostrando ${LIMITE_LINHAS} de ${grupos.length} linhas.` })
          : null
      ])
    ]);
  }

  busca.addEventListener("input", aguardarDigitacao(desenhar, 200));
  botaoItem.addEventListener("click", () => trocarModo("item"));
  botaoIndOp.addEventListener("click", () => trocarModo("indop"));
  preencherSugestoes();
}

function montarRegraIncisoX(grade) {
  const linhas = (grade || []).filter((linha) => linha.some((valor) => valor));
  if (linhas.length === 0) return criar("span");
  return criar("section", { class: "card" }, [
    criar("details", { class: "regra-inciso" }, [
      criar("summary", { texto: "Aba REGRA inc. X do anexo VIII" }),
      criar("div", { class: "table-wrapper" }, [
        criar("table", { class: "data-table" }, [
          criar("tbody", {}, linhas.map((linha) => criar("tr", {}, linha.map((valor) => criar("td", { texto: valor })))))
        ])
      ])
    ])
  ]);
}
