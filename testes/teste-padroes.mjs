import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};

const listarArquivos = (pasta, extensao) => readdirSync(pasta).flatMap((nome) => {
  const caminho = path.join(pasta, nome).replaceAll("\\", "/");
  if (statSync(caminho).isDirectory()) return listarArquivos(caminho, extensao);
  return caminho.endsWith(extensao) ? [caminho] : [];
});

const PODE_PRECEDER_EXPRESSAO_REGULAR = /[=(,:!&|?{};[\n]\s*$|\breturn\s*$/;

function acharComentarios(texto) {
  const achados = [];
  let posicao = 0;
  let aspas = null;
  while (posicao < texto.length) {
    const caractere = texto[posicao];
    if (aspas) {
      if (caractere === "\\") posicao += 2;
      else {
        if (caractere === aspas) aspas = null;
        posicao++;
      }
      continue;
    }
    if (caractere === "\"" || caractere === "'" || caractere === "`") {
      aspas = caractere;
      posicao++;
      continue;
    }
    if (caractere === "/" && (texto[posicao + 1] === "*" || texto[posicao + 1] === "/")) {
      achados.push(texto.slice(0, posicao).split("\n").length);
      const fim = texto[posicao + 1] === "*" ? texto.indexOf("*/", posicao + 2) + 2 : texto.indexOf("\n", posicao);
      posicao = fim <= 0 ? texto.length : fim;
      continue;
    }
    if (caractere === "/" && PODE_PRECEDER_EXPRESSAO_REGULAR.test(texto.slice(Math.max(0, posicao - 20), posicao))) {
      let fim = posicao + 1;
      let dentroDeClasse = false;
      while (fim < texto.length && texto[fim] !== "\n" && (texto[fim] !== "/" || dentroDeClasse)) {
        if (texto[fim] === "\\") fim++;
        else if (texto[fim] === "[") dentroDeClasse = true;
        else if (texto[fim] === "]") dentroDeClasse = false;
        fim++;
      }
      posicao = fim + 1;
      continue;
    }
    posicao++;
  }
  return achados;
}

console.log("\n== sem comentários no código (CLAUDE.md, seção 7) ==");
const exemplosComComentario = ["const a = 1; /* explica */", "// explica\nconst a = 1;", "const a = 1; // explica"];
const exemplosSemComentario = [
  'const url = "https://api.exemplo.invalid/x";',
  'const aceita = "application/json, */*";',
  "const padrao = /\\/\\/|\\/\\*/g;",
  "const caminho = texto.split(/[/\\\\]/);",
  "const divisao = total / partes / 2;"
];
conferir("controle: acusa bloco e linha de comentário", exemplosComComentario.every((exemplo) => acharComentarios(exemplo).length === 1));
conferir("controle: não confunde URL, string, expressão regular e divisão", exemplosSemComentario.every((exemplo) => acharComentarios(exemplo).length === 0),
  JSON.stringify(exemplosSemComentario.filter((exemplo) => acharComentarios(exemplo).length)));
for (const pasta of ["js", "api"]) {
  const comComentario = listarArquivos(pasta, ".js").flatMap((arquivo) =>
    acharComentarios(readFileSync(arquivo, "utf8").replace(/\r\n/g, "\n")).map((linha) => `${arquivo}:${linha}`));
  conferir(`sem comentários em ${pasta}/`, comComentario.length === 0, comComentario.join(", "));
}
const estilos = readFileSync("styles.css", "utf8");
const comentariosNoCss = [...estilos.matchAll(/\/\*/g)].map((achado) => estilos.slice(0, achado.index).split("\n").length);
conferir("sem comentários em styles.css", comentariosNoCss.length === 0, comentariosNoCss.join(", "));
conferir("atributo hidden vence o display das classes", /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(estilos));

console.log(falhas === 0 ? "\nTeste de padrões passou." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
