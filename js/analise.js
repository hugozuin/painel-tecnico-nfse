import { criarContexto } from "./analise/contexto.js";
import { aplicarRegrasDeclarativas } from "./analise/regras-declarativas.js";
import { analisarTextos, analisarDescricao } from "./analise/texto.js";
import { analisarNomesDeCampo, analisarTiposTrocados } from "./analise/campos.js";
import { analisarDocumentosFiscais } from "./analise/documentos.js";
import { analisarLeiaute } from "./analise/leiaute.js";
import { analisarValores } from "./analise/valores.js";
import { analisarRetencoes } from "./analise/retencoes.js";
import { analisarIss } from "./analise/iss.js";
import { analisarIbsCbs } from "./analise/ibscbs.js";

export { CHAVES, significadoDoCodigo } from "./analise/contexto.js";
export { percorrerValores, resolverCaminho } from "./analise/caminhos.js";
export { documentoValido } from "./analise/documentos.js";
export { arredondar, truncar } from "./analise/valores.js";
export { derivarTipoRetencao } from "./analise/retencoes.js";

const CONFERENCIAS_DA_NOTA = [
  aplicarRegrasDeclarativas, analisarTextos, analisarNomesDeCampo, analisarTiposTrocados, analisarDocumentosFiscais, analisarLeiaute
];
const CONFERENCIAS_DO_SERVICO = [analisarValores, analisarRetencoes, analisarIss, analisarDescricao];
const ORDEM_DA_SEVERIDADE = { erro: 0, alerta: 1, informacao: 2 };

export function analisarEmissao(documento, dados = {}) {
  const contexto = criarContexto(dados);
  const achados = [];
  const notas = Array.isArray(documento) ? documento : [documento];
  notas.forEach((nota, posicaoNota) => {
    const prefixo = notas.length > 1 ? `nota[${posicaoNota}].` : "";
    const registrar = (item) => achados.push({ ...item, campo: `${prefixo}${item.campo}` });
    CONFERENCIAS_DA_NOTA.forEach((conferir) => conferir(nota, contexto, registrar));
    servicosDaNota(nota).forEach(({ servico, caminho }) => {
      CONFERENCIAS_DO_SERVICO.forEach((conferir) => conferir(servico, caminho, contexto, registrar));
    });
    analisarIbsCbs(nota, contexto, registrar);
  });
  return ordenarSemRepetir(achados);
}

function servicosDaNota(nota) {
  if (Array.isArray(nota?.servico)) return nota.servico.map((servico, posicao) => ({ servico, caminho: `servico[${posicao}]` }));
  return nota?.servico ? [{ servico: nota.servico, caminho: "servico" }] : [];
}

function ordenarSemRepetir(achados) {
  const vistos = new Set();
  return achados
    .filter((item) => {
      const chave = `${item.severidade}|${item.titulo}|${item.campo}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .sort((primeiro, segundo) => ORDEM_DA_SEVERIDADE[primeiro.severidade] - ORDEM_DA_SEVERIDADE[segundo.severidade]
      || primeiro.campo.localeCompare(segundo.campo));
}
