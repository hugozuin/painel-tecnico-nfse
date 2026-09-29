import { criar } from "./shared.js";

export const AVISO_DE_INCONSISTENCIA = "Há inconsistências entre as fontes desta tag. Para uma informação precisa, valide nos scripts.";
const CAMPO_DO_ESQUEMA = "versaoEsquema";

const MARCAS_DO_GETRPS = {
  primeiroServico: "usa só o primeiro serviço",
  soma: "soma os valores de todos os serviços",
  arredondamento: "arredonda o valor",
  data: "formata a data",
  condicional: "tem valor condicional"
};

const LIGACOES = {
  documentacao: "Ligação pela documentação da API.",
  componente: "Ligação inferida pelos nomes do script e do mapeamento do componente, usados só como apoio.",
  nome: "Ligação inferida pelo nome da chave e pelos códigos que a tag aceita."
};

const SIGNIFICADO_DOS_SELOS = {
  "Convertido": "O PlugNotas muda o valor do JSON antes de gravar a tag: tabela de códigos, arredondamento, data, concatenação ou soma. Detalhes no ícone da tag.",
  "Condicional": "A tag só é gravada quando outros campos do JSON têm certos valores. Detalhes no ícone da tag.",
  "Muda no RTC007": "O preenchimento da tag muda com o versaoEsquema RTC007 no JSON. Detalhes no ícone da tag."
};

export function ehDaDps(entrada) {
  return `${entrada.caminho}${entrada.tag}`.includes("/DPS/");
}

function origens(plugnotas) {
  return plugnotas?.origens || [];
}

function camposDasOrigens(plugnotas) {
  return origens(plugnotas).flatMap((origem) => origem.campos || []);
}

export function temConversao(plugnotas) {
  return origens(plugnotas).some((origem) => origem.tabelas?.length
    || (origem.campos || []).some((campo) => campo.modo && campo.modo !== "copia")
    || (origem.marcas || []).some((marca) => marca !== "condicional"));
}

export function temInconsistencia(plugnotas) {
  return Boolean(plugnotas?.inconsistencias?.length);
}

function condicoes(plugnotas) {
  return camposDasOrigens(plugnotas).flatMap((campo) => campo.condicoes || []);
}

function dependeDoEsquema(plugnotas) {
  return condicoes(plugnotas).some((condicao) => condicao.campo === CAMPO_DO_ESQUEMA)
    || origens(plugnotas).some((origem) => (origem.tabelas || []).some((tabela) => tabela.esquema));
}

function selos(plugnotas) {
  const lista = [];
  if (temConversao(plugnotas)) lista.push("Convertido");
  if (condicoes(plugnotas).some((condicao) => condicao.campo !== CAMPO_DO_ESQUEMA)) lista.push("Condicional");
  if (dependeDoEsquema(plugnotas)) lista.push("Muda no RTC007");
  return lista.map((texto) => criar("span", { class: "badge badge-neutral depara-selo", title: SIGNIFICADO_DOS_SELOS[texto], texto }));
}

function marcaDeInconsistencia() {
  return criar("span", { class: "depara-inconsistencia", title: AVISO_DE_INCONSISTENCIA, texto: "Inconsistências nas fontes" });
}

const TEXTOS_DA_SITUACAO = {
  semCampoJson: () => "No PlugNotas: preenchida sem campo do JSON identificado (valor fixo, numeração ou cadastro da empresa).",
  camposPrefeitura: (plugnotas) => `No PlugNotas: sem campo próprio no JSON. Pode ser enviada pelos campos da prefeitura (camposPrefeitura), com o nome ${plugnotas.campoPrefeitura}.`,
  semOrigem: () => "No PlugNotas: campo do JSON não identificado nas fontes analisadas."
};

export function resumoDoPlugNotas(entrada) {
  if (!ehDaDps(entrada)) return criar("p", { class: "depara-plugnotas depara-sem-origem", texto: "Gerada pelo Nacional na autorização da NFS-e." });
  const plugnotas = entrada.plugnotas;
  if (!plugnotas) return null;
  const aviso = temInconsistencia(plugnotas) ? marcaDeInconsistencia() : null;
  if (plugnotas.situacao !== "preenchida") {
    return criar("div", { class: "depara-plugnotas" }, [
      criar("span", { class: "depara-sem-origem", texto: (TEXTOS_DA_SITUACAO[plugnotas.situacao] || TEXTOS_DA_SITUACAO.semOrigem)(plugnotas) }),
      aviso
    ]);
  }
  return criar("div", { class: "depara-plugnotas" }, [
    criar("span", { class: "depara-rotulo", texto: "No PlugNotas" }),
    ...(plugnotas.json || []).map((campo) => criar("code", { class: "campo-json", texto: campo })),
    ...selos(plugnotas),
    aviso
  ]);
}

function listaDeValores(valores) {
  const nomes = valores.map((valor) => ({ ausente: "ausente", true: "verdadeiro", false: "falso" }[valor] || valor));
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} ou ${nomes.at(-1)}` : nomes.join("");
}

export function textoDaCondicao(condicao) {
  if (condicao.campo === CAMPO_DO_ESQUEMA) {
    return condicao.tipo === "quando" ? `Só com versaoEsquema ${listaDeValores(condicao.valores)}.` : `Fora do versaoEsquema ${listaDeValores(condicao.valores)}.`;
  }
  return condicao.tipo === "quando"
    ? `Só é gravado quando ${condicao.campo} for ${listaDeValores(condicao.valores)}.`
    : `Não é gravado quando ${condicao.campo} for ${listaDeValores(condicao.valores)}.`;
}

export function textoDoModo(campo) {
  const modos = {
    copia: "copiado sem conversão",
    arredondamento: "arredondado pela lib (regra de arredondamento não confirmada)",
    data: `data no formato ${String(campo.formato || "").replace("YYYY", "AAAA")}${campo.fuso ? `, fuso ${campo.fuso}` : ""}`,
    concatenacao: "concatenado com os outros campos desta origem",
    soma: "somado aos outros campos desta origem",
    transformado: "transformado pela lib"
  };
  return modos[campo.modo] || "";
}

function valorDaTabela(valor) {
  if (Array.isArray(valor)) return valor.join(", ");
  return valor === "" ? "(vazio)" : { ausente: "ausente", true: "verdadeiro", false: "falso" }[valor] || String(valor);
}

function tabelaDeConversao(tabela) {
  const titulo = tabela.esquema ? ` (${tabela.esquema === "RTC007" ? "com" : "sem"} versaoEsquema RTC007)` : "";
  return [
    criar("p", { class: "popup-mensagem", texto: `Conversão de ${tabela.json}${titulo}:` }),
    criar("table", { class: "popup-tabela" }, [
      criar("thead", {}, [criar("tr", {}, [criar("th", { texto: "No JSON" }), criar("th", { texto: "Gravado" })])]),
      criar("tbody", {}, Object.entries(tabela.valores).map(([entrada, saida]) =>
        criar("tr", {}, [criar("td", { texto: valorDaTabela(entrada) }), criar("td", { texto: valorDaTabela(saida) })])))
    ])
  ];
}

function textoDaFonte(origem) {
  if (origem.fonte === "lib") return `Lib do PlugNotas, chave ${origem.chave}${origem.linha ? ` (${origem.linha})` : ""}`;
  if (origem.fonte === "getRps") return `getRps.js, chave ${origem.chave}${origem.linha ? ` (${origem.linha})` : ""}, uso no Nacional não confirmado`;
  return "Campo do JSON";
}

function textosDasNotas(origem) {
  const notas = origem.notas;
  if (!notas) return [];
  const textos = [];
  if (notas.semSinais) textos.push(`Em ${notas.semSinais} notas conferidas, o texto saiu com sinais, acentos, espaços ou quebras de linha diferentes.`);
  if (notas.semTag) textos.push(`Em ${notas.semTag} notas o campo veio no JSON e a tag não saiu no XML.`);
  return textos;
}

function blocoDaOrigem(origem) {
  const linhas = [criar("p", { class: "popup-regra-detalhes", texto: textoDaFonte(origem) })];
  (origem.campos || []).forEach((campo) => {
    const modo = textoDoModo(campo);
    linhas.push(criar("p", { class: "popup-texto" }, [criar("code", { texto: campo.json }), modo ? ` ${modo}` : ""]));
    (campo.condicoes || []).forEach((condicao) => linhas.push(criar("p", { class: "popup-mensagem", texto: textoDaCondicao(condicao) })));
  });
  (origem.tabelas || []).forEach((tabela) => linhas.push(...tabelaDeConversao(tabela)));
  (origem.exigeNumero || []).forEach((campo) => linhas.push(criar("p", { class: "popup-mensagem", texto: `A lib só usa ${campo} quando ele vem como número; como texto, é ignorado.` })));
  const marcas = (origem.marcas || []).map((marca) => MARCAS_DO_GETRPS[marca]).filter(Boolean);
  if (marcas.length) linhas.push(criar("p", { class: "popup-mensagem", texto: `O getRps.js ${listaDeValores(marcas)}.` }));
  if (LIGACOES[origem.ligacao]) linhas.push(criar("p", { class: "popup-nota", texto: LIGACOES[origem.ligacao] }));
  textosDasNotas(origem).forEach((texto) => linhas.push(criar("p", { class: "popup-nota", texto })));
  return criar("div", { class: "popup-regra" }, linhas);
}

function blocoDaDocumentacao(documentado) {
  const partes = [documentado.tipo, documentado.tamanho ? `até ${documentado.tamanho} caracteres` : "",
    documentado.valores?.length ? `valores ${documentado.valores.join(", ")}` : "",
    documentado.padrao !== undefined ? `padrão ${documentado.padrao}` : ""].filter(Boolean).join(" · ");
  return criar("p", { class: "popup-mensagem" }, [criar("code", { texto: documentado.campo }), partes ? ` ${partes}` : ""]);
}

function blocoDasInconsistencias(inconsistencias) {
  return [
    criar("p", { class: "popup-inconsistencia", texto: AVISO_DE_INCONSISTENCIA }),
    ...inconsistencias.map((item) => criar("div", { class: "popup-regra" }, [
      criar("p", { class: "popup-texto", texto: item.texto }),
      item.fontes?.length ? criar("p", { class: "popup-mensagem", texto: `Fontes: ${item.fontes.join("; ")}` }) : null
    ]))
  ];
}

function blocoDoApoio(apoio) {
  const linhas = (apoio.origens || []).map(blocoDaOrigem);
  if (apoio.tx2?.length) linhas.push(criar("p", { class: "popup-mensagem", texto: `Campos do TX2 lidos pelo script: ${apoio.tx2.join(", ")}.` }));
  if (apoio.datasets?.length) linhas.push(criar("p", { class: "popup-mensagem", texto: `Campos do mapeamento: ${apoio.datasets.join(", ")}.` }));
  if (apoio.linhasScript?.length) linhas.push(criar("p", { class: "popup-mensagem", texto: `Script do Nacional (LoadEnvio.txt), linha(s) ${apoio.linhasScript.join(", ")}.` }));
  if (!linhas.length) return [];
  return [criar("details", { class: "popup-apoio" }, [criar("summary", { texto: "Fontes de apoio (componente e getRps.js)" }), ...linhas])];
}

function blocoDoLeiaute(entrada) {
  const linhas = [];
  const noXml = entrada.plugnotas?.caminhoNoXmlGerado;
  if (noXml) linhas.push(criar("p", { class: "popup-mensagem", texto: `No XML gerado hoje, a tag sai em ${noXml}.` }));
  (entrada.leiauteAnterior || []).forEach((anterior) => linhas.push(criar("p", { class: "popup-mensagem",
    texto: `No anexo VI 1.03, esta informação ficava em ${anterior.caminho.replace("NFSe/infNFSe/", "")} (${anterior.fonte}).` })));
  return linhas;
}

export function secoesDoPlugNotas(entrada) {
  if (!ehDaDps(entrada)) return [criar("h4", { texto: "No PlugNotas" }), criar("p", { class: "popup-vazio", texto: "Tag gerada pelo Nacional na autorização da NFS-e; não vem do JSON." })];
  const plugnotas = entrada.plugnotas;
  const leiaute = blocoDoLeiaute(entrada);
  if (!plugnotas) return leiaute.length ? [criar("h4", { texto: "Leiaute" }), ...leiaute] : [];
  const blocos = [criar("h4", { texto: "No PlugNotas" })];
  if (plugnotas.situacao !== "preenchida") {
    blocos.push(criar("p", { class: "popup-vazio", texto: (TEXTOS_DA_SITUACAO[plugnotas.situacao] || TEXTOS_DA_SITUACAO.semOrigem)(plugnotas) }));
  }
  origens(plugnotas).forEach((origem) => blocos.push(blocoDaOrigem(origem)));
  if (plugnotas.documentacao?.length) {
    blocos.push(criar("h4", { texto: "Na documentação da API" }), ...plugnotas.documentacao.map(blocoDaDocumentacao));
  }
  if (temInconsistencia(plugnotas)) blocos.push(criar("h4", { texto: "Inconsistências" }), ...blocoDasInconsistencias(plugnotas.inconsistencias));
  if (leiaute.length) blocos.push(criar("h4", { texto: "Leiaute" }), ...leiaute);
  if ((plugnotas.inconsistencias || []).some((item) => item.tipo === "divergenciaNasNotas")) {
    blocos.push(criar("p", { class: "popup-nota", texto: "A conferência compara o JSON enviado com o XML. A API pode completar dados do prestador pelo cadastro e calcular valores antes da lib; nesses casos o valor não bate." }));
  }
  blocos.push(...blocoDoApoio(plugnotas.apoio || {}));
  return blocos;
}
