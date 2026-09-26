const RAIZ = "NFSe/infNFSe/DPS/infDPS/";
export const CHAVES = {
  pAliq: `${RAIZ}valores/trib/tribMun/pAliq`,
  vRetCSLL: `${RAIZ}valores/trib/tribFed/vRetCSLL`,
  tpRetPisCofins: `${RAIZ}valores/trib/tribFed/piscofins/tpRetPisCofins`,
  grupoIbsCbs: `${RAIZ}IBSCBS`,
  cIndOp: `${RAIZ}IBSCBS/cIndOp`,
  cstIbsCbs: `${RAIZ}IBSCBS/valores/trib/gIBSCBS/CST`,
  cClassTrib: `${RAIZ}IBSCBS/valores/trib/gIBSCBS/cClassTrib`,
  destCNPJ: `${RAIZ}IBSCBS/dest/CNPJ`,
  destCPF: `${RAIZ}IBSCBS/dest/CPF`,
  destNIF: `${RAIZ}IBSCBS/dest/NIF`,
  destNaoNIF: `${RAIZ}IBSCBS/dest/cNaoNIF`
};

export function criarContexto(dados) {
  const entradas = dados.dePara?.entradas || [];
  const porChave = new Map(entradas.map((entrada) => [entrada.caminho + entrada.tag, entrada]));
  const porJson = new Map();
  const porJsonDireto = new Map();
  const nomesDaLib = new Set();
  const acrescentar = (mapa, caminho, entrada) => {
    if (!mapa.has(caminho)) mapa.set(caminho, []);
    mapa.get(caminho).push(entrada);
  };
  entradas.forEach((entrada) => {
    (entrada.plugnotas?.json || []).forEach((caminho) => {
      acrescentar(porJson, caminho, entrada);
      caminho.split(".").forEach((parte) => nomesDaLib.add(parte.replace("[]", "")));
    });
    (entrada.plugnotas?.jsonCopiaDireta || []).forEach((caminho) => acrescentar(porJsonDireto, caminho, entrada));
  });
  return {
    porChave, porJson, porJsonDireto, nomesDaLib, ibscbs: dados.ibscbs || null,
    regrasDeclarativas: dados.regras?.regras || [], apelidos: dados.regras?.apelidos || {}
  };
}

export function chavesDoJson(contexto, caminhoJson) {
  return (contexto.porJson.get(caminhoJson) || []).map((entrada) => entrada.caminho + entrada.tag);
}

export function regraDoAnexo(contexto, chave, codigo) {
  return contexto.porChave.get(chave)?.regras?.find((regra) => regra.codigo === codigo) || null;
}

export function significadoDoCodigo(entrada, codigo) {
  const linha = String(entrada?.descricao || "").split("\n").map((parte) => parte.trim())
    .find((parte) => new RegExp(`^${codigo}\\s*-\\s*`).test(parte));
  return linha ? linha.replace(/;$/, "") : "";
}
