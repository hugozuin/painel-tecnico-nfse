/* Credencial usada por todos os módulos. Sem a opção de manter a chave,
   ela fica apenas na sessão do navegador e some ao fechar a aba. */

import { elemento, CHAVES_ARMAZENAMENTO, mostrarAviso, pedirConfirmacao, registrarLog } from "./shared.js";

let campoChave;
let seletorPerfil;
let campoApelido;
let distintivoPerfil;

export function lerApiKey() {
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
    const bruto = localStorage.getItem(CHAVES_ARMAZENAMENTO.perfis);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function gravarPerfis(lista) {
  localStorage.setItem(CHAVES_ARMAZENAMENTO.perfis, JSON.stringify(lista));
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
  distintivoPerfil.textContent = perfis.length === 0
    ? "Nenhum perfil salvo"
    : selecionado
      ? `Perfil ativo: ${selecionado}`
      : `${perfis.length} perfil(is) salvo(s)`;
}

function guardarChaveDigitada() {
  const manter = elemento("rememberApiKey").checked;
  const chave = lerApiKey();
  if (manter) {
    localStorage.setItem(CHAVES_ARMAZENAMENTO.apiKey, chave);
    sessionStorage.removeItem(CHAVES_ARMAZENAMENTO.apiKey);
  } else {
    localStorage.removeItem(CHAVES_ARMAZENAMENTO.apiKey);
    sessionStorage.setItem(CHAVES_ARMAZENAMENTO.apiKey, chave);
  }
  localStorage.setItem(CHAVES_ARMAZENAMENTO.lembrarApiKey, String(manter));
}

export function iniciarCredencial() {
  campoChave = elemento("apiKeyInput");
  seletorPerfil = elemento("perfilSelect");
  campoApelido = elemento("perfilNomeInput");
  distintivoPerfil = elemento("perfilAtivoBadge");

  const manter = localStorage.getItem(CHAVES_ARMAZENAMENTO.lembrarApiKey) === "true";
  elemento("rememberApiKey").checked = manter;
  campoChave.value = (manter
    ? localStorage.getItem(CHAVES_ARMAZENAMENTO.apiKey)
    : sessionStorage.getItem(CHAVES_ARMAZENAMENTO.apiKey)) || "";

  desenharPerfis(localStorage.getItem(CHAVES_ARMAZENAMENTO.perfilAtivo) || "");

  elemento("toggleApiKey").addEventListener("click", () => {
    campoChave.type = campoChave.type === "password" ? "text" : "password";
  });

  campoChave.addEventListener("input", guardarChaveDigitada);
  elemento("rememberApiKey").addEventListener("change", guardarChaveDigitada);

  seletorPerfil.addEventListener("change", () => {
    const escolhido = seletorPerfil.value;
    localStorage.setItem(CHAVES_ARMAZENAMENTO.perfilAtivo, escolhido);
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
    localStorage.setItem(CHAVES_ARMAZENAMENTO.perfilAtivo, nome);
    campoApelido.value = "";
    desenharPerfis(nome);
    registrarLog(`Perfil de credencial "${nome}" salvo neste navegador.`);
    mostrarAviso("Perfil salvo neste navegador.", "success");
  });

  elemento("removerPerfilBtn").addEventListener("click", async () => {
    const escolhido = seletorPerfil.value;
    if (!escolhido) {
      mostrarAviso("Selecione um perfil salvo para remover.", "info");
      return;
    }
    const confirmou = await pedirConfirmacao("Remover perfil", `O perfil ${escolhido} será apagado deste navegador. Deseja continuar?`);
    if (!confirmou) return;
    gravarPerfis(lerPerfis().filter((item) => item.nome !== escolhido));
    localStorage.removeItem(CHAVES_ARMAZENAMENTO.perfilAtivo);
    desenharPerfis("");
    registrarLog(`Perfil de credencial "${escolhido}" removido.`, "warn");
    mostrarAviso("Perfil removido.", "success");
  });
}
