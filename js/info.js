import { criar, copiarTexto, mostrarAviso } from "./shared.js";

const construtores = new Map();
const estado = { popup: null, corpo: null, situacao: null, icone: null, fixado: false, espera: null };

export function conteudoDoPopup(titulo, blocos) {
  return criar("div", {}, [criar("p", { class: "popup-titulo" }, titulo), ...blocos]);
}

export function secaoDoPopup(rotulo, texto) {
  return [criar("h4", { texto: rotulo }), criar("p", { class: "popup-texto", texto })];
}

export function fonteDoPopup(fonte) {
  return criar("p", { class: "popup-fonte", texto: `Fonte: ${fonte}` });
}

export function iconeInfo(chave, construir, rotulo = "Ver detalhes", contador = "") {
  construtores.set(chave, construir);
  const icone = criar("button", { type: "button", class: "info-icone", dados: { info: chave } }, [
    criar("span", { class: "info-letra", texto: "i" }),
    contador ? criar("span", { class: "info-contador", texto: contador }) : null
  ]);
  icone.setAttribute("aria-label", rotulo);
  return icone;
}

function garantirPopup() {
  if (estado.popup) return;
  estado.situacao = criar("span", { class: "info-popup-situacao" });
  estado.corpo = criar("div", { class: "info-popup-corpo" });
  const botaoFechar = criar("button", { type: "button", class: "info-popup-fechar", texto: "×", aoClicar: fecharPopup });
  botaoFechar.setAttribute("aria-label", "Fechar");
  estado.popup = criar("div", { class: "info-popup", hidden: true }, [
    criar("div", { class: "info-popup-topo" }, [
      estado.situacao,
      criar("div", { class: "info-popup-acoes" }, [
        criar("button", { type: "button", class: "btn btn-outline btn-xs", texto: "Copiar", aoClicar: copiarConteudo }),
        botaoFechar
      ])
    ]),
    estado.corpo
  ]);
  estado.popup.setAttribute("role", "dialog");
  estado.popup.addEventListener("mouseenter", () => clearTimeout(estado.espera));
  estado.popup.addEventListener("mouseleave", () => { if (!estado.fixado) agendarFechamento(); });
  document.body.appendChild(estado.popup);
}

function abrir(icone) {
  const construir = construtores.get(icone.dataset.info);
  if (!construir) return;
  garantirPopup();
  clearTimeout(estado.espera);
  estado.icone = icone;
  estado.fixado = false;
  estado.popup.classList.remove("fixado");
  estado.situacao.textContent = "Shift ou clique no ícone para fixar";
  estado.corpo.textContent = "";
  estado.corpo.appendChild(construir());
  estado.popup.hidden = false;
  posicionar(icone);
}

function posicionar(icone) {
  const area = icone.getBoundingClientRect();
  const popup = estado.popup;
  const margem = 8;
  popup.style.left = "0px";
  popup.style.top = "0px";
  const largura = popup.offsetWidth;
  const altura = popup.offsetHeight;
  let esquerda = Math.min(area.left, window.innerWidth - largura - margem);
  esquerda = Math.max(margem, esquerda);
  let topo = area.bottom + 6;
  if (topo + altura > window.innerHeight - margem && area.top - altura - 6 > margem) topo = area.top - altura - 6;
  topo = Math.max(margem, Math.min(topo, window.innerHeight - altura - margem));
  popup.style.left = `${esquerda}px`;
  popup.style.top = `${topo}px`;
}

function fixar() {
  if (!estado.popup || estado.popup.hidden) return;
  estado.fixado = true;
  estado.popup.classList.add("fixado");
  estado.situacao.textContent = "Fixado · Esc para fechar";
}

export function fecharPopup() {
  clearTimeout(estado.espera);
  if (!estado.popup) return;
  estado.popup.hidden = true;
  estado.popup.classList.remove("fixado");
  estado.fixado = false;
  estado.icone = null;
}

function agendarFechamento() {
  clearTimeout(estado.espera);
  estado.espera = setTimeout(() => { if (!estado.fixado) fecharPopup(); }, 180);
}

async function copiarConteudo() {
  const copiou = await copiarTexto(estado.corpo.innerText || estado.corpo.textContent);
  mostrarAviso(copiou ? "Conteúdo copiado." : "Não foi possível copiar.", copiou ? "success" : "error");
}

export function estadoDoPopup() {
  return { aberto: Boolean(estado.popup && !estado.popup.hidden), fixado: estado.fixado, texto: estado.corpo?.textContent || "" };
}

export function iniciarInfo() {
  document.addEventListener("mouseover", (evento) => {
    const icone = evento.target.closest?.(".info-icone");
    if (!icone || estado.fixado) return;
    if (estado.icone !== icone) abrir(icone);
    else clearTimeout(estado.espera);
  });
  document.addEventListener("mouseout", (evento) => {
    const icone = evento.target.closest?.(".info-icone");
    if (icone && !estado.fixado && !icone.contains(evento.relatedTarget)) agendarFechamento();
  });
  document.addEventListener("focusin", (evento) => {
    const icone = evento.target.closest?.(".info-icone");
    if (icone && !estado.fixado && estado.icone !== icone) abrir(icone);
  });
  document.addEventListener("click", (evento) => {
    const icone = evento.target.closest?.(".info-icone");
    if (icone) {
      evento.preventDefault();
      if (estado.icone === icone && estado.fixado) {
        fecharPopup();
        return;
      }
      if (estado.icone !== icone || !estado.popup || estado.popup.hidden) abrir(icone);
      fixar();
      return;
    }
    if (estado.fixado && estado.popup && !estado.popup.contains(evento.target)) fecharPopup();
  });
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Shift") fixar();
    if (evento.key === "Escape") fecharPopup();
  });
  window.addEventListener("scroll", (evento) => {
    if (!estado.fixado && estado.popup && !estado.popup.contains(evento.target)) fecharPopup();
  }, true);
}
