export function percorrerValores(valor, caminho, visitante) {
  if (valor === null || valor === undefined) return;
  if (Array.isArray(valor)) {
    valor.forEach((item, indice) => percorrerValores(item, `${caminho}[${indice}]`, visitante));
    return;
  }
  if (typeof valor === "object") {
    Object.entries(valor).forEach(([chave, conteudo]) => percorrerValores(conteudo, caminho ? `${caminho}.${chave}` : chave, visitante));
    return;
  }
  visitante(valor, caminho);
}

export function resolverCaminho(documento, caminho) {
  let pontos = [{ valor: documento, caminho: "" }];
  caminho.split(".").forEach((parte) => {
    const lista = parte.endsWith("[]");
    const chave = lista ? parte.slice(0, -2) : parte;
    const proximos = [];
    pontos.forEach(({ valor, caminho: trilha }) => {
      if (valor === null || valor === undefined || typeof valor !== "object") return;
      const conteudo = valor[chave];
      if (conteudo === undefined) return;
      const novaTrilha = trilha ? `${trilha}.${chave}` : chave;
      if (lista) {
        const itens = Array.isArray(conteudo) ? conteudo : [conteudo];
        itens.forEach((item, indice) => proximos.push({ valor: item, caminho: Array.isArray(conteudo) ? `${novaTrilha}[${indice}]` : novaTrilha }));
        return;
      }
      proximos.push({ valor: conteudo, caminho: novaTrilha });
    });
    pontos = proximos;
  });
  return pontos;
}

export function preenchido(valor) {
  return valor !== undefined && valor !== null && String(valor).trim() !== "";
}
