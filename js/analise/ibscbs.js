import { achado, FONTES } from "./achado.js";
import { preenchido } from "./caminhos.js";
import { CHAVES } from "./contexto.js";

function gruposDaNota(nota) {
  const servicos = Array.isArray(nota?.servico)
    ? nota.servico.map((servico, posicao) => [servico, `servico[${posicao}]`])
    : nota?.servico ? [[nota.servico, "servico"]] : [];
  return {
    primeiro: servicos[0]?.[1] || "servico[0]",
    grupos: servicos.filter(([servico]) => servico?.ibscbs).map(([servico, caminho]) => [servico.ibscbs, `${caminho}.ibscbs`])
  };
}

export function analisarIbsCbs(nota, contexto, registrar) {
  const { primeiro, grupos } = gruposDaNota(nota);
  if (nota?.ibscbs) {
    registrar(achado("alerta", "Grupo ibscbs fora do lugar documentado", "ibscbs",
      "A documentação da API do PlugNotas traz o grupo ibscbs dentro de cada serviço (servico[].ibscbs), e é de lá que a lib do Nacional lê o grupo.",
      FONTES.documentacaoApi, [CHAVES.grupoIbsCbs]));
    if (grupos.length === 0) grupos.push([nota.ibscbs, "ibscbs"]);
  }
  if (grupos.length === 0) {
    avisarAusencia(`${primeiro}.ibscbs`, contexto, registrar);
    return;
  }
  grupos.forEach(([grupo, caminho]) => conferirGrupo(grupo, caminho, contexto, registrar));
}

function avisarAusencia(campo, contexto, registrar) {
  const tipo = contexto.porChave.get(CHAVES.tpRetPisCofins);
  const grupoLeiaute = contexto.porChave.get(CHAVES.grupoIbsCbs);
  if (!tipo?.notas && !grupoLeiaute?.notas) return;
  const trechos = [];
  if (tipo?.notas) trechos.push(`Nas notas de tpRetPisCofins, o anexo VI registra: "${tipo.notas.replace(/\s+/g, " ").trim()}"`);
  if (grupoLeiaute?.notas) trechos.push(`Nas notas do grupo IBSCBS: "${grupoLeiaute.notas.replace(/\s+/g, " ").trim()}"`);
  registrar(achado("alerta", "JSON sem o grupo ibscbs", campo, trechos.join(" "),
    "Anexo VI, notas de tpRetPisCofins e do grupo IBSCBS", [CHAVES.grupoIbsCbs, CHAVES.tpRetPisCofins]));
}

function conferirGrupo(grupo, caminho, contexto, registrar) {
  const tributacao = grupo?.valores?.tributacao;
  if (tributacao && typeof tributacao === "object") {
    [["cst", CHAVES.cstIbsCbs], ["cct", CHAVES.cClassTrib]].forEach(([campo, chave]) => {
      const entrada = contexto.porChave.get(chave);
      if (!preenchido(tributacao[campo]) && entrada) {
        registrar(achado("erro", `${entrada.tag} do IBS e da CBS ausente`, `${caminho}.valores.tributacao.${campo}`,
          `No anexo VI, ${entrada.tag} do grupo gIBSCBS tem ocorrência ${entrada.ocorrencia}.`, `Anexo VI, leiaute de ${entrada.tag}`, [chave]));
      }
    });
  }

  const tabelas = contexto.ibscbs;
  const codigoOperacao = preenchido(grupo.codigoOperacao) ? String(grupo.codigoOperacao).replace(/\D/g, "").padStart(6, "0") : "";
  if (codigoOperacao && tabelas && !tabelas.indOp[codigoOperacao]) {
    registrar(achado("alerta", "indOp fora da tabela do anexo VII", `${caminho}.codigoOperacao`,
      `O código ${codigoOperacao} não consta na tabela de indOp do anexo VII.`, FONTES.anexoVII, [CHAVES.cIndOp]));
  }

  const classificacao = preenchido(tributacao?.cct) ? String(tributacao.cct).padStart(6, "0") : "";
  if (codigoOperacao && classificacao && tabelas?.indOp[codigoOperacao]) {
    const existe = tabelas.relacoes.some((relacao) => relacao[4] === codigoOperacao && relacao[6] === classificacao);
    if (!existe) {
      registrar(achado("informacao", "Combinação de indOp e cClassTrib fora da correlação", caminho,
        `A combinação do indOp ${codigoOperacao} com o cClassTrib ${classificacao} não aparece na tabela de correlação do anexo VIII.`,
        FONTES.anexoVIII, [CHAVES.cIndOp, CHAVES.cClassTrib]));
    }
  }

  const destinatario = grupo.destinatario;
  if (destinatario && typeof destinatario === "object" && !preenchido(destinatario.cpfCnpj) && !preenchido(destinatario.codigoEstrangeiro)) {
    registrar(achado("alerta", "Destinatário do IBS e da CBS sem identificação", `${caminho}.destinatario`,
      "No anexo VI, CNPJ, CPF, NIF e cNaoNIF do grupo dest aparecem como elementos de escolha (CE) com ocorrência 1-1.",
      "Anexo VI, leiaute do grupo dest", [CHAVES.destCNPJ, CHAVES.destCPF, CHAVES.destNIF, CHAVES.destNaoNIF]));
  }
}
