/* Repasse das consultas do Ambiente Nacional. Existe porque os servidores
   do gov.br não liberam CORS para o navegador. Aceita GET simples ou POST
   com a chave e o certificado do consultor, usados só na conexão TLS e
   descartados ao fim da chamada, sem registro. Só consulta os domínios da
   lista e nunca guarda nada. */

import https from "node:https";

export const DOMINIOS_LIBERADOS = [
  "adn.nfse.gov.br",
  "adn.producaorestrita.nfse.gov.br",
  "sefin.nfse.gov.br",
  "sefin.producaorestrita.nfse.gov.br"
];

const TEMPO_LIMITE_MS = 30000;

export function consultarNacional(endereco, certificado) {
  return new Promise((resolve, reject) => {
    const opcoes = {
      method: "GET",
      headers: { Accept: "application/json, application/xml, application/pdf, */*" },
      timeout: TEMPO_LIMITE_MS
    };
    if (certificado) {
      opcoes.key = certificado.chave;
      opcoes.cert = certificado.certificado;
    }
    const pedido = https.request(endereco, opcoes, (resposta) => {
      const partes = [];
      resposta.on("data", (parte) => partes.push(parte));
      resposta.on("end", () => resolve({
        status: resposta.statusCode,
        tipo: resposta.headers["content-type"] || "application/octet-stream",
        corpo: Buffer.concat(partes)
      }));
      resposta.on("error", reject);
    });
    pedido.on("timeout", () => {
      const erro = new Error(`Tempo limite de ${TEMPO_LIMITE_MS / 1000}s excedido`);
      erro.code = "ETIMEDOUT";
      pedido.destroy(erro);
    });
    pedido.on("error", reject);
    pedido.end();
  });
}

export function dicaDoErro(erro, comCertificado) {
  const texto = `${erro?.code || ""} ${erro?.message || ""}`;
  if (/ETIMEDOUT/.test(texto)) return "O Nacional não respondeu dentro do tempo limite.";
  if (/ENOTFOUND|EAI_AGAIN/.test(texto)) return "O endereço do Nacional não foi encontrado.";
  if (/UNABLE_TO_GET_ISSUER|SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF|CERT_HAS_EXPIRED|CERT_NOT_YET_VALID/.test(texto)) {
    return "A conexão não reconheceu o certificado do servidor do Nacional.";
  }
  if (/KEY_VALUES_MISMATCH|bad decrypt|no start line|PEM/i.test(texto)) {
    return "A chave e o certificado enviados não formam um par válido. Carregue o certificado de novo.";
  }
  if (/ECONNRESET|socket hang up|ALERT|handshake|EPROTO/i.test(texto)) {
    return comCertificado
      ? "O servidor encerrou a conexão TLS mesmo com o certificado enviado. Confira se ele é ICP-Brasil e está dentro da validade."
      : "O servidor encerrou a conexão TLS. Se a consulta exige certificado digital, carregue um certificado A1 na tela.";
  }
  return "";
}

function lerCorpo(requisicao) {
  if (typeof requisicao.body === "string") return JSON.parse(requisicao.body || "{}");
  return requisicao.body || {};
}

export default async function handler(requisicao, resposta) {
  let destino = "";
  let certificado = null;

  if (requisicao.method === "GET") {
    destino = requisicao.query?.url || new URL(requisicao.url, "http://local").searchParams.get("url") || "";
  } else if (requisicao.method === "POST") {
    let corpo;
    try {
      corpo = lerCorpo(requisicao);
    } catch {
      resposta.status(400).json({ erro: "Corpo da requisição não é um JSON válido" });
      return;
    }
    destino = corpo.url || "";
    if (corpo.certificado) {
      const { chave, certificado: cadeia } = corpo.certificado;
      if (typeof chave !== "string" || typeof cadeia !== "string") {
        resposta.status(400).json({ erro: "Certificado incompleto: envie chave e certificado em PEM" });
        return;
      }
      certificado = { chave, certificado: cadeia };
    }
  } else {
    resposta.status(405).json({ erro: "Este endpoint aceita GET ou POST" });
    return;
  }

  if (!destino) {
    resposta.status(400).json({ erro: "Informe a URL do Nacional" });
    return;
  }

  let endereco;
  try {
    endereco = new URL(destino);
  } catch {
    resposta.status(400).json({ erro: "URL inválida" });
    return;
  }

  if (endereco.protocol !== "https:" || !DOMINIOS_LIBERADOS.includes(endereco.hostname)) {
    resposta.status(403).json({ erro: `Domínio não liberado: ${endereco.hostname}` });
    return;
  }

  try {
    const retorno = await consultarNacional(endereco.toString(), certificado);
    resposta.status(retorno.status);
    resposta.setHeader("Content-Type", retorno.tipo);
    resposta.setHeader("Cache-Control", "no-store");
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
