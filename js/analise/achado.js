export const FONTES = {
  json: "Especificação do JSON",
  texto: "Conferência do texto informado",
  estrutura: "Conferência da estrutura do JSON",
  calculo: "Cálculo sobre os valores do JSON",
  digito: "Cálculo dos dígitos verificadores",
  retencaoLib: "Lib do PlugNotas (getRetencaoProps.js)",
  anexoVII: "Anexo VII, tabela de indOp",
  anexoVIII: "Anexo VIII, tabela de correlação"
};

export function achado(severidade, titulo, campo, detalhe, fonte, tags = []) {
  return { severidade, titulo, campo, detalhe, fonte, tags };
}
