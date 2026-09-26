import { achado, FONTES } from "./achado.js";
import { preenchido } from "./caminhos.js";
import { CHAVES } from "./contexto.js";

export function analisarIbsCbs(nota, contexto, registrar) {
  const grupo = nota?.ibscbs;
  const tipo = contexto.porChave.get(CHAVES.tpRetPisCofins);
  const grupoLeiaute = contexto.porChave.get(CHAVES.grupoIbsCbs);

  if (!grupo) {
    if (!tipo?.notas && !grupoLeiaute?.notas) return;
    const trechos = [];
    if (tipo?.notas) trechos.push(`Nas notas de tpRetPisCofins, o anexo VI registra: "${tipo.notas.replace(/\s+/g, " ").trim()}"`);
    if (grupoLeiaute?.notas) trechos.push(`Nas notas do grupo IBSCBS: "${grupoLeiaute.notas.replace(/\s+/g, " ").trim()}"`);
    registrar(achado("alerta", "JSON sem o grupo ibscbs", "ibscbs", trechos.join(" "),
      "Anexo VI, notas de tpRetPisCofins e do grupo IBSCBS", [CHAVES.grupoIbsCbs, CHAVES.tpRetPisCofins]));
    return;
  }

  const tributacao = grupo?.valores?.tributacao;
  if (tributacao && typeof tributacao === "object") {
    [["cst", CHAVES.cstIbsCbs], ["cct", CHAVES.cClassTrib]].forEach(([campo, chave]) => {
      const entrada = contexto.porChave.get(chave);
      if (!preenchido(tributacao[campo]) && entrada) {
        registrar(achado("erro", `${entrada.tag} do IBS e da CBS ausente`, `ibscbs.valores.tributacao.${campo}`,
          `No anexo VI, ${entrada.tag} do grupo gIBSCBS tem ocorrência ${entrada.ocorrencia}.`, `Anexo VI, leiaute de ${entrada.tag}`, [chave]));
      }
    });
  }

  const tabelas = contexto.ibscbs;
  const codigoOperacao = preenchido(grupo.codigoOperacao) ? String(grupo.codigoOperacao).replace(/\D/g, "").padStart(6, "0") : "";
  if (codigoOperacao && tabelas && !tabelas.indOp[codigoOperacao]) {
    registrar(achado("alerta", "indOp fora da tabela do anexo VII", "ibscbs.codigoOperacao",
      `O código ${codigoOperacao} não consta na tabela de indOp do anexo VII.`, FONTES.anexoVII, [CHAVES.cIndOp]));
  }

  const classificacao = preenchido(tributacao?.cct) ? String(tributacao.cct).padStart(6, "0") : "";
  if (codigoOperacao && classificacao && tabelas?.indOp[codigoOperacao]) {
    const existe = tabelas.relacoes.some((relacao) => relacao[4] === codigoOperacao && relacao[6] === classificacao);
    if (!existe) {
      registrar(achado("informacao", "Combinação de indOp e cClassTrib fora da correlação", "ibscbs",
        `A combinação do indOp ${codigoOperacao} com o cClassTrib ${classificacao} não aparece na tabela de correlação do anexo VIII.`,
        FONTES.anexoVIII, [CHAVES.cIndOp, CHAVES.cClassTrib]));
    }
  }

  const destinatario = grupo.destinatario;
  if (destinatario && typeof destinatario === "object" && !preenchido(destinatario.cpfCnpj) && !preenchido(destinatario.codigoEstrangeiro)) {
    registrar(achado("alerta", "Destinatário do IBS e da CBS sem identificação", "ibscbs.destinatario",
      "No anexo VI, CNPJ, CPF, NIF e cNaoNIF do grupo dest aparecem como elementos de escolha (CE) com ocorrência 1-1.",
      "Anexo VI, leiaute do grupo dest", [CHAVES.destCNPJ, CHAVES.destCPF, CHAVES.destNIF, CHAVES.destNaoNIF]));
  }
}
