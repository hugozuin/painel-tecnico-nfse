import { achado, FONTES } from "./achado.js";
import { percorrerValores } from "./caminhos.js";

export function arredondar(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

export function truncar(valor) {
  return Math.floor((Number(valor) + 1e-9) * 100) / 100;
}

export function analisarValores(servico, caminhoServico, registrar) {
  const valores = servico?.valor || {};
  const bruto = Number(valores.servico || 0);
  const deducoes = Number(valores.deducoes || 0);
  const desconto = Number(valores.descontoIncondicionado || 0);
  if (bruto > 0 && deducoes + desconto > bruto) {
    registrar(achado("alerta", "Deduções e descontos acima do valor do serviço", `${caminhoServico}.valor`,
      `A soma de deduções (${deducoes.toFixed(2)}) e desconto incondicionado (${desconto.toFixed(2)}) passa o valor do serviço (${bruto.toFixed(2)}).`,
      FONTES.calculo));
  }
  percorrerValores(servico?.valor, `${caminhoServico}.valor`, (valor, caminho) => {
    if (Number.isFinite(Number(valor)) && Number(valor) < 0) {
      registrar(achado("alerta", "Valor negativo", caminho, `O valor informado é ${valor}.`, FONTES.calculo));
    }
  });
}
