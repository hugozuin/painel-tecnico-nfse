import { achado } from "./achado.js";
import { percorrerValores } from "./caminhos.js";

export function analisarLeiaute(nota, contexto, registrar) {
  if (contexto.porJsonDireto.size === 0) return;
  percorrerValores(nota, "", (valor, caminho) => {
    if (typeof valor !== "string" && typeof valor !== "number") return;
    const entradas = contexto.porJsonDireto.get(caminho.replace(/\[\d+\]/g, "[]")) || [];
    const texto = String(valor);
    entradas.forEach((entrada) => {
      const chave = entrada.caminho + entrada.tag;
      const fonte = `Anexo VI, leiaute de ${entrada.tag}`;
      const faixa = String(entrada.tamanho).match(/^(\d+)(?:-(\d+))?$/);
      if (faixa) {
        const minimo = faixa[2] ? Number(faixa[1]) : 0;
        const maximo = Number(faixa[2] || faixa[1]);
        if (texto.length > maximo || (texto.length > 0 && texto.length < minimo)) {
          registrar(achado("alerta", `Tamanho fora do leiaute de ${entrada.tag}`, caminho,
            `O anexo VI define ${entrada.tag} com tamanho ${entrada.tamanho}. O valor informado tem ${texto.length} caractere(s).`, fonte, [chave]));
        }
      }
      if (entrada.tipo === "N" && /\D/.test(texto)) {
        registrar(achado("alerta", `Conteúdo não numérico em ${entrada.tag}`, caminho,
          `O anexo VI define ${entrada.tag} como numérico (tipo N), e o valor informado tem caracteres que não são dígitos.`, fonte, [chave]));
      }
    });
  });
}
