/* Conferência local do JSON de emissão. Cada achado informa de onde vem:
   anexo VI (leiaute e regras de negócio), anexo VII, anexo VIII, lib do
   PlugNotas, script do Nacional ou cálculo feito sobre o próprio JSON.
   Nada sai do navegador. */

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

const FONTES = {
  json: "Especificação do JSON",
  texto: "Conferência do texto informado",
  estrutura: "Conferência da estrutura do JSON",
  calculo: "Cálculo sobre os valores do JSON",
  digito: "Cálculo dos dígitos verificadores",
  retencaoLib: "Lib do PlugNotas (getRetencaoProps.js)",
  anexoVII: "Anexo VII, tabela de indOp",
  anexoVIII: "Anexo VIII, tabela de correlação"
};

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

export function documentoValido(numero) {
  const digitos = String(numero || "").replace(/\D/g, "");
  if (digitos.length === 11) return cpfValido(digitos);
  if (digitos.length === 14) return cnpjValido(digitos);
  return false;
}

function cpfValido(cpf) {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calcular = (tamanho) => {
    let soma = 0;
    for (let posicao = 0; posicao < tamanho; posicao++) soma += Number(cpf[posicao]) * (tamanho + 1 - posicao);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calcular(9) === Number(cpf[9]) && calcular(10) === Number(cpf[10]);
}

function cnpjValido(cnpj) {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const calcular = (tamanho) => {
    const pesos = tamanho === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let posicao = 0; posicao < tamanho; posicao++) soma += Number(cnpj[posicao]) * pesos[posicao];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calcular(12) === Number(cnpj[12]) && calcular(13) === Number(cnpj[13]);
}

export function arredondar(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

export function truncar(valor) {
  return Math.floor((Number(valor) + 1e-9) * 100) / 100;
}

/* Mesma lógica de getTipoRetPisCofinsRtc007 na lib do PlugNotas. */
export function derivarTipoRetencao(retencao) {
  const retido = (grupo) => Number(retencao?.[grupo]?.valor || 0) > 0;
  const pis = retido("pis");
  const cofins = retido("cofins");
  const csll = retido("csll");
  if (pis && cofins && csll) return "3";
  if (pis && cofins && !csll) return "4";
  if (pis && !cofins && !csll) return "5";
  if (!pis && cofins && !csll) return "6";
  if (!pis && cofins && csll) return "7";
  if (!pis && !cofins && csll) return "8";
  if (pis && !cofins && csll) return "9";
  return "0";
}

function achado(severidade, titulo, campo, detalhe, fonte, tags = []) {
  return { severidade, titulo, campo, detalhe, fonte, tags };
}

function criarContexto(dados) {
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
  return { porChave, porJson, porJsonDireto, nomesDaLib, ibscbs: dados.ibscbs || null };
}

function chavesDoJson(contexto, caminhoJson) {
  return (contexto.porJson.get(caminhoJson) || []).map((entrada) => entrada.caminho + entrada.tag);
}

function regraDoAnexo(contexto, chave, codigo) {
  return contexto.porChave.get(chave)?.regras?.find((regra) => regra.codigo === codigo) || null;
}

export function significadoDoCodigo(entrada, codigo) {
  const linha = String(entrada?.descricao || "").split("\n").map((parte) => parte.trim())
    .find((parte) => new RegExp(`^${codigo}\\s*-\\s*`).test(parte));
  return linha ? linha.replace(/;$/, "") : "";
}

/* Caminhos como "servico[].iss.aliquota" viram todos os pontos presentes
   no documento, cada um com o caminho real. */
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

function preenchido(valor) {
  return valor !== undefined && valor !== null && String(valor).trim() !== "";
}

function aplicarRegra(documento, regra) {
  const resultados = [];
  const tags = regra.tags || [];
  const fonte = regra.fonte || "definicoes/regras-validacao.json";
  const registrar = (campo, detalhe) => resultados.push(achado(regra.severidade, regra.titulo, campo, detalhe, fonte, tags));

  if (regra.tipo === "condicional") {
    const relativo = regra.exige.replace(/^.*\[\]\./, "");
    resolverCaminho(documento, regra.campo).forEach(({ valor, caminho }) => {
      const dispara = regra.quandoPreenchido ? preenchido(valor) : (regra.quandoValorEm || []).map(String).includes(String(valor));
      if (!dispara) return;
      const pai = caminho.split(".").slice(0, -1).join(".");
      const base = pai ? resolverCaminho(documento, pai.replace(/\[\d+\]/g, "[]"))
        .find((ponto) => ponto.caminho === pai)?.valor : documento;
      const exigido = relativo.split(".").reduce((atual, parte) => (atual === null || atual === undefined ? atual : atual[parte]), base);
      if (!preenchido(exigido)) registrar(pai ? `${pai}.${relativo}` : relativo, regra.mensagem);
    });
    return resultados;
  }

  if (regra.tipo === "umDeles") {
    resolverCaminho(documento, regra.campo).forEach(({ valor, caminho }) => {
      if (!valor || typeof valor !== "object") return;
      if (!(regra.alternativas || []).some((chave) => preenchido(valor[chave]))) {
        registrar(`${caminho}.${(regra.alternativas || []).join(" ou ")}`, regra.mensagem);
      }
    });
    return resultados;
  }

  const alvos = resolverCaminho(documento, regra.campo);
  if (regra.tipo === "obrigatorio") {
    if (!alvos.some(({ valor }) => preenchido(valor))) registrar(regra.campo, regra.mensagem);
    return resultados;
  }

  alvos.forEach(({ valor, caminho }) => {
    if (!preenchido(valor) || typeof valor === "object") return;
    const texto = String(valor);
    if (regra.tipo === "formato" && !new RegExp(regra.expressao).test(texto)) {
      registrar(caminho, `${regra.mensagem} Valor informado: ${texto}.`);
    }
    if (regra.tipo === "tamanho" && ((regra.minimo && texto.length < regra.minimo) || (regra.maximo && texto.length > regra.maximo))) {
      registrar(caminho, `${regra.mensagem} O valor tem ${texto.length} caracteres.`);
    }
    if (regra.tipo === "faixa") {
      const numero = Number(valor);
      if (!Number.isFinite(numero) || (regra.minimo !== undefined && numero < regra.minimo) || (regra.maximo !== undefined && numero > regra.maximo)) {
        registrar(caminho, `${regra.mensagem} Valor informado: ${texto}.`);
      }
    }
    if (regra.tipo === "enumerado" && !(regra.valores || []).map(String).includes(texto)) {
      registrar(caminho, `${regra.mensagem} Valor informado: ${texto}.`);
    }
    if (regra.tipo === "digitos") {
      const quantidades = [].concat(regra.quantidade);
      const digitos = texto.replace(/\D/g, "");
      if (!quantidades.includes(digitos.length)) {
        registrar(caminho, `${regra.mensagem} O valor informado tem ${digitos.length} dígito(s).`);
      }
    }
  });
  return resultados;
}

export function analisarEmissao(documento, dados = {}) {
  const contexto = criarContexto(dados);
  const achados = [];
  const notas = Array.isArray(documento) ? documento : [documento];

  notas.forEach((nota, posicaoNota) => {
    const prefixo = notas.length > 1 ? `nota[${posicaoNota}].` : "";
    const registrar = (item) => achados.push({ ...item, campo: `${prefixo}${item.campo}` });

    (dados.regras?.regras || []).forEach((regra) => aplicarRegra(nota, regra).forEach(registrar));
    analisarTextos(nota, registrar);
    analisarNomesDeCampo(nota, dados.regras?.apelidos || {}, contexto, registrar);
    analisarTiposTrocados(nota, registrar);
    analisarDocumentosFiscais(nota, contexto, registrar);
    analisarLeiaute(nota, contexto, registrar);

    const servicos = Array.isArray(nota?.servico) ? nota.servico : nota?.servico ? [nota.servico] : [];
    servicos.forEach((servico, posicao) => {
      const caminho = Array.isArray(nota?.servico) ? `servico[${posicao}]` : "servico";
      analisarValores(servico, caminho, registrar);
      analisarRetencoes(servico, caminho, contexto, registrar);
      analisarIss(servico, caminho, contexto, registrar);
      analisarDescricao(servico, caminho, registrar);
    });

    analisarIbsCbs(nota, contexto, registrar);
  });

  return ordenar(achados);
}

const ordemSeveridade = { erro: 0, alerta: 1, informacao: 2 };

function ordenar(achados) {
  const vistos = new Set();
  return achados
    .filter((item) => {
      const chave = `${item.severidade}|${item.titulo}|${item.campo}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .sort((primeiro, segundo) => ordemSeveridade[primeiro.severidade] - ordemSeveridade[segundo.severidade]
      || primeiro.campo.localeCompare(segundo.campo));
}

function analisarTextos(nota, registrar) {
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

function analisarNomesDeCampo(nota, apelidos, contexto, registrar) {
  const entradas = Object.entries(apelidos);
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

function analisarTiposTrocados(nota, registrar) {
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

function analisarDocumentosFiscais(nota, contexto, registrar) {
  percorrerValores(nota, "", (valor, caminho) => {
    if (!/cpfCnpj$|cnpj$|cpf$|inscricaoFederal$/i.test(caminho)) return;
    const digitos = String(valor).replace(/\D/g, "");
    if (!digitos) return;
    const tags = chavesDoJson(contexto, caminho.replace(/\[\d+\]/g, "[]"));
    if (digitos.length !== 11 && digitos.length !== 14) {
      registrar(achado("erro", "Documento com quantidade de dígitos inválida", caminho,
        `O valor tem ${digitos.length} dígitos. CPF tem 11 e CNPJ tem 14.`, FONTES.digito, tags));
      return;
    }
    if (!documentoValido(digitos)) {
      registrar(achado("erro", "Documento com dígito verificador inválido", caminho,
        "O CPF ou CNPJ informado não confere com os dígitos verificadores.", FONTES.digito, tags));
    }
    if (String(valor) !== digitos) {
      registrar(achado("informacao", "Documento com pontuação", caminho, "O documento foi informado com pontuação.", FONTES.texto, tags));
    }
  });
}

/* Confere tamanho e tipo do anexo VI só nos campos que chegam ao XML por
   cópia direta, sem conversão na lib nem no script. */
function analisarLeiaute(nota, contexto, registrar) {
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

function analisarValores(servico, caminhoServico, registrar) {
  const valores = servico?.valor || {};
  const bruto = Number(valores.servico || 0);
  const deducoes = Number(valores.deducoes || 0);
  const desconto = Number(valores.descontoIncondicionado || 0);
  if (bruto > 0 && deducoes + desconto > bruto) {
    registrar(achado("alerta", "Deduções e descontos acima do valor do serviço", `${caminhoServico}.valor`,
      `A soma de deduções (${deducoes.toFixed(2)}) e desconto incondicionado (${desconto.toFixed(2)}) passa o valor do serviço (${bruto.toFixed(2)}).`,
      FONTES.calculo));
  }
  percorrerValores(servico?.valor, `${caminhoServico}.valor`, (valor, caminho) => {
    if (Number.isFinite(Number(valor)) && Number(valor) < 0) {
      registrar(achado("alerta", "Valor negativo", caminho, `O valor informado é ${valor}.`, FONTES.calculo));
    }
  });
}

function analisarRetencoes(servico, caminhoServico, contexto, registrar) {
  const retencao = servico?.retencao;
  if (!retencao) return;
  const baseServico = Number(servico?.valor?.servico || 0);

  ["pis", "cofins", "csll", "irrf", "inss", "cpp"].forEach((tributo) => {
    const grupo = retencao[tributo];
    if (!grupo) return;
    const aliquota = Number(grupo.aliquota || 0);
    const valorInformado = Number(grupo.valor || 0);
    const base = Number(grupo.baseCalculo || retencao.baseCalculo || baseServico || 0);
    const campo = `${caminhoServico}.retencao.${tributo}.valor`;
    const tags = chavesDoJson(contexto, `servico[].retencao.${tributo}.valor`);
    const nome = tributo.toUpperCase();

    if (aliquota > 0 && valorInformado === 0) {
      registrar(achado("alerta", `Alíquota de ${nome} sem valor`, `${caminhoServico}.retencao.${tributo}`,
        "A alíquota foi informada e o valor ficou zerado.", FONTES.calculo, tags));
      return;
    }
    if (aliquota === 0 || base === 0 || valorInformado === 0) return;

    const esperado = (base * aliquota) / 100;
    const comArredondamento = arredondar(esperado);
    const comTruncamento = truncar(esperado);
    const informado = arredondar(valorInformado);
    const conta = `Base ${base.toFixed(2)} vezes ${aliquota}% resulta em ${esperado.toFixed(4)}.`;

    if (Math.abs(informado - comArredondamento) < 0.005 && comArredondamento !== comTruncamento) {
      registrar(achado("informacao", `${nome} calculado com arredondamento`, campo,
        `${conta} O valor enviado usa arredondamento (${comArredondamento.toFixed(2)}). Com truncamento seria ${comTruncamento.toFixed(2)}.`, FONTES.calculo, tags));
    } else if (Math.abs(informado - comTruncamento) < 0.005 && comArredondamento !== comTruncamento) {
      registrar(achado("informacao", `${nome} calculado com truncamento`, campo,
        `${conta} O valor enviado usa truncamento (${comTruncamento.toFixed(2)}). Com arredondamento seria ${comArredondamento.toFixed(2)}.`, FONTES.calculo, tags));
    } else if (Math.abs(informado - comArredondamento) >= 0.005 && Math.abs(informado - comTruncamento) >= 0.005) {
      registrar(achado("erro", `Valor de ${nome} diferente da alíquota`, campo,
        `${conta} Arredondado daria ${comArredondamento.toFixed(2)} e truncado ${comTruncamento.toFixed(2)}, mas foi enviado ${informado.toFixed(2)}.`, FONTES.calculo, tags));
    }
  });

  const pis = Number(retencao.pis?.valor || 0) > 0;
  const cofins = Number(retencao.cofins?.valor || 0) > 0;
  const csll = Number(retencao.csll?.valor || 0) > 0;

  if (csll && (pis || cofins)) {
    const soma = arredondar(Number(retencao.pis?.valor || 0) + Number(retencao.cofins?.valor || 0) + Number(retencao.csll?.valor || 0));
    const entrada = contexto.porChave.get(CHAVES.vRetCSLL);
    const descricao = entrada?.descricao ? `, que o anexo VI descreve como "${entrada.descricao.replace(/\s+/g, " ").trim()}"` : "";
    registrar(achado("informacao", "Soma das contribuições em vRetCSLL no esquema RTC007", `${caminhoServico}.retencao.csll.valor`,
      `Se a conta usa o esquema RTC007, a lib envia em ValorCSLL a soma de PIS, COFINS e CSLL retidos, e o script do Nacional grava esse campo em vRetCSLL${descricao}. Aqui a soma daria ${soma.toFixed(2)}.`,
      "Lib do PlugNotas (getRetencaoProps.js), script do Nacional (LoadEnvio.txt) e anexo VI", [CHAVES.vRetCSLL]));
  }

  const derivado = derivarTipoRetencao(retencao);
  const informado = retencao.tipoRetencaoPisCofinsCSLL;
  const entradaTipo = contexto.porChave.get(CHAVES.tpRetPisCofins);
  const significado = significadoDoCodigo(entradaTipo, derivado);
  const explicacao = significado ? ` No anexo VI: "${significado}".` : "";
  const fonteTipo = "Lib do PlugNotas (getRetencaoProps.js) e anexo VI (tpRetPisCofins)";

  if (preenchido(informado) && String(informado) !== derivado) {
    registrar(achado("alerta", "tipoRetencaoPisCofinsCSLL diferente dos valores retidos", `${caminhoServico}.retencao.tipoRetencaoPisCofinsCSLL`,
      `Pelos valores retidos o código seria ${derivado}.${explicacao} O JSON informa ${informado}, e a lib usa o valor informado quando ele existe.`,
      fonteTipo, [CHAVES.tpRetPisCofins]));
  }
  if (!preenchido(informado) && derivado !== "0") {
    registrar(achado("informacao", "tpRetPisCofins calculado pela lib no esquema RTC007", `${caminhoServico}.retencao`,
      `O campo tipoRetencaoPisCofinsCSLL não foi informado. Se a conta usa o esquema RTC007, a lib calcula o código pelos valores retidos: aqui daria ${derivado}.${explicacao} Fora do RTC007 a lib não envia o campo.`,
      fonteTipo, [CHAVES.tpRetPisCofins]));
  }

  if (servico?.apuracaoPropria && (pis || cofins)) {
    registrar(achado("informacao", "Apuração própria junto com retenção", `${caminhoServico}.apuracaoPropria`,
      "Se a conta usa o esquema RTC007, a lib monta os campos de PIS e COFINS a partir de apuracaoPropria, e não de retencao.", FONTES.retencaoLib));
  }
}

function analisarIss(servico, caminhoServico, contexto, registrar) {
  const iss = servico?.iss;
  if (!iss) {
    registrar(achado("informacao", "Serviço sem o grupo iss", `${caminhoServico}.iss`, "O serviço não tem o grupo iss.", FONTES.estrutura));
    return;
  }
  const aliquota = Number(iss.aliquota || 0);
  const entrada = contexto.porChave.get(CHAVES.pAliq);
  const ligada = entrada?.plugnotas?.json?.includes("servico[].iss.aliquota");

  if (aliquota > 0 && aliquota < 1 && entrada && ligada) {
    registrar(achado("alerta", "Alíquota de ISS possivelmente em fração", `${caminhoServico}.iss.aliquota`,
      `O campo iss.aliquota chega a pAliq, que o anexo VI descreve como "${entrada.titulo}". O valor ${aliquota} nesse campo corresponde a ${aliquota}%.`,
      "Anexo VI (pAliq) e cadeia lib, script e mapeamento", [CHAVES.pAliq]));
  }

  const limite = regraDoAnexo(contexto, CHAVES.pAliq, "E0595");
  if (aliquota > 5 && limite && ligada) {
    registrar(achado("erro", "Alíquota de ISS acima do permitido pelo anexo VI", `${caminhoServico}.iss.aliquota`,
      `Regra E0595: "${limite.regra}" Valor informado: ${aliquota}.`, "Anexo VI, regra E0595 de pAliq", [CHAVES.pAliq]));
  }
}

function analisarDescricao(servico, caminhoServico, registrar) {
  const descricao = servico?.discriminacao;
  if (typeof descricao === "string" && /[\r\n]/.test(descricao)) {
    registrar(achado("informacao", "Descrição com quebra de linha", `${caminhoServico}.discriminacao`, "A descrição contém quebra de linha.", FONTES.texto));
  }
}

function analisarIbsCbs(nota, contexto, registrar) {
  const grupo = nota?.ibscbs;
  const tipo = contexto.porChave.get(CHAVES.tpRetPisCofins);
  const grupoLeiaute = contexto.porChave.get(CHAVES.grupoIbsCbs);

  if (!grupo) {
    if (!tipo?.notas && !grupoLeiaute?.notas) return;
    const trechos = [];
    if (tipo?.notas) trechos.push(`Nas notas de tpRetPisCofins, o anexo VI registra: "${tipo.notas.replace(/\s+/g, " ").trim()}"`);
    if (grupoLeiaute?.notas) trechos.push(`Nas notas do grupo IBSCBS: "${grupoLeiaute.notas.replace(/\s+/g, " ").trim()}"`);
    registrar(achado("alerta", "JSON sem o grupo ibscbs", "ibscbs", trechos.join(" "),
      "Anexo VI, notas de tpRetPisCofins e do grupo IBSCBS", [CHAVES.grupoIbsCbs, CHAVES.tpRetPisCofins]));
    return;
  }

  const tributacao = grupo?.valores?.tributacao;
  if (tributacao && typeof tributacao === "object") {
    [["cst", CHAVES.cstIbsCbs], ["cct", CHAVES.cClassTrib]].forEach(([campo, chave]) => {
      const entrada = contexto.porChave.get(chave);
      if (!preenchido(tributacao[campo]) && entrada) {
        registrar(achado("erro", `${entrada.tag} do IBS e da CBS ausente`, `ibscbs.valores.tributacao.${campo}`,
          `No anexo VI, ${entrada.tag} do grupo gIBSCBS tem ocorrência ${entrada.ocorrencia}.`, `Anexo VI, leiaute de ${entrada.tag}`, [chave]));
      }
    });
  }

  const tabelas = contexto.ibscbs;
  const codigoOperacao = preenchido(grupo.codigoOperacao) ? String(grupo.codigoOperacao).replace(/\D/g, "").padStart(6, "0") : "";
  if (codigoOperacao && tabelas && !tabelas.indOp[codigoOperacao]) {
    registrar(achado("alerta", "indOp fora da tabela do anexo VII", "ibscbs.codigoOperacao",
      `O código ${codigoOperacao} não consta na tabela de indOp do anexo VII.`, FONTES.anexoVII, [CHAVES.cIndOp]));
  }

  const classificacao = preenchido(tributacao?.cct) ? String(tributacao.cct).padStart(6, "0") : "";
  if (codigoOperacao && classificacao && tabelas?.indOp[codigoOperacao]) {
    const existe = tabelas.relacoes.some((relacao) => relacao[4] === codigoOperacao && relacao[6] === classificacao);
    if (!existe) {
      registrar(achado("informacao", "Combinação de indOp e cClassTrib fora da correlação", "ibscbs",
        `A combinação do indOp ${codigoOperacao} com o cClassTrib ${classificacao} não aparece na tabela de correlação do anexo VIII.`,
        FONTES.anexoVIII, [CHAVES.cIndOp, CHAVES.cClassTrib]));
    }
  }

  const destinatario = grupo.destinatario;
  if (destinatario && typeof destinatario === "object" && !preenchido(destinatario.cpfCnpj) && !preenchido(destinatario.codigoEstrangeiro)) {
    registrar(achado("alerta", "Destinatário do IBS e da CBS sem identificação", "ibscbs.destinatario",
      "No anexo VI, CNPJ, CPF, NIF e cNaoNIF do grupo dest aparecem como elementos de escolha (CE) com ocorrência 1-1.",
      "Anexo VI, leiaute do grupo dest", [CHAVES.destCNPJ, CHAVES.destCPF, CHAVES.destNIF, CHAVES.destNaoNIF]));
  }
}
