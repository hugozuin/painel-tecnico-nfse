import forge from "node-forge";
import https from "node:https";
import tls from "node:tls";
import { readFileSync } from "node:fs";

globalThis.forge = forge;
const { lerCertificado } = await import("../js/certificado.js");
const { consultarNacional, dicaDoErro } = await import("../api/proxy.js");

let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};
const pasta = "./testes/certificados/";
const pfxLegado = readFileSync(`${pasta}cliente-legado.pfx`);

console.log("\n== leitura do certificado ==");
let motivoNativo = "";
try { tls.createSecureContext({ pfx: pfxLegado, passphrase: "senha123" }); } catch (erro) { motivoNativo = erro.message; }
conferir("o Node sozinho não abre o PFX legado", Boolean(motivoNativo), "abriu sem erro");
console.log(`       motivo no Node: ${motivoNativo}`);
const legado = lerCertificado(pfxLegado, "senha123");
conferir("abre o PFX legado (RC2-40, formato comum de A1)", legado.titular === "EMPRESA TESTE LTDA:12345678000195", legado.titular);
conferir("abre o PFX moderno", lerCertificado(readFileSync(`${pasta}cliente-moderno.pfx`), "senha123").titular === "EMPRESA TESTE LTDA:12345678000195");
conferir("chave convertida para PEM", legado.chave.startsWith("-----BEGIN RSA PRIVATE KEY-----"));
conferir("cadeia com titular e autoridade", legado.certificado.split("-----BEGIN CERTIFICATE-----").length === 3);
conferir("validade lida", legado.validoAte > new Date() && !legado.vencido);
let senhaErrada = "";
try { lerCertificado(pfxLegado, "errada"); } catch (erro) { senhaErrada = erro.message; }
conferir("senha errada explicada", senhaErrada.startsWith("Senha incorreta"), senhaErrada);

console.log("\n== servidor que exige certificado, como o Nacional ==");
const servidor = https.createServer({
  key: readFileSync(`${pasta}servidor.key`),
  cert: readFileSync(`${pasta}servidor.pem`),
  ca: readFileSync(`${pasta}ca.pem`),
  requestCert: true,
  rejectUnauthorized: true
}, (pedido, resposta) => {
  resposta.setHeader("Content-Type", "application/json");
  resposta.end(JSON.stringify({ titular: pedido.socket.getPeerCertificate()?.subject?.CN || "", caminho: pedido.url }));
});
await new Promise((pronto) => servidor.listen(0, pronto));
const endereco = `https://localhost:${servidor.address().port}/cnc/consulta/cad?codMunicipio=3504107&inscricaoFederal=12345678000195`;

const comCertificado = await consultarNacional(endereco, { chave: legado.chave, certificado: legado.certificado });
const corpo = JSON.parse(comCertificado.corpo.toString("utf8"));
conferir("com certificado responde 200", comCertificado.status === 200, String(comCertificado.status));
conferir("servidor recebeu o certificado do consultor", corpo.titular === "EMPRESA TESTE LTDA:12345678000195", JSON.stringify(corpo));
conferir("consulta do contribuinte chega com IBGE e CNPJ", corpo.caminho === "/cnc/consulta/cad?codMunicipio=3504107&inscricaoFederal=12345678000195");
conferir("tipo do retorno repassado", comCertificado.tipo === "application/json");

let erroSem = null;
try { await consultarNacional(endereco, null); } catch (erro) { erroSem = erro; }
conferir("sem certificado a conexão é recusada", Boolean(erroSem));
console.log(`       erro sem certificado: ${erroSem?.code} ${erroSem?.message}`);
conferir("a dica orienta a carregar o certificado", dicaDoErro(erroSem, false).includes("carregue um certificado A1"), dicaDoErro(erroSem, false));
servidor.close();

console.log(falhas === 0 ? "\nTeste do certificado passou." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
