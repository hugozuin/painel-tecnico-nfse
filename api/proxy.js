import https from "node:https";

export const DOMINIOS_LIBERADOS = [
  "adn.nfse.gov.br",
  "adn.producaorestrita.nfse.gov.br",
  "sefin.nfse.gov.br",
  "sefin.producaorestrita.nfse.gov.br"
];

const TEMPO_LIMITE_MS = 30000;
const LIMITE_CORPO_BYTES = 64 * 1024;
const LIMITE_RESPOSTA_BYTES = 4 * 1024 * 1024;
const MAXIMO_CERTIFICADOS_NA_CADEIA = 10;

const LINHAS_BASE64 = "(?:[A-Za-z0-9+/=]{1,76}\\r?\\n)+";
const PEM_CHAVE = new RegExp(`^-----BEGIN ((?:RSA |EC )?)PRIVATE KEY-----\\r?\\n${LINHAS_BASE64}-----END \\1PRIVATE KEY-----(?:\\r?\\n)?$`);
const PEM_CADEIA = new RegExp(`^(?:-----BEGIN CERTIFICATE-----\\r?\\n${LINHAS_BASE64}-----END CERTIFICATE-----(?:\\r?\\n)?){1,${MAXIMO_CERTIFICADOS_NA_CADEIA}}$`);

const CABECALHOS_DO_REPASSE = {
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store"
};

const TIPOS_QUE_O_NAVEGADOR_EXECUTA = /^\s*(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)\s*(?:;|$)/i;

export function cabecalhosDaResposta(tipo = "") {
  return TIPOS_QUE_O_NAVEGADOR_EXECUTA.test(tipo)
    ? { ...CABECALHOS_DO_REPASSE, "Content-Disposition": "attachment" }
    : { ...CABECALHOS_DO_REPASSE };
}

function aplicarCabecalhos(resposta, tipo) {
  Object.entries(cabecalhosDaResposta(tipo)).forEach(([nome, valor]) => resposta.setHeader(nome, valor));
}

function erroComCodigo(mensagem, codigo) {
  const erro = new Error(mensagem);
  erro.code = codigo;
  return erro;
}

export function consultarNacional(endereco, certificado) {
  return new Promise((resolve, reject) => {
    let pedido = null;
    let prazo = null;
    let encerrado = false;
    const encerrar = (erro, retorno) => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(prazo);
      if (erro) {
        pedido?.destroy();
        reject(erro);
      } else {
        resolve(retorno);
      }
    };

    const opcoes = {
      method: "GET",
      headers: { Accept: "application/json, application/xml, application/pdf, */*" }
    };
    if (certificado) {
      opcoes.key = certificado.chave;
      opcoes.cert = certificado.certificado;
    }
    pedido = https.request(endereco, opcoes, (resposta) => {
      const partes = [];
      let recebidos = 0;
      resposta.on("data", (parte) => {
        recebidos += parte.length;
        if (recebidos > LIMITE_RESPOSTA_BYTES) {
          encerrar(erroComCodigo(`Resposta do Nacional acima de ${LIMITE_RESPOSTA_BYTES / 1024 / 1024} MB`, "ERESPOSTAGRANDE"));
          return;
        }
        partes.push(parte);
      });
      resposta.on("end", () => encerrar(null, {
        status: resposta.statusCode,
        tipo: resposta.headers["content-type"] || "application/octet-stream",
        corpo: Buffer.concat(partes)
      }));
      resposta.on("error", encerrar);
    });
    prazo = setTimeout(() => encerrar(erroComCodigo(`Tempo limite de ${TEMPO_LIMITE_MS / 1000}s excedido`, "ETIMEDOUT")), TEMPO_LIMITE_MS);
    pedido.on("error", encerrar);
    pedido.end();
  });
}

export function dicaDoErro(erro, comCertificado) {
  const texto = `${erro?.code || ""} ${erro?.message || ""}`;
  if (/ERESPOSTAGRANDE/.test(texto)) return "O Nacional devolveu um arquivo maior do que o repasse consegue entregar.";
  if (/ETIMEDOUT/.test(texto)) return "O Nacional não respondeu dentro do tempo limite.";
  if (/ENOTFOUND|EAI_AGAIN/.test(texto)) return "O endereço do Nacional não foi encontrado.";
  if (/UNABLE_TO_GET_ISSUER|SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF|CERT_HAS_EXPIRED|CERT_NOT_YET_VALID/.test(texto)) {
    return "A conexão não reconheceu o certificado do servidor do Nacional.";
  }
  if (/KEY_VALUES_MISMATCH|bad decrypt|no start line|PEM|DECODER|ASN1/i.test(texto)) {
    return "A chave e o certificado enviados não formam um par válido. Carregue o certificado de novo.";
  }
  if (/ECONNRESET|socket hang up|ALERT|handshake|EPROTO/i.test(texto)) {
    return comCertificado
      ? "O servidor encerrou a conexão TLS mesmo com o certificado enviado. Confira se ele é ICP-Brasil e está dentro da validade."
      : "O servidor encerrou a conexão TLS. Se a consulta exige certificado digital, carregue um certificado A1 na tela.";
  }
  return "";
}

export function problemaNoCertificado({ chave, certificado }) {
  if (!PEM_CHAVE.test(chave)) return "Chave privada fora do formato PEM esperado. Carregue o certificado de novo.";
  if (!PEM_CADEIA.test(certificado)) return "Cadeia de certificados fora do formato PEM esperado. Carregue o certificado de novo.";
  return "";
}

function tamanhoDoCorpo(bruto) {
  if (bruto === undefined || bruto === null) return 0;
  if (typeof bruto === "string" || Buffer.isBuffer(bruto)) return Buffer.byteLength(bruto);
  return Buffer.byteLength(JSON.stringify(bruto));
}

function interpretarCorpo(bruto) {
  if (typeof bruto === "string" || Buffer.isBuffer(bruto)) return JSON.parse(String(bruto) || "{}");
  return bruto ?? {};
}

function lerConsultaGet(requisicao) {
  const destino = requisicao.query?.url || new URL(requisicao.url, "http://local").searchParams.get("url") || "";
  if (typeof destino !== "string") return { status: 400, erro: "Informe uma única URL do Nacional" };
  return { destino, certificado: null };
}

function lerConsultaPost(requisicao) {
  const corpoGrande = { status: 413, erro: `Corpo da requisição acima de ${LIMITE_CORPO_BYTES / 1024} KB` };
  if (Number(requisicao.headers?.["content-length"]) > LIMITE_CORPO_BYTES) return corpoGrande;

  let corpo;
  try {
    const bruto = requisicao.body;
    if (tamanhoDoCorpo(bruto) > LIMITE_CORPO_BYTES) return corpoGrande;
    corpo = interpretarCorpo(bruto);
  } catch {
    return { status: 400, erro: "Corpo da requisição não é um JSON válido" };
  }

  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { status: 400, erro: "Corpo da requisição deve ser um objeto JSON" };
  if (corpo.url !== undefined && typeof corpo.url !== "string") return { status: 400, erro: "Informe uma única URL do Nacional" };
  if (!corpo.certificado) return { destino: corpo.url || "", certificado: null };

  const { chave, certificado } = corpo.certificado;
  if (typeof chave !== "string" || typeof certificado !== "string") {
    return { status: 400, erro: "Certificado incompleto: envie chave e certificado em PEM" };
  }
  return { destino: corpo.url || "", certificado: { chave, certificado } };
}

function lerConsulta(requisicao) {
  if (requisicao.method === "GET") return lerConsultaGet(requisicao);
  if (requisicao.method === "POST") return lerConsultaPost(requisicao);
  return { status: 405, erro: "Este endpoint aceita GET ou POST" };
}

function conferirDestino(destino) {
  if (!destino) return { status: 400, erro: "Informe a URL do Nacional" };
  let endereco;
  try {
    endereco = new URL(destino);
  } catch {
    return { status: 400, erro: "URL inválida" };
  }
  if (endereco.protocol !== "https:" || !DOMINIOS_LIBERADOS.includes(endereco.hostname)) {
    return { status: 403, erro: `Domínio não liberado: ${endereco.hostname}` };
  }
  if (endereco.port) return { status: 403, erro: `Porta não liberada: ${endereco.port}` };
  if (endereco.username || endereco.password) return { status: 403, erro: "Endereço com usuário ou senha não é aceito" };
  return { endereco };
}

function recusar(resposta, { status, erro }) {
  if (status === 405) resposta.setHeader("Allow", "GET, POST");
  resposta.status(status).json({ erro });
}

export default async function handler(requisicao, resposta) {
  aplicarCabecalhos(resposta);

  const consulta = lerConsulta(requisicao);
  if (consulta.erro) return recusar(resposta, consulta);

  const alvo = conferirDestino(consulta.destino);
  if (alvo.erro) return recusar(resposta, alvo);

  const { certificado } = consulta;
  const problema = certificado ? problemaNoCertificado(certificado) : "";
  if (problema) return recusar(resposta, { status: 400, erro: problema });

  try {
    const retorno = await consultarNacional(alvo.endereco.toString(), certificado);
    resposta.status(retorno.status);
    resposta.setHeader("Content-Type", retorno.tipo);
    aplicarCabecalhos(resposta, retorno.tipo);
    resposta.send(retorno.corpo);
  } catch (erro) {
    resposta.status(502).json({
      erro: `Falha ao consultar o Nacional: ${erro.message}`,
      codigo: erro.code || "",
      dica: dicaDoErro(erro, Boolean(certificado)),
      certificadoEnviado: Boolean(certificado)
    });
  }
}
