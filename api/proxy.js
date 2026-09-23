/* Repasse das consultas públicas do Ambiente Nacional. Existe porque os
   servidores do gov.br não liberam CORS, então o navegador não consegue
   chamá-los direto. Só repassa GET para os domínios da lista, sem guardar
   nada e sem receber credencial de cliente. */

const DOMINIOS_LIBERADOS = [
  "adn.nfse.gov.br",
  "adn.producaorestrita.nfse.gov.br",
  "sefin.nfse.gov.br",
  "sefin.producaorestrita.nfse.gov.br"
];

export default async function handler(requisicao, resposta) {
  if (requisicao.method !== "GET") {
    resposta.status(405).json({ erro: "Este endpoint aceita apenas GET" });
    return;
  }

  const destino = requisicao.query?.url || new URL(requisicao.url, "http://local").searchParams.get("url");
  if (!destino) {
    resposta.status(400).json({ erro: "Informe o parâmetro url" });
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
    const retorno = await fetch(endereco.toString(), {
      headers: { Accept: "application/json, application/xml, application/pdf, */*" }
    });

    const tipo = retorno.headers.get("content-type") || "application/octet-stream";
    resposta.status(retorno.status);
    resposta.setHeader("Content-Type", tipo);
    resposta.setHeader("Cache-Control", "no-store");

    if (tipo.includes("application/pdf") || tipo.includes("octet-stream") || tipo.includes("zip")) {
      const conteudo = Buffer.from(await retorno.arrayBuffer());
      resposta.send(conteudo);
      return;
    }

    resposta.send(await retorno.text());
  } catch (erro) {
    resposta.status(502).json({ erro: `Falha ao consultar o Nacional: ${erro.message}` });
  }
}
