import { achado, FONTES } from "./achado.js";
import { percorrerValores } from "./caminhos.js";

const INVISIVEIS = {
  "\u00A0": "espaço não separável (U+00A0)",
  "\u200B": "espaço de largura zero (U+200B)",
  "\u200C": "não juntor de largura zero (U+200C)",
  "\u200D": "juntor de largura zero (U+200D)",
  "\uFEFF": "marca de ordem de bytes (U+FEFF)",
  "\u0009": "tabulação",
  "\u000B": "tabulação vertical",
  "\u2028": "separador de linha (U+2028)",
  "\u2029": "separador de parágrafo (U+2029)"
};

export function analisarTextos(nota, registrar) {
  percorrerValores(nota, "", (valor, caminho) => {
    if (typeof valor !== "string") return;
    Object.entries(INVISIVEIS).forEach(([caractere, descricao]) => {
      if (valor.includes(caractere)) {
        registrar(achado("alerta", `Caractere invisível: ${descricao}`, caminho,
          `O valor contém ${descricao}, que não aparece na tela. Confira se ele deveria fazer parte do conteúdo.`, FONTES.texto));
      }
    });
    if (valor.trim() !== "" && valor !== valor.trim()) {
      registrar(achado("informacao", "Espaço nas extremidades", caminho, "O valor começa ou termina com espaço.", FONTES.texto));
    }
    if (valor === "") {
      registrar(achado("informacao", "Campo enviado vazio", caminho, "O campo está presente com texto vazio.", FONTES.texto));
    }
  });
}

export function analisarDescricao(servico, caminhoServico, registrar) {
  const descricao = servico?.discriminacao;
  if (typeof descricao === "string" && /[\r\n]/.test(descricao)) {
    registrar(achado("informacao", "Descrição com quebra de linha", `${caminhoServico}.discriminacao`, "A descrição contém quebra de linha.", FONTES.texto));
  }
}
