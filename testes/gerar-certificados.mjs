import forge from "node-forge";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PASTA_CERTIFICADOS = path.join(path.dirname(fileURLToPath(import.meta.url)), "certificados");
export const SENHA_DOS_PFX = "senha123";
export const TITULAR_DE_TESTE = "EMPRESA TESTE LTDA:12345678000195";

const ARQUIVOS = ["ca.pem", "servidor.key", "servidor.pem", "cliente-legado.pfx", "cliente-moderno.pfx"];
const ANOS_DE_VALIDADE = 10;
const ITERACOES_DO_PFX = 2048;
const { asn1, pki } = forge;

const sequencia = (itens) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, itens);
const identificador = (nome) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(pki.oids[nome]).getBytes());
const octetos = (bytes) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, bytes);
const inteiro = (numero) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(numero).getBytes());
const nulo = () => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, "");
const explicito = (item) => asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [item]);
const implicito = (bytes) => asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, false, bytes);
const derDe = (objeto) => asn1.toDer(objeto).getBytes();
const chaveDoPkcs12 = (senha, sal, finalidade, tamanho) =>
  pki.pbe.generatePkcs12Key(senha, forge.util.createBuffer(sal), finalidade, ITERACOES_DO_PFX, tamanho);

function novaChave() {
  const { privateKey: pem } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
  const privada = pki.privateKeyFromPem(pem);
  return { pem, privada, publica: pki.setRsaPublicKey(privada.n, privada.e) };
}

function emitir({ titular, chave, serie, extensoes = [], emissor = null, chaveDoEmissor = chave.privada }) {
  const certificado = pki.createCertificate();
  const assunto = [{ name: "commonName", value: titular }];
  certificado.publicKey = chave.publica;
  certificado.serialNumber = serie;
  certificado.validity.notBefore = new Date();
  certificado.validity.notAfter = new Date();
  certificado.validity.notAfter.setFullYear(certificado.validity.notBefore.getFullYear() + ANOS_DE_VALIDADE);
  certificado.setSubject(assunto);
  certificado.setIssuer(emissor ? emissor.subject.attributes : assunto);
  certificado.setExtensions(extensoes);
  certificado.sign(chaveDoEmissor, forge.md.sha256.create());
  return certificado;
}

function cifrarComRc2de40(bytes, senha) {
  const sal = forge.random.getBytesSync(8);
  const cifra = forge.rc2.createEncryptionCipher(chaveDoPkcs12(senha, sal, 1, 5), 40);
  cifra.start(chaveDoPkcs12(senha, sal, 2, 8));
  cifra.update(forge.util.createBuffer(bytes));
  cifra.finish();
  return sequencia([
    identificador("encryptedData"),
    explicito(sequencia([
      inteiro(0),
      sequencia([
        identificador("data"),
        sequencia([identificador("pbewithSHAAnd40BitRC2-CBC"), sequencia([octetos(sal), inteiro(ITERACOES_DO_PFX)])]),
        implicito(cifra.output.getBytes())
      ])
    ]))
  ]);
}

function assinarComMac(conteudoAutenticado, senha) {
  const sal = forge.random.getBytesSync(8);
  const hmac = forge.hmac.create();
  hmac.start("sha1", chaveDoPkcs12(senha, sal, 3, 20));
  hmac.update(derDe(conteudoAutenticado));
  return sequencia([
    sequencia([sequencia([identificador("sha1"), nulo()]), octetos(hmac.digest().getBytes())]),
    octetos(sal),
    inteiro(ITERACOES_DO_PFX)
  ]);
}

function pfxLegado(chave, cadeia, senha) {
  const moderno = forge.pkcs12.toPkcs12Asn1(chave.privada, cadeia, senha, { algorithm: "3des", count: ITERACOES_DO_PFX });
  const [certificadosAbertos, chaveCifrada] = asn1.fromDer(moderno.value[1].value[1].value[0].value).value;
  const conteudoAutenticado = sequencia([cifrarComRc2de40(certificadosAbertos.value[1].value[0].value, senha), chaveCifrada]);
  return derDe(sequencia([
    inteiro(3),
    sequencia([identificador("data"), explicito(octetos(derDe(conteudoAutenticado)))]),
    assinarComMac(conteudoAutenticado, senha)
  ]));
}

function pfxModerno(chave, cadeia, senha) {
  return derDe(forge.pkcs12.toPkcs12Asn1(chave.privada, cadeia, senha, { algorithm: "aes256", count: ITERACOES_DO_PFX }));
}

function gravar(arquivo, conteudo, binario = false) {
  writeFileSync(path.join(PASTA_CERTIFICADOS, arquivo), binario ? Buffer.from(conteudo, "binary") : conteudo);
}

export function garantirCertificadosDeTeste() {
  if (ARQUIVOS.every((arquivo) => existsSync(path.join(PASTA_CERTIFICADOS, arquivo)))) return PASTA_CERTIFICADOS;
  mkdirSync(PASTA_CERTIFICADOS, { recursive: true });

  const chaveDaAutoridade = novaChave();
  const autoridade = emitir({
    titular: "AC Teste Local", chave: chaveDaAutoridade, serie: "01",
    extensoes: [{ name: "basicConstraints", cA: true, critical: true }]
  });
  const chaveDoServidor = novaChave();
  const servidor = emitir({
    titular: "localhost", chave: chaveDoServidor, serie: "02", emissor: autoridade, chaveDoEmissor: chaveDaAutoridade.privada,
    extensoes: [{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] }]
  });
  const chaveDoCliente = novaChave();
  const cliente = emitir({ titular: TITULAR_DE_TESTE, chave: chaveDoCliente, serie: "03", emissor: autoridade, chaveDoEmissor: chaveDaAutoridade.privada });

  gravar("ca.pem", pki.certificateToPem(autoridade));
  gravar("servidor.key", chaveDoServidor.pem);
  gravar("servidor.pem", pki.certificateToPem(servidor));
  gravar("cliente-legado.pfx", pfxLegado(chaveDoCliente, [cliente, autoridade], SENHA_DOS_PFX), true);
  gravar("cliente-moderno.pfx", pfxModerno(chaveDoCliente, [cliente], SENHA_DOS_PFX), true);
  return PASTA_CERTIFICADOS;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Certificados de teste em ${garantirCertificadosDeTeste()}`);
}
