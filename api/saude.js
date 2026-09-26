export const VERSAO = "4.1.0";

export default function responderSaude(requisicao, resposta) {
  resposta.setHeader("Cache-Control", "no-store");
  resposta.setHeader("X-Content-Type-Options", "nosniff");
  if (requisicao.method !== "GET" && requisicao.method !== "HEAD") {
    resposta.setHeader("Allow", "GET, HEAD");
    return resposta.status(405).json({ erro: "Este endpoint aceita GET ou HEAD" });
  }
  return resposta.status(200).json({ situacao: "ok", versao: VERSAO });
}
