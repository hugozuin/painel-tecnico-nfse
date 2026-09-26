import { criar } from "./shared.js";
import { iconeInfo, conteudoDoPopup, secaoDoPopup, fonteDoPopup } from "./info.js";
import { definicoes } from "./definicoes.js";

let indice = null;

function chaveDaTag(entrada) {
  return `${entrada.caminho}${entrada.tag}`;
}

export function reiniciarIndiceTags() {
  indice = null;
}

export function entradaPorChave(chave) {
  if (!definicoes.dePara) return null;
  if (!indice) indice = new Map(definicoes.dePara.entradas.map((entrada) => [chaveDaTag(entrada), entrada]));
  return indice.get(chave) || null;
}

function conteudoDaTag(entrada) {
  const regras = entrada.regras || [];
  const blocos = [
    criar("h4", { texto: regras.length ? `Regras de negócio (${regras.length})` : "Regras de negócio" })
  ];

  if (regras.length === 0) {
    blocos.push(criar("p", { class: "popup-vazio", texto: "O anexo VI não traz regra de negócio para esta tag." }));
  }

  regras.forEach((regra) => {
    const detalhes = [regra.aplicacao, regra.efeito, regra.nivel ? `Nível ${regra.nivel}` : ""].filter(Boolean).join(" · ");
    blocos.push(criar("div", { class: "popup-regra" }, [
      criar("div", { class: "popup-regra-topo" }, [
        regra.codigo ? criar("span", { class: "badge badge-info", texto: regra.codigo }) : null,
        detalhes ? criar("span", { class: "popup-regra-detalhes", texto: detalhes }) : null
      ]),
      criar("p", { class: "popup-texto", texto: regra.regra }),
      regra.mensagem ? criar("p", { class: "popup-mensagem", texto: `Mensagem: ${regra.mensagem}` }) : null,
      regra.observacao ? criar("p", { class: "popup-mensagem", texto: `Observação: ${regra.observacao}` }) : null,
      regra.caminhoNaAbaDeRegras
        ? criar("p", { class: "popup-nota", texto: `Na aba de regras do anexo o caminho aparece como ${regra.caminhoNaAbaDeRegras}` })
        : null
    ]));
  });

  if (entrada.descricao) blocos.push(...secaoDoPopup("Descrição", entrada.descricao));
  if (entrada.notas) blocos.push(...secaoDoPopup("Notas explicativas", entrada.notas));
  blocos.push(fonteDoPopup(definicoes.dePara?.fontes?.leiaute || "anexo VI"));
  return conteudoDoPopup([criar("code", { texto: entrada.tag }), ` ${entrada.titulo}`], blocos);
}

export function iconeDaTag(entrada) {
  const quantidade = (entrada.regras || []).length;
  return iconeInfo(
    `tag:${chaveDaTag(entrada)}`,
    () => conteudoDaTag(entrada),
    `Regras de negócio de ${entrada.tag}`,
    quantidade ? String(quantidade) : ""
  );
}

export function chipDaTag(chave) {
  const entrada = entradaPorChave(chave);
  if (!entrada) return criar("span", { class: "tag-xml", texto: chave.split("/").pop() });
  return criar("span", { class: "tag-xml", title: entrada.titulo }, [criar("span", { texto: entrada.tag }), iconeDaTag(entrada)]);
}
