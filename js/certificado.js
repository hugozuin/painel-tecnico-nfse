/* Certificado A1 do consultor para as consultas do Nacional que exigem
   TLS com certificado. O arquivo e a senha são lidos no navegador; só a
   chave e o certificado em PEM seguem para o repasse, na hora da consulta.
   Nada é gravado: o certificado vive na memória da aba. */

import { criar, mostrarAviso, registrarLog } from "./shared.js";

export const BIBLIOTECA_FORGE = {
  endereco: "assets/vendor/forge-1.4.0.min.js",
  integridade: "sha384-wX64sW+w67fcBkYc40eYEvKyZMtpFujAPnxJPPMvE6fT3WDOJDZOAAny4rWgoBYq"
};

let carregado = null;
let carregamentoDaBiblioteca = null;

export function certificadoAtual() {
  return carregado;
}

export function descartarCertificado() {
  carregado = null;
}

function carregarBiblioteca() {
  if (globalThis.forge) return Promise.resolve(globalThis.forge);
  if (!carregamentoDaBiblioteca) {
    carregamentoDaBiblioteca = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = BIBLIOTECA_FORGE.endereco;
      script.integrity = BIBLIOTECA_FORGE.integridade;
      script.onload = () => resolve(globalThis.forge);
      script.onerror = () => {
        carregamentoDaBiblioteca = null;
        reject(new Error("Não foi possível carregar a biblioteca de leitura do certificado"));
      };
      document.head.appendChild(script);
    });
  }
  return carregamentoDaBiblioteca;
}

function lerBinario(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(new Error("Falha ao ler o arquivo do certificado"));
    leitor.readAsArrayBuffer(arquivo);
  });
}

export function lerCertificado(conteudo, senha, biblioteca = globalThis.forge) {
  const bytes = new Uint8Array(conteudo);
  let pacote;
  try {
    const binario = biblioteca.util.binary.raw.encode(bytes);
    pacote = biblioteca.pkcs12.pkcs12FromAsn1(biblioteca.asn1.fromDer(binario), false, senha);
  } catch {
    throw new Error("Senha incorreta ou arquivo que não é um certificado A1 (.pfx ou .p12)");
  }

  const oids = biblioteca.pki.oids;
  const chaves = [
    ...(pacote.getBags({ bagType: oids.pkcs8ShroudedKeyBag })[oids.pkcs8ShroudedKeyBag] || []),
    ...(pacote.getBags({ bagType: oids.keyBag })[oids.keyBag] || [])
  ].map((bolsa) => bolsa.key).filter(Boolean);
  const certificados = (pacote.getBags({ bagType: oids.certBag })[oids.certBag] || [])
    .map((bolsa) => bolsa.cert).filter(Boolean);

  if (chaves.length === 0 || certificados.length === 0) {
    throw new Error("O arquivo não traz a chave privada e o certificado juntos");
  }

  const chave = chaves[0];
  const titular = certificados.find((certificado) => certificado.publicKey?.n?.equals?.(chave.n)) || certificados[0];
  const cadeia = [titular, ...certificados.filter((certificado) => certificado !== titular)];
  const nome = titular.subject.getField("CN")?.value || "sem nome";

  return {
    titular: nome,
    emissor: titular.issuer.getField("CN")?.value || "",
    validoAte: titular.validity.notAfter,
    vencido: titular.validity.notAfter < new Date(),
    chave: biblioteca.pki.privateKeyToPem(chave),
    certificado: cadeia.map((certificado) => biblioteca.pki.certificateToPem(certificado)).join("")
  };
}

export function montarCartaoCertificado(container) {
  const arquivo = criar("input", { type: "file", accept: ".pfx,.p12", class: "text-input" });
  const senha = criar("input", { type: "password", class: "text-input", placeholder: "Senha do certificado", autocomplete: "off" });
  const situacao = criar("p", { class: "certificado-situacao" });
  const botaoCarregar = criar("button", { type: "button", class: "btn btn-outline btn-sm", texto: "Carregar certificado" });
  const botaoRemover = criar("button", { type: "button", class: "btn btn-ghost btn-sm", texto: "Remover" });

  function mostrarSituacao() {
    situacao.textContent = "";
    botaoRemover.hidden = !carregado;
    if (!carregado) {
      situacao.className = "certificado-situacao";
      situacao.textContent = "Nenhum certificado carregado. As consultas seguem sem certificado.";
      return;
    }
    situacao.className = `certificado-situacao ${carregado.vencido ? "vencido" : "ativo"}`;
    const validade = carregado.validoAte.toLocaleDateString("pt-BR");
    situacao.append(
      criar("strong", { texto: carregado.titular }),
      criar("span", { texto: ` · válido até ${validade}${carregado.vencido ? " (vencido)" : ""}` }),
      carregado.emissor ? criar("span", { class: "certificado-emissor", texto: ` · emitido por ${carregado.emissor}` }) : null
    );
  }

  botaoCarregar.addEventListener("click", async () => {
    const escolhido = arquivo.files?.[0];
    if (!escolhido) {
      mostrarAviso("Escolha o arquivo .pfx ou .p12 do certificado.", "error");
      return;
    }
    botaoCarregar.disabled = true;
    try {
      const biblioteca = await carregarBiblioteca();
      carregado = lerCertificado(await lerBinario(escolhido), senha.value, biblioteca);
      arquivo.value = "";
      registrarLog(`Certificado carregado para as consultas do Nacional: ${carregado.titular}.`, "success");
      mostrarAviso(carregado.vencido ? "Certificado carregado, mas está vencido." : "Certificado carregado.", carregado.vencido ? "error" : "success");
    } catch (erro) {
      mostrarAviso(erro.message, "error");
    } finally {
      senha.value = "";
      botaoCarregar.disabled = false;
      mostrarSituacao();
    }
  });

  botaoRemover.addEventListener("click", () => {
    descartarCertificado();
    registrarLog("Certificado removido da sessão.", "warn");
    mostrarSituacao();
  });

  container.appendChild(criar("section", { class: "card" }, [
    criar("div", { class: "card-header" }, [criar("h2", { texto: "Certificado digital" })]),
    criar("div", { class: "card-body" }, [
      criar("p", { class: "field-hint", texto: "Algumas consultas do Nacional exigem certificado digital na conexão. Pode ser qualquer certificado A1 ICP-Brasil válido, não precisa ser do CNPJ consultado." }),
      criar("div", { class: "config-row" }, [
        criar("div", { class: "config-field" }, [criar("label", { class: "field-label", texto: "Arquivo do certificado (.pfx ou .p12)" }), arquivo]),
        criar("div", { class: "config-field" }, [criar("label", { class: "field-label", texto: "Senha" }), senha])
      ]),
      criar("div", { class: "card-actions" }, [botaoCarregar, botaoRemover]),
      situacao,
      criar("p", { class: "field-hint", texto: "O arquivo e a senha são lidos no seu navegador. Só a chave e o certificado seguem para o repasse da aplicação durante a consulta, sem serem guardados. Ao recarregar a página, o certificado precisa ser carregado de novo." })
    ])
  ]));
  mostrarSituacao();
}
