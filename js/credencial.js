import { elemento, CHAVES_ARMAZENAMENTO, mostrarAviso, pedirConfirmacao, registrarLog } from "./shared.js";

let campoChave;
let seletorPerfil;
let campoApelido;
let distintivoPerfil;

function lerApiKey() {
  return campoChave ? campoChave.value.trim() : "";
}

export function exigirApiKey() {
  const chave = lerApiKey();
  if (!chave) {
    mostrarAviso("Informe a API Key antes de executar.", "error");
    campoChave?.focus();
    return "";
  }
  return chave;
}

function lerPerfis() {
  try {
    const bruto = sessionStorage.getItem(CHAVES_ARMAZENAMENTO.perfis);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function gravarPerfis(lista) {
  sessionStorage.setItem(CHAVES_ARMAZENAMENTO.perfis, JSON.stringify(lista));
}

function desenharPerfis(selecionado = "") {
  const perfis = lerPerfis();
  seletorPerfil.replaceChildren();
  const padrao = document.createElement("option");
  padrao.value = "";
  padrao.textContent = "Chave digitada agora";
  seletorPerfil.appendChild(padrao);

  perfis.forEach((perfil) => {
    const opcao = document.createElement("option");
    opcao.value = perfil.nome;
    opcao.textContent = perfil.nome;
    seletorPerfil.appendChild(opcao);
  });

  seletorPerfil.value = selecionado;
  elemento("apagarPerfisBtn").disabled = perfis.length === 0;
  distintivoPerfil.textContent = perfis.length === 0
    ? "Nenhum perfil nesta aba"
    : selecionado
      ? `Perfil ativo: ${selecionado}`
      : `${perfis.length} perfil(is) nesta aba`;
}

function apagarChavesDosPerfis(perfisApagados, perfisRestantes) {
  const aindaEmUso = new Set(perfisRestantes.map((perfil) => perfil.chave));
  const chavesApagadas = new Set(perfisApagados.map((perfil) => perfil.chave).filter((chave) => !aindaEmUso.has(chave)));
  if (chavesApagadas.has(lerApiKey())) campoChave.value = "";
  if (chavesApagadas.has(sessionStorage.getItem(CHAVES_ARMAZENAMENTO.apiKey))) sessionStorage.removeItem(CHAVES_ARMAZENAMENTO.apiKey);
}

function guardarChaveDigitada() {
  sessionStorage.setItem(CHAVES_ARMAZENAMENTO.apiKey, lerApiKey());
}

export function iniciarCredencial() {
  campoChave = elemento("apiKeyInput");
  seletorPerfil = elemento("perfilSelect");
  campoApelido = elemento("perfilNomeInput");
  distintivoPerfil = elemento("perfilAtivoBadge");

  campoChave.value = sessionStorage.getItem(CHAVES_ARMAZENAMENTO.apiKey) || "";
  desenharPerfis(sessionStorage.getItem(CHAVES_ARMAZENAMENTO.perfilAtivo) || "");

  elemento("toggleApiKey").addEventListener("click", () => {
    campoChave.type = campoChave.type === "password" ? "text" : "password";
  });

  campoChave.addEventListener("input", guardarChaveDigitada);

  seletorPerfil.addEventListener("change", () => {
    const escolhido = seletorPerfil.value;
    sessionStorage.setItem(CHAVES_ARMAZENAMENTO.perfilAtivo, escolhido);
    if (!escolhido) {
      desenharPerfis("");
      return;
    }
    const perfil = lerPerfis().find((item) => item.nome === escolhido);
    if (perfil) {
      campoChave.value = perfil.chave;
      guardarChaveDigitada();
      desenharPerfis(escolhido);
      registrarLog(`Perfil de credencial "${escolhido}" carregado.`);
      mostrarAviso(`Perfil ${escolhido} carregado.`, "success");
    }
  });

  elemento("salvarPerfilBtn").addEventListener("click", () => {
    const nome = campoApelido.value.trim();
    const chave = lerApiKey();
    if (!nome) {
      mostrarAviso("Informe um apelido para o perfil.", "error");
      return;
    }
    if (!chave) {
      mostrarAviso("Preencha a API Key antes de salvar o perfil.", "error");
      return;
    }
    const perfis = lerPerfis().filter((item) => item.nome !== nome);
    perfis.push({ nome, chave });
    gravarPerfis(perfis);
    sessionStorage.setItem(CHAVES_ARMAZENAMENTO.perfilAtivo, nome);
    campoApelido.value = "";
    desenharPerfis(nome);
    registrarLog(`Perfil de credencial "${nome}" salvo nesta aba.`);
    mostrarAviso("Perfil salvo nesta aba.", "success");
  });

  elemento("removerPerfilBtn").addEventListener("click", async () => {
    const escolhido = seletorPerfil.value;
    if (!escolhido) {
      mostrarAviso("Selecione um perfil salvo para remover.", "info");
      return;
    }
    const confirmou = await pedirConfirmacao("Remover perfil",
      `O perfil ${escolhido} será apagado desta aba. Se a chave dele estiver no campo, ela também será apagada. Deseja continuar?`);
    if (!confirmou) return;
    const perfis = lerPerfis();
    const restantes = perfis.filter((item) => item.nome !== escolhido);
    gravarPerfis(restantes);
    sessionStorage.removeItem(CHAVES_ARMAZENAMENTO.perfilAtivo);
    apagarChavesDosPerfis(perfis.filter((item) => item.nome === escolhido), restantes);
    desenharPerfis("");
    registrarLog(`Perfil de credencial "${escolhido}" removido.`, "warn");
    mostrarAviso("Perfil removido.", "success");
  });

  elemento("apagarPerfisBtn").addEventListener("click", async () => {
    const perfis = lerPerfis();
    if (perfis.length === 0) {
      mostrarAviso("Não há perfis nesta aba.", "info");
      return;
    }
    const descricao = perfis.length === 1
      ? "O perfil desta aba será apagado, com a API Key dele."
      : `Os ${perfis.length} perfis desta aba serão apagados, com as API Keys deles.`;
    const confirmou = await pedirConfirmacao("Apagar todos os perfis",
      `${descricao} Se a chave no campo for de um perfil, ela também será apagada. Deseja continuar?`);
    if (!confirmou) return;
    sessionStorage.removeItem(CHAVES_ARMAZENAMENTO.perfis);
    sessionStorage.removeItem(CHAVES_ARMAZENAMENTO.perfilAtivo);
    apagarChavesDosPerfis(perfis, []);
    desenharPerfis("");
    registrarLog(`Todos os perfis de credencial apagados desta aba (${perfis.length}).`, "warn");
    mostrarAviso("Perfis apagados desta aba.", "success");
  });
}
