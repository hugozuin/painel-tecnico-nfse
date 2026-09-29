const { formatRounding } = require("../utils");
const { dateTimeZoneUtils } = require("../dateTimeZoneUtils");

const getServicoProps = (servico, { versaoEsquema } = {}) => {
  const esquemaNovo = versaoEsquema === "RTC007";
  const retido = servico.retido || {};
  return {
    CodigoServico: servico.codigo,
    ValorServico: formatRounding(servico.valor?.servico),
    DataServico: servico.data ? dateTimeZoneUtils.formatDate({ date: servico.data, tz: -3, format: "YYYY-MM-DD" }) : "",
    ValorImposto: esquemaNovo ? formatRounding(servico.proprio?.valor) : formatRounding(retido.valor),
    AliquotaImposto: retido.valor > 0 ? retido.aliquota : "",
    Retido: retido.ativo ? 2 : 1,
    SomaRetida: esquemaNovo ? formatRounding((retido.a || 0) + (retido.b || 0)) : "",
    ModoServico: typeof servico.modo === "number" ? servico.modo : ""
  };
};

module.exports = { getServicoProps };
