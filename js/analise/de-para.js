import { achado, FONTES } from "./achado.js";
import { resolverCaminho, preenchido } from "./caminhos.js";
import { significadoDoCodigo } from "./contexto.js";

const CHAVE_DO_SERVICO = "NFSe/infNFSe/DPS/infDPS/serv";

function chaveDaEntrada(entrada) {
  return entrada.caminho + entrada.tag;
}

function fonteDaDocumentacao(contexto) {
  return contexto.versaoDaDocumentacao ? `${FONTES.documentacaoApi} (${contexto.versaoDaDocumentacao})` : FONTES.documentacaoApi;
}

function fonteDaLib(origem) {
  return `Lib do PlugNotas${origem.linha ? ` (${origem.linha})` : ""}`;
}

function textoDoValor(valor) {
  return typeof valor === "number" ? String(Number(valor)) : String(valor);
}

export function analisarPeloDePara(nota, contexto, registrar) {
  conferirQuantidadeDeServicos(nota, contexto, registrar);
  const comRegraPropria = new Set(contexto.regrasDeclarativas.map((regra) => regra.campo));
  const documentados = new Map();
  contexto.entradasComPlugNotas.forEach((entrada) => {
    const plugnotas = entrada.plugnotas;
    (plugnotas.documentacao || []).forEach((documentado) => {
      if (comRegraPropria.has(documentado.campo)) return;
      const registro = documentados.get(documentado.campo) || { documentado, tags: [] };
      registro.tags.push(chaveDaEntrada(entrada));
      documentados.set(documentado.campo, registro);
    });
    (plugnotas.inconsistencias || []).filter((item) => item.campoDocumentado)
      .forEach((item) => conferirCampoNaoLido(nota, item, entrada, contexto, registrar));
    (plugnotas.origens || []).forEach((origem) => {
      (origem.exigeNumero || []).forEach((campo) => conferirNumeroComoTexto(nota, campo, origem, entrada, registrar));
      conferirConversao(nota, origem, entrada, registrar);
    });
  });
  documentados.forEach(({ documentado, tags }) => conferirDocumentacao(nota, documentado, tags, contexto, registrar));
}

function conferirQuantidadeDeServicos(nota, contexto, registrar) {
  const servicos = Array.isArray(nota?.servico) ? nota.servico : [];
  if (servicos.length < 2) return;
  const grupo = contexto.porChave.get(CHAVE_DO_SERVICO);
  registrar(achado("alerta", "Mais de um serviço na mesma nota", "servico",
    `O JSON tem ${servicos.length} serviços, e o leiaute da DPS traz um único grupo serv (ocorrência ${grupo?.ocorrencia || "0-1"}). Confirme como o PlugNotas junta os serviços na emissão pelo Nacional.`,
    "Anexo VI, grupo serv", grupo ? [CHAVE_DO_SERVICO] : []));
}

function conferirDocumentacao(nota, documentado, tags, contexto, registrar) {
  resolverCaminho(nota, documentado.campo).forEach(({ valor, caminho }) => {
    if (!preenchido(valor) || typeof valor === "object") return;
    const texto = textoDoValor(valor);
    if (documentado.valores?.length && typeof valor !== "boolean" && !documentado.valores.map(String).includes(texto)) {
      registrar(achado("alerta", "Valor fora dos aceitos pela documentação da API", caminho,
        `A documentação da API aceita ${documentado.valores.join(", ")} em ${documentado.campo}. Valor informado: ${texto}.`,
        fonteDaDocumentacao(contexto), tags));
    }
    if (documentado.tamanho && typeof valor === "string" && valor.length > documentado.tamanho) {
      registrar(achado("alerta", "Tamanho acima do aceito pela documentação da API", caminho,
        `A documentação da API aceita até ${documentado.tamanho} caracteres em ${documentado.campo}. O valor tem ${valor.length}.`,
        fonteDaDocumentacao(contexto), tags));
    }
  });
}

function conferirCampoNaoLido(nota, item, entrada, contexto, registrar) {
  if (resolverCaminho(nota, item.campoLido).some(({ valor }) => preenchido(valor))) return;
  resolverCaminho(nota, item.campoDocumentado).forEach(({ valor, caminho }) => {
    if (!preenchido(valor)) return;
    registrar(achado("alerta", "Campo documentado que a lib do Nacional não lê", caminho,
      `A documentação da API descreve ${item.campoDocumentado} para ${entrada.tag}, mas a lib do Nacional lê ${item.campoLido}. Informado só em ${item.campoDocumentado}, o valor pode não chegar ao XML.`,
      [fonteDaDocumentacao(contexto), ...(item.fontes || []).filter((fonte) => fonte.includes(".js"))].join("; "),
      [chaveDaEntrada(entrada)]));
  });
}

function conferirNumeroComoTexto(nota, campo, origem, entrada, registrar) {
  resolverCaminho(nota, campo).forEach(({ valor, caminho }) => {
    if (typeof valor !== "string" || !preenchido(valor)) return;
    registrar(achado("alerta", "Número enviado como texto em campo que a lib só lê como número", caminho,
      `A lib do Nacional só grava ${entrada.tag} quando ${campo} vem como número. Entre aspas, o valor ${valor} é ignorado.`,
      fonteDaLib(origem), [chaveDaEntrada(entrada)]));
  });
}

function conferirConversao(nota, origem, entrada, registrar) {
  if (origem.fonte !== "lib" || origem.campos?.length || origem.tabelas?.length !== 1 || origem.tabelas[0].esquema) return;
  const tabela = origem.tabelas[0];
  resolverCaminho(nota, tabela.json).forEach(({ valor, caminho }) => {
    if (!preenchido(valor) || typeof valor === "boolean" || typeof valor === "object") return;
    const recebido = textoDoValor(valor);
    const gravado = tabela.valores[recebido];
    if (typeof gravado !== "string" || gravado === "" || gravado === recebido || gravado !== tabela.valores.ausente) return;
    const significado = significadoDoCodigo(entrada, gravado);
    registrar(achado("informacao", `Conversão de ${tabela.json.split(".").pop()} para ${entrada.tag}`, caminho,
      `Com ${tabela.json} = ${recebido}, a lib do Nacional grava ${entrada.tag} = ${gravado}${significado ? ` (no anexo VI: "${significado}")` : ""}.`,
      `${fonteDaLib(origem)}, conversão obtida por sondagem da lib`, [chaveDaEntrada(entrada)]));
  });
}
