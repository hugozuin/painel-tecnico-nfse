import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import zlib from "node:zlib";

const soDigitos = (valor) => valor.replace(/\D/g, "");
const semSeparadores = (valor) => valor.replace(/[./\- ]/g, "").toUpperCase();

const digitoVerificador = (caracteres, pesos) => {
  const resto = [...caracteres].reduce((soma, caractere, indice) => soma + (caractere.charCodeAt(0) - 48) * pesos[indice], 0) % 11;
  return resto < 2 ? 0 : 11 - resto;
};

export function cnpjValido(valor) {
  const cnpj = semSeparadores(valor);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(.)\1+$/.test(cnpj)) return false;
  const primeiro = digitoVerificador(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoVerificador(cnpj.slice(0, 12) + primeiro, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${primeiro}${segundo}`);
}

export function cpfValido(valor) {
  const digitos = soDigitos(valor);
  if (digitos.length !== 11 || /^(\d)\1+$/.test(digitos)) return false;
  const primeiro = digitoVerificador(digitos.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoVerificador(digitos.slice(0, 9) + primeiro, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digitos.endsWith(`${primeiro}${segundo}`);
}

const CRESCENTE = "0123456789".repeat(6);
const DECRESCENTE = "9876543210".repeat(6);
const sequenciaTrivial = (digitos) => /^(\d)\1+$/.test(digitos) || CRESCENTE.includes(digitos) || DECRESCENTE.includes(digitos);

const entropia = (texto) => {
  const frequencias = {};
  for (const caractere of texto) frequencias[caractere] = (frequencias[caractere] || 0) + 1;
  return Object.values(frequencias).reduce((total, quantidade) => {
    const proporcao = quantidade / texto.length;
    return total - proporcao * Math.log2(proporcao);
  }, 0);
};

const temLetraEDigito = (valor) => /\d/.test(valor) && /[a-z]/i.test(valor);
const pareceCaminho = (valor) => valor.includes("/") && valor.split("/").filter(Boolean).every((trecho) => /^[A-Za-z][A-Za-z0-9]*$/.test(trecho) || /^\d+$/.test(trecho));
const DOMINIOS_DE_EXEMPLO = /@(?:exemplo\.com\.br|example\.(?:com|org|net)|[a-z0-9.-]+\.(?:invalid|example|test))$/i;

const PADROES = [
  { nome: "ID do Mongo", expressao: /(?<![0-9A-Za-z])[0-9a-f]{24}(?![0-9A-Za-z])/gi, confirma: temLetraEDigito },
  { nome: "UUID", expressao: /(?<![0-9A-Za-z])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9A-Za-z])/gi },
  { nome: "chave de acesso de 44 dígitos", expressao: /(?<!\d)\d{44}(?!\d)/g, confirma: (valor) => !sequenciaTrivial(valor) },
  { nome: "chave de acesso com separadores", expressao: /(?<!\d)(?:\d{4}[ .-]){10}\d{4}(?!\d)/g, confirma: (valor) => !sequenciaTrivial(soDigitos(valor)) },
  { nome: "chave da NFS-e de 50 dígitos", expressao: /(?<!\d)\d{50}(?!\d)/g, confirma: (valor) => !sequenciaTrivial(valor) },
  { nome: "sequência de 15 ou mais dígitos", expressao: /(?<!\d)\d{15,}(?!\d)/g, confirma: (valor) => ![44, 50].includes(valor.length) && !sequenciaTrivial(valor) },
  { nome: "CNPJ", expressao: /(?<!\d)\d{14}(?!\d)/g, confirma: cnpjValido },
  { nome: "CNPJ formatado", expressao: /(?<!\d)\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}(?!\d)/g, confirma: cnpjValido },
  {
    nome: "CNPJ alfanumérico ou com separadores parciais",
    expressao: /(?<![0-9A-Za-z])[0-9A-Z]{2}[. ]?[0-9A-Z]{3}[. ]?[0-9A-Z]{3}[/ ]?[0-9A-Z]{4}[- ]?\d{2}(?![0-9A-Za-z])/g,
    confirma: (valor) => cnpjValido(valor) && !/^\d{14}$/.test(valor) && !/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(valor)
  },
  { nome: "CPF", expressao: /(?<!\d)\d{11}(?!\d)/g, confirma: cpfValido },
  { nome: "CPF formatado", expressao: /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g, confirma: cpfValido },
  { nome: "JWT", expressao: /eyJ[A-Za-z0-9_-]{4,}\.eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g },
  { nome: "token Bearer", expressao: /\bBearer\s+[A-Za-z0-9\-._~+/]{16,}=*/g },
  { nome: "x-api-key com valor", expressao: /x-api-key["'`]?\s*[:=]\s*(?:["'`][^"'`\s$]{8,}["'`]|(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{16,})/gi },
  { nome: "token de serviço", expressao: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9_-]{20,}|mongodb(?:\+srv)?:\/\/[^\s"'`]+|postgres(?:ql)?:\/\/[^\s"'`]+)/g },
  { nome: "hexadecimal longo", expressao: /(?<![0-9A-Za-z])[0-9a-f]{32,}(?![0-9A-Za-z])/gi, confirma: temLetraEDigito },
  {
    nome: "base64 longo",
    expressao: /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{32,}={0,2}/g,
    confirma: (valor) => /\d/.test(valor) && /[A-Z]/.test(valor) && /[a-z]/.test(valor) && entropia(valor) >= 4 && !/^[0-9a-f-]+$/i.test(valor) && !pareceCaminho(valor)
  },
  { nome: "segredo atribuído", expressao: /\b(?:senha|password|passwd|secret|segredo|token|api_?key|x-api-key)\b["'`]?\s*[:=]\s*["'`](?![^"'`]*\$\{)(?=[^"'`]*\d)(?=[^"'`]*[A-Za-z])[^"'`\s]{8,}["'`]/gi },
  {
    nome: "e-mail",
    expressao: /(?<![A-Za-z0-9._%+-])(?<!\/\/(?:[A-Za-z0-9._%+-]*:)?)[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    confirma: (valor) => !DOMINIOS_DE_EXEMPLO.test(valor)
  }
];

const CHAVE_PRIVADA_COMPLETA = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----\s*(?:\\n|\s)*[A-Za-z0-9+/=]{40,}/g;

export const PERMITIDOS = new Map([
  ["29062609000177", "CNPJ de exemplo da especificação oficial do PlugNotas (docs.plugnotas.com.br/api.json)"],
  ["12345678000195", "CNPJ de exemplo da especificação oficial do PlugNotas e titular dos certificados de teste"],
  ["12345678909", "CPF de exemplo do artigo Cadastro de Pessoas Físicas da Wikipédia"]
]);

export function mascarar(valor) {
  if (valor.length <= 8) return `${valor[0]}${"*".repeat(Math.max(0, valor.length - 2))}${valor.at(-1)}`;
  const ponta = valor.length >= 20 ? 4 : 3;
  return `${valor.slice(0, ponta)}${"*".repeat(valor.length - ponta * 2)}${valor.slice(-ponta)}`;
}

const normalizar = (valor) => {
  if (/^[\d ./-]+$/.test(valor)) return soDigitos(valor);
  if (/^[0-9A-Z .\/-]+$/.test(valor) && /^[0-9A-Z]{12}\d{2}$/.test(semSeparadores(valor))) return semSeparadores(valor);
  return valor;
};

export function acharDadosSensiveis(texto, permitidosExtras = new Map()) {
  const permitido = (valor) => PERMITIDOS.has(normalizar(valor)) || permitidosExtras.has(normalizar(valor));
  const achados = [];
  texto.split(/\r?\n/).forEach((linhaOriginal, indice) => {
    const linha = linhaOriginal.replace(/\\[nrtbfv]/g, "  ");
    for (const { nome, expressao, confirma } of PADROES) {
      for (const encontrado of linha.matchAll(expressao)) {
        const valor = encontrado[0];
        if ((confirma && !confirma(valor)) || permitido(valor)) continue;
        achados.push({ linha: indice + 1, coluna: encontrado.index + 1, padrao: nome, valor: mascarar(valor) });
      }
    }
  });
  for (const encontrado of texto.matchAll(CHAVE_PRIVADA_COMPLETA)) {
    achados.push({ linha: texto.slice(0, encontrado.index).split("\n").length, coluna: 1, padrao: "chave privada PEM", valor: "-----BEGIN…" });
  }
  return achados;
}

function decodificarAscii85(texto) {
  const conteudo = texto.replace(/\s+/g, "").replace(/^<~/, "").replace(/~>.*$/, "");
  const bytes = [];
  let grupo = [];
  const despejar = (quantidade) => {
    const valor = grupo.reduce((total, digito) => total * 85 + digito, 0);
    bytes.push(...[24, 16, 8, 0].map((deslocamento) => Math.floor(valor / 2 ** deslocamento) % 256).slice(0, quantidade));
  };
  for (const caractere of conteudo) {
    if (caractere === "z" && grupo.length === 0) {
      bytes.push(0, 0, 0, 0);
      continue;
    }
    grupo.push(caractere.charCodeAt(0) - 33);
    if (grupo.length === 5) {
      despejar(4);
      grupo = [];
    }
  }
  if (grupo.length) {
    const quantidade = grupo.length - 1;
    while (grupo.length < 5) grupo.push(84);
    despejar(quantidade);
  }
  return Buffer.from(bytes);
}

export function textosDoConteudo(conteudo) {
  const linhas = [];
  let atual = "";
  let posicao = 0;
  while (posicao < conteudo.length) {
    if (conteudo[posicao] === "(") {
      let profundidade = 1;
      posicao++;
      while (posicao < conteudo.length && profundidade > 0) {
        const caractere = conteudo[posicao];
        if (caractere === "\\") {
          const escapado = conteudo.slice(posicao + 1, posicao + 4).match(/^[0-7]{1,3}/)?.[0];
          atual += escapado ? String.fromCharCode(parseInt(escapado, 8)) : ({ n: "\n", r: "\r", t: "\t" }[conteudo[posicao + 1]] ?? conteudo[posicao + 1]);
          posicao += escapado ? escapado.length + 1 : 2;
          continue;
        }
        if (caractere === "(") profundidade++;
        if (caractere === ")") profundidade--;
        if (profundidade > 0) atual += caractere;
        posicao++;
      }
      continue;
    }
    if (/^(?:(?:Td|TD|Tm|ET)\b|T\*)/.test(conteudo.slice(posicao, posicao + 3)) && atual) {
      linhas.push(atual);
      atual = "";
    }
    posicao++;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export function extrairTextoPdf(caminho) {
  const bruto = readFileSync(caminho).toString("latin1");
  const linhas = [];
  let fluxos = 0;
  for (const [, dicionario, dados] of bruto.matchAll(/<<((?:(?!>>\s*stream)[\s\S])*?)>>\s*stream\r?\n([\s\S]*?)(?:\r?\n)?endstream/g)) {
    const filtro = dicionario.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/)?.[1] || "";
    if (/DCTDecode|JPXDecode|CCITT|LZW|RunLength|ASCIIHex/.test(filtro)) continue;
    let conteudo = Buffer.from(dados, "latin1");
    if (/ASCII85Decode/.test(filtro)) conteudo = decodificarAscii85(conteudo.toString("latin1"));
    if (/FlateDecode/.test(filtro)) conteudo = zlib.inflateSync(conteudo);
    fluxos++;
    linhas.push(...textosDoConteudo(conteudo.toString("latin1")));
  }
  return { texto: linhas.join("\n"), fluxos };
}

const ARQUIVOS_DE_CHAVE = /\.(?:pfx|p12|key|pem)$/i;
const FORA_DO_ESCOPO = [
  /^assets\/vendor\/forge-[\d.]+\.min\.js$/,
  /(?:^|\/)package-lock\.json$/,
  /\.(?:pdf|pfx|p12|xlsx|png|jpg|jpeg|gif|ico|woff2?|pyc)$/i
];

export function arquivosDoRepositorio() {
  const saida = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return [...new Set(saida.split("\n").map((linha) => linha.trim()).filter(Boolean))].filter(existsSync);
}

export function arquivosDoEscopo(arquivos = arquivosDoRepositorio()) {
  return arquivos.filter((arquivo) => !FORA_DO_ESCOPO.some((expressao) => expressao.test(arquivo)));
}

export function arquivosDeChave(arquivos = arquivosDoRepositorio()) {
  return arquivos.filter((arquivo) => ARQUIVOS_DE_CHAVE.test(arquivo));
}

export function varrerSigilo(permitidosExtras = new Map()) {
  const arquivos = arquivosDoEscopo();
  const achados = arquivos.flatMap((arquivo) =>
    acharDadosSensiveis(readFileSync(arquivo, "utf8"), permitidosExtras).map((achado) => ({ arquivo, ...achado })));
  const manual = existsSync("documentacao.pdf") ? extrairTextoPdf("documentacao.pdf") : { texto: "", fluxos: 0 };
  achados.push(...acharDadosSensiveis(manual.texto, permitidosExtras).map((achado) => ({ arquivo: "documentacao.pdf (texto)", ...achado })));
  return { arquivos, manual, achados };
}
