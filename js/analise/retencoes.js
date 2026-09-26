import { achado, FONTES } from "./achado.js";
import { preenchido } from "./caminhos.js";
import { CHAVES, chavesDoJson, significadoDoCodigo } from "./contexto.js";
import { arredondar, truncar } from "./valores.js";

const TRIBUTOS_RETIDOS = ["pis", "cofins", "csll", "irrf", "inss", "cpp"];
const FONTE_DA_SOMA_EM_VRETCSLL = "Lib do PlugNotas (getRetencaoProps.js), script do Nacional (LoadEnvio.txt) e anexo VI";
const FONTE_DO_TIPO_DE_RETENCAO = "Lib do PlugNotas (getRetencaoProps.js) e anexo VI (tpRetPisCofins)";

export function derivarTipoRetencao(retencao) {
  const retido = (grupo) => Number(retencao?.[grupo]?.valor || 0) > 0;
  const pis = retido("pis");
  const cofins = retido("cofins");
  const csll = retido("csll");
  if (pis && cofins && csll) return "3";
  if (pis && cofins && !csll) return "4";
  if (pis && !cofins && !csll) return "5";
  if (!pis && cofins && !csll) return "6";
  if (!pis && cofins && csll) return "7";
  if (!pis && !cofins && csll) return "8";
  if (pis && !cofins && csll) return "9";
  return "0";
}

export function analisarRetencoes(servico, caminhoServico, contexto, registrar) {
  const retencao = servico?.retencao;
  if (!retencao) return;
  const baseServico = Number(servico?.valor?.servico || 0);
  TRIBUTOS_RETIDOS.forEach((tributo) => conferirValorDoTributo(retencao, tributo, baseServico, caminhoServico, contexto, registrar));
  conferirSomaEmVRetCSLL(retencao, caminhoServico, contexto, registrar);
  conferirTipoDeRetencao(retencao, caminhoServico, contexto, registrar);
  conferirApuracaoPropria(servico, caminhoServico, registrar);
}

function conferirValorDoTributo(retencao, tributo, baseServico, caminhoServico, contexto, registrar) {
  const grupo = retencao[tributo];
  if (!grupo) return;
  const aliquota = Number(grupo.aliquota || 0);
  const valorInformado = Number(grupo.valor || 0);
  const base = Number(grupo.baseCalculo || retencao.baseCalculo || baseServico || 0);
  const tags = chavesDoJson(contexto, `servico[].retencao.${tributo}.valor`);
  const nome = tributo.toUpperCase();

  if (aliquota > 0 && valorInformado === 0) {
    registrar(achado("alerta", `Alíquota de ${nome} sem valor`, `${caminhoServico}.retencao.${tributo}`,
      "A alíquota foi informada e o valor ficou zerado.", FONTES.calculo, tags));
    return;
  }
  if (aliquota === 0 || base === 0 || valorInformado === 0) return;
  const campo = `${caminhoServico}.retencao.${tributo}.valor`;
  conferirArredondamento({ base, aliquota, valorInformado, nome, campo, tags }, registrar);
}

function conferirArredondamento({ base, aliquota, valorInformado, nome, campo, tags }, registrar) {
  const esperado = (base * aliquota) / 100;
  const comArredondamento = arredondar(esperado);
  const comTruncamento = truncar(esperado);
  const informado = arredondar(valorInformado);
  const conta = `Base ${base.toFixed(2)} vezes ${aliquota}% resulta em ${esperado.toFixed(4)}.`;

  if (Math.abs(informado - comArredondamento) < 0.005 && comArredondamento !== comTruncamento) {
    registrar(achado("informacao", `${nome} calculado com arredondamento`, campo,
      `${conta} O valor enviado usa arredondamento (${comArredondamento.toFixed(2)}). Com truncamento seria ${comTruncamento.toFixed(2)}.`, FONTES.calculo, tags));
  } else if (Math.abs(informado - comTruncamento) < 0.005 && comArredondamento !== comTruncamento) {
    registrar(achado("informacao", `${nome} calculado com truncamento`, campo,
      `${conta} O valor enviado usa truncamento (${comTruncamento.toFixed(2)}). Com arredondamento seria ${comArredondamento.toFixed(2)}.`, FONTES.calculo, tags));
  } else if (Math.abs(informado - comArredondamento) >= 0.005 && Math.abs(informado - comTruncamento) >= 0.005) {
    registrar(achado("erro", `Valor de ${nome} diferente da alíquota`, campo,
      `${conta} Arredondado daria ${comArredondamento.toFixed(2)} e truncado ${comTruncamento.toFixed(2)}, mas foi enviado ${informado.toFixed(2)}.`, FONTES.calculo, tags));
  }
}

function valorRetido(retencao, tributo) {
  return Number(retencao[tributo]?.valor || 0);
}

function conferirSomaEmVRetCSLL(retencao, caminhoServico, contexto, registrar) {
  const temPisOuCofins = valorRetido(retencao, "pis") > 0 || valorRetido(retencao, "cofins") > 0;
  if (!(valorRetido(retencao, "csll") > 0 && temPisOuCofins)) return;
  const soma = arredondar(valorRetido(retencao, "pis") + valorRetido(retencao, "cofins") + valorRetido(retencao, "csll"));
  const entrada = contexto.porChave.get(CHAVES.vRetCSLL);
  const descricao = entrada?.descricao ? `, que o anexo VI descreve como "${entrada.descricao.replace(/\s+/g, " ").trim()}"` : "";
  registrar(achado("informacao", "Soma das contribuições em vRetCSLL no esquema RTC007", `${caminhoServico}.retencao.csll.valor`,
    `Se a conta usa o esquema RTC007, a lib envia em ValorCSLL a soma de PIS, COFINS e CSLL retidos, e o script do Nacional grava esse campo em vRetCSLL${descricao}. Aqui a soma daria ${soma.toFixed(2)}.`,
    FONTE_DA_SOMA_EM_VRETCSLL, [CHAVES.vRetCSLL]));
}

function conferirTipoDeRetencao(retencao, caminhoServico, contexto, registrar) {
  const derivado = derivarTipoRetencao(retencao);
  const informado = retencao.tipoRetencaoPisCofinsCSLL;
  const significado = significadoDoCodigo(contexto.porChave.get(CHAVES.tpRetPisCofins), derivado);
  const explicacao = significado ? ` No anexo VI: "${significado}".` : "";

  if (preenchido(informado) && String(informado) !== derivado) {
    registrar(achado("alerta", "tipoRetencaoPisCofinsCSLL diferente dos valores retidos", `${caminhoServico}.retencao.tipoRetencaoPisCofinsCSLL`,
      `Pelos valores retidos o código seria ${derivado}.${explicacao} O JSON informa ${informado}, e a lib usa o valor informado quando ele existe.`,
      FONTE_DO_TIPO_DE_RETENCAO, [CHAVES.tpRetPisCofins]));
  }
  if (!preenchido(informado) && derivado !== "0") {
    registrar(achado("informacao", "tpRetPisCofins calculado pela lib no esquema RTC007", `${caminhoServico}.retencao`,
      `O campo tipoRetencaoPisCofinsCSLL não foi informado. Se a conta usa o esquema RTC007, a lib calcula o código pelos valores retidos: aqui daria ${derivado}.${explicacao} Fora do RTC007 a lib não envia o campo.`,
      FONTE_DO_TIPO_DE_RETENCAO, [CHAVES.tpRetPisCofins]));
  }
}

function conferirApuracaoPropria(servico, caminhoServico, registrar) {
  const retencao = servico.retencao;
  if (!(servico.apuracaoPropria && (valorRetido(retencao, "pis") > 0 || valorRetido(retencao, "cofins") > 0))) return;
  registrar(achado("informacao", "Apuração própria junto com retenção", `${caminhoServico}.apuracaoPropria`,
    "Se a conta usa o esquema RTC007, a lib monta os campos de PIS e COFINS a partir de apuracaoPropria, e não de retencao.", FONTES.retencaoLib));
}
