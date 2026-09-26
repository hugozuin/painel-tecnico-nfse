import { achado, FONTES } from "./achado.js";
import { CHAVES, regraDoAnexo } from "./contexto.js";

export function analisarIss(servico, caminhoServico, contexto, registrar) {
  const iss = servico?.iss;
  if (!iss) {
    registrar(achado("informacao", "Serviço sem o grupo iss", `${caminhoServico}.iss`, "O serviço não tem o grupo iss.", FONTES.estrutura));
    return;
  }
  const aliquota = Number(iss.aliquota || 0);
  const entrada = contexto.porChave.get(CHAVES.pAliq);
  const ligada = entrada?.plugnotas?.json?.includes("servico[].iss.aliquota");

  if (aliquota > 0 && aliquota < 1 && entrada && ligada) {
    registrar(achado("alerta", "Alíquota de ISS possivelmente em fração", `${caminhoServico}.iss.aliquota`,
      `O campo iss.aliquota chega a pAliq, que o anexo VI descreve como "${entrada.titulo}". O valor ${aliquota} nesse campo corresponde a ${aliquota}%.`,
      "Anexo VI (pAliq) e cadeia lib, script e mapeamento", [CHAVES.pAliq]));
  }

  const limite = regraDoAnexo(contexto, CHAVES.pAliq, "E0595");
  if (aliquota > 5 && limite && ligada) {
    registrar(achado("erro", "Alíquota de ISS acima do permitido pelo anexo VI", `${caminhoServico}.iss.aliquota`,
      `Regra E0595: "${limite.regra}" Valor informado: ${aliquota}.`, "Anexo VI, regra E0595 de pAliq", [CHAVES.pAliq]));
  }
}
