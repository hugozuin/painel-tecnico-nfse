import { achado, FONTES } from "./achado.js";
import { percorrerValores } from "./caminhos.js";

export function analisarNomesDeCampo(nota, contexto, registrar) {
  const entradas = Object.entries(contexto.apelidos);
  if (entradas.length === 0) return;
  const visitar = (valor, caminho) => {
    if (!valor || typeof valor !== "object") return;
    if (Array.isArray(valor)) {
      valor.forEach((item, indice) => visitar(item, `${caminho}[${indice}]`));
      return;
    }
    Object.keys(valor).forEach((chave) => {
      const correto = entradas.find(([errado]) => errado === chave)?.[1];
      if (correto) {
        const confirmado = contexto.nomesDaLib.has(correto);
        registrar(achado("alerta", "Nome de campo diferente do esperado", `${caminho ? `${caminho}.` : ""}${chave}`,
          confirmado
            ? `A lib do PlugNotas lê este dado com o nome ${correto}.`
            : `A lista de apelidos da ferramenta indica o nome ${correto}.`,
          confirmado ? "Lib do PlugNotas (campos lidos pelas props do Nacional)" : "definicoes/regras-validacao.json"));
      }
      visitar(valor[chave], caminho ? `${caminho}.${chave}` : chave);
    });
  };
  visitar(nota, "");
}

export function analisarTiposTrocados(nota, contexto, registrar) {
  percorrerValores(nota, "", (valor, caminho) => {
    if (typeof valor !== "string") return;
    if (/valor|aliquota|base|desconto|deducoes/i.test(caminho)) {
      if (/^\d+,\d+$/.test(valor)) {
        registrar(achado("alerta", "Número com vírgula decimal", caminho,
          `Em JSON o número usa ponto como separador decimal. Entre aspas e com vírgula, "${valor}" é um texto.`, FONTES.json));
      } else if (/^\d+(\.\d+)?$/.test(valor)) {
        registrar(achado("informacao", "Número enviado como texto", caminho, `O valor ${valor} está entre aspas, então é um texto no JSON.`, FONTES.json));
      }
    }
    if (/retido|simplesNacional|incentiv|reenvio/i.test(caminho) && /^(true|false)$/i.test(valor)) {
      registrar(achado("informacao", "Booleano enviado como texto", caminho, `O valor ${valor} está entre aspas, então é um texto no JSON.`, FONTES.json));
    }
  });
}
