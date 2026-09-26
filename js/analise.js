import { criarContexto } from "./analise/contexto.js";
import { aplicarRegra } from "./analise/regras-declarativas.js";
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

export function analisarEmissao(documento, dados = {}) {
  const contexto = criarContexto(dados);
  const achados = [];
  const notas = Array.isArray(documento) ? documento : [documento];

  notas.forEach((nota, posicaoNota) => {
    const prefixo = notas.length > 1 ? `nota[${posicaoNota}].` : "";
    const registrar = (item) => achados.push({ ...item, campo: `${prefixo}${item.campo}` });

    (dados.regras?.regras || []).forEach((regra) => aplicarRegra(nota, regra).forEach(registrar));
    analisarTextos(nota, registrar);
    analisarNomesDeCampo(nota, dados.regras?.apelidos || {}, contexto, registrar);
    analisarTiposTrocados(nota, registrar);
    analisarDocumentosFiscais(nota, contexto, registrar);
    analisarLeiaute(nota, contexto, registrar);

    const servicos = Array.isArray(nota?.servico) ? nota.servico : nota?.servico ? [nota.servico] : [];
    servicos.forEach((servico, posicao) => {
      const caminho = Array.isArray(nota?.servico) ? `servico[${posicao}]` : "servico";
      analisarValores(servico, caminho, registrar);
      analisarRetencoes(servico, caminho, contexto, registrar);
      analisarIss(servico, caminho, contexto, registrar);
      analisarDescricao(servico, caminho, registrar);
    });

    analisarIbsCbs(nota, contexto, registrar);
  });

  return ordenar(achados);
}

const ordemSeveridade = { erro: 0, alerta: 1, informacao: 2 };

function ordenar(achados) {
  const vistos = new Set();
  return achados
    .filter((item) => {
      const chave = `${item.severidade}|${item.titulo}|${item.campo}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .sort((primeiro, segundo) => ordemSeveridade[primeiro.severidade] - ordemSeveridade[segundo.severidade]
      || primeiro.campo.localeCompare(segundo.campo));
}
