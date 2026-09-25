import https from "node:https";
import tls from "node:tls";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";

const { default: handler, dicaDoErro } = await import("../api/proxy.js");

const pedidosAoNacional = [];
https.request = (endereco) => {
  pedidosAoNacional.push(String(endereco));
  const pedido = new EventEmitter();
  pedido.destroy = () => {};
  pedido.end = () => setImmediate(() => pedido.emit("error", Object.assign(new Error("Chamada ao Nacional fora do esperado no teste"), { code: "ETESTE" })));
  return pedido;
};

let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};
const executar = async (requisicao) => {
  const registro = { cabecalhos: {} };
  const resposta = {
    status(codigo) { registro.status = codigo; return this; },
    json(corpo) { registro.corpo = corpo; return this; },
    send(corpo) { registro.corpo = corpo; return this; },
    setHeader(nome, valor) { registro.cabecalhos[nome] = valor; return this; }
  };
  await handler({ headers: {}, query: {}, ...requisicao }, resposta);
  return registro;
};
const pem = { chave: "-----BEGIN RSA PRIVATE KEY-----", certificado: "-----BEGIN CERTIFICATE-----" };

console.log("\n== controle de acesso do repasse ==");
conferir("recusa método diferente de GET e POST", (await executar({ method: "PUT" })).status === 405);
conferir("GET sem url", (await executar({ method: "GET" })).status === 400);
conferir("GET com url inválida", (await executar({ method: "GET", query: { url: "nao-e-url" } })).status === 400);
conferir("GET para domínio fora da lista", (await executar({ method: "GET", query: { url: "https://exemplo-malicioso.com/x" } })).status === 403);
conferir("GET sem TLS", (await executar({ method: "GET", query: { url: "http://adn.nfse.gov.br/x" } })).status === 403);
conferir("GET para domínio parecido", (await executar({ method: "GET", query: { url: "https://adn.nfse.gov.br.invasor.com/x" } })).status === 403);
conferir("POST com corpo que não é JSON", (await executar({ method: "POST", body: "{quebrado" })).status === 400);
conferir("POST sem url", (await executar({ method: "POST", body: {} })).status === 400);
conferir("POST com certificado incompleto", (await executar({ method: "POST", body: { url: "https://adn.nfse.gov.br/x", certificado: { chave: 1 } } })).status === 400);
const fora = await executar({ method: "POST", body: { url: "https://exemplo-malicioso.com/x", certificado: pem } });
conferir("certificado nunca segue para domínio fora da lista", fora.status === 403);
const naoPermitido = await executar({ method: "DELETE" });
conferir("método recusado informa os aceitos", naoPermitido.status === 405 && naoPermitido.cabecalhos.Allow === "GET, POST");
conferir("GET para porta diferente da padrão", (await executar({ method: "GET", query: { url: "https://adn.nfse.gov.br:8443/x" } })).status === 403);
conferir("GET com usuário e senha na URL", (await executar({ method: "GET", query: { url: "https://usuario:segredo@adn.nfse.gov.br/x" } })).status === 403);
conferir("POST com usuário na URL", (await executar({ method: "POST", body: { url: "https://usuario@sefin.nfse.gov.br/x", certificado: pem } })).status === 403);
conferir("GET com url repetida", (await executar({ method: "GET", query: { url: ["https://adn.nfse.gov.br/x", "https://adn.nfse.gov.br/y"] } })).status === 400);
conferir("POST com corpo null em texto", (await executar({ method: "POST", body: "null" })).status === 400);
conferir("POST com corpo em lista", (await executar({ method: "POST", body: [] })).status === 400);
conferir("POST com url que não é texto", (await executar({ method: "POST", body: { url: ["https://adn.nfse.gov.br/x"] } })).status === 400);
conferir("nenhuma recusa chegou a chamar o Nacional", pedidosAoNacional.length === 0, pedidosAoNacional.join(", "));

console.log("\n== dicas de erro ==");
conferir("tempo esgotado", dicaDoErro({ code: "ETIMEDOUT" }, false).includes("tempo limite"));
conferir("endereço não encontrado", dicaDoErro({ code: "ENOTFOUND" }, false).includes("não foi encontrado"));
conferir("cadeia do servidor", dicaDoErro({ code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" }, false).includes("certificado do servidor"));
conferir("par de chave inválido", dicaDoErro({ code: "ERR_OSSL_X509_KEY_VALUES_MISMATCH" }, true).includes("par válido"));
const erroAoMontarTls = (opcoes) => {
  try {
    tls.createSecureContext(opcoes);
    return null;
  } catch (erro) {
    return erro;
  }
};
const chaveDeTeste = readFileSync("testes/certificados/servidor.key", "utf8");
const cadeiaDeTeste = readFileSync("testes/certificados/servidor.pem", "utf8");
const erroDeChave = erroAoMontarTls({ key: "-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n", cert: cadeiaDeTeste });
const erroDeCadeia = erroAoMontarTls({ key: chaveDeTeste, cert: "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n" });
conferir("chave em PEM com conteúdo inválido explicada", Boolean(erroDeChave) && dicaDoErro(erroDeChave, true).includes("par válido"), erroDeChave?.message);
conferir("cadeia em PEM com conteúdo inválido explicada", Boolean(erroDeCadeia) && dicaDoErro(erroDeCadeia, true).includes("par válido"), erroDeCadeia?.message);
conferir("conexão recusada sem certificado", dicaDoErro({ code: "ECONNRESET" }, false).includes("carregue um certificado A1"));
conferir("conexão recusada com certificado", dicaDoErro({ code: "ECONNRESET" }, true).includes("ICP-Brasil"));

console.log(falhas === 0 ? "\nTeste do repasse passou." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
