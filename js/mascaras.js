const DIGITO = "9";
const MASCARA_CPF = "999.999.999-99";
const MASCARA_CNPJ = "99.999.999/9999-99";

const MASCARAS_NOMEADAS = {
  cpf: () => MASCARA_CPF,
  cnpj: () => MASCARA_CNPJ,
  cpfCnpj: (digitos) => (digitos.length > 11 ? MASCARA_CNPJ : MASCARA_CPF)
};

export function mascaraValida(mascara) {
  return typeof mascara === "string" && (mascara in MASCARAS_NOMEADAS || /^9[9./-]*9$/.test(mascara));
}

function padraoDaMascara(mascara, digitos) {
  return MASCARAS_NOMEADAS[mascara]?.(digitos) ?? mascara;
}

export function tamanhoMaximoDaMascara(mascara) {
  return padraoDaMascara(mascara, "9".repeat(14)).length;
}

export function exemploDaMascara(mascara) {
  if (mascara === "cpfCnpj") return "CPF ou CNPJ";
  return padraoDaMascara(mascara, "").replaceAll(DIGITO, "0");
}

export function aplicarMascara(valor, mascara) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  const padrao = padraoDaMascara(mascara, digitos);
  let formatado = "";
  let usados = 0;
  for (const simbolo of padrao) {
    if (usados === digitos.length) break;
    if (simbolo === DIGITO) formatado += digitos[usados++];
    else formatado += simbolo;
  }
  return formatado;
}

export function mascaraCompleta(valor, mascara) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  const esperado = (padrao) => [...padrao].filter((simbolo) => simbolo === DIGITO).length;
  if (mascara === "cpfCnpj") return [esperado(MASCARA_CPF), esperado(MASCARA_CNPJ)].includes(digitos.length);
  return digitos.length === esperado(padraoDaMascara(mascara, digitos));
}

function posicaoDepoisDoDigito(texto, quantidade) {
  if (quantidade === 0) return 0;
  let contados = 0;
  for (let indice = 0; indice < texto.length; indice++) {
    if (/\d/.test(texto[indice]) && ++contados === quantidade) return indice + 1;
  }
  return texto.length;
}

export function ligarMascara(entrada, mascara) {
  entrada.inputMode = "numeric";
  entrada.maxLength = tamanhoMaximoDaMascara(mascara);
  entrada.addEventListener("input", () => {
    const cursor = entrada.selectionStart ?? entrada.value.length;
    const digitosAntesDoCursor = entrada.value.slice(0, cursor).replace(/\D/g, "").length;
    const formatado = aplicarMascara(entrada.value, mascara);
    if (formatado === entrada.value) return;
    entrada.value = formatado;
    const novaPosicao = posicaoDepoisDoDigito(formatado, digitosAntesDoCursor);
    entrada.setSelectionRange?.(novaPosicao, novaPosicao);
  });
}
