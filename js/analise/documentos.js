import { achado, FONTES } from "./achado.js";
import { percorrerValores } from "./caminhos.js";
import { chavesDoJson } from "./contexto.js";

export function documentoValido(numero) {
  const digitos = String(numero || "").replace(/\D/g, "");
  if (digitos.length === 11) return cpfValido(digitos);
  if (digitos.length === 14) return cnpjValido(digitos);
  return false;
}

function cpfValido(cpf) {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calcular = (tamanho) => {
    let soma = 0;
    for (let posicao = 0; posicao < tamanho; posicao++) soma += Number(cpf[posicao]) * (tamanho + 1 - posicao);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calcular(9) === Number(cpf[9]) && calcular(10) === Number(cpf[10]);
}

function cnpjValido(cnpj) {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const calcular = (tamanho) => {
    const pesos = tamanho === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let posicao = 0; posicao < tamanho; posicao++) soma += Number(cnpj[posicao]) * pesos[posicao];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calcular(12) === Number(cnpj[12]) && calcular(13) === Number(cnpj[13]);
}

export function analisarDocumentosFiscais(nota, contexto, registrar) {
  percorrerValores(nota, "", (valor, caminho) => {
    if (!/cpfCnpj$|cnpj$|cpf$|inscricaoFederal$/i.test(caminho)) return;
    const digitos = String(valor).replace(/\D/g, "");
    if (!digitos) return;
    const tags = chavesDoJson(contexto, caminho.replace(/\[\d+\]/g, "[]"));
    if (digitos.length !== 11 && digitos.length !== 14) {
      registrar(achado("erro", "Documento com quantidade de dígitos inválida", caminho,
        `O valor tem ${digitos.length} dígitos. CPF tem 11 e CNPJ tem 14.`, FONTES.digito, tags));
      return;
    }
    if (!documentoValido(digitos)) {
      registrar(achado("erro", "Documento com dígito verificador inválido", caminho,
        "O CPF ou CNPJ informado não confere com os dígitos verificadores.", FONTES.digito, tags));
    }
    if (String(valor) !== digitos) {
      registrar(achado("informacao", "Documento com pontuação", caminho, "O documento foi informado com pontuação.", FONTES.texto, tags));
    }
  });
}
