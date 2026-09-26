import { readFileSync } from "node:fs";
import { achado, FONTES } from "../js/analise/achado.js";
import { percorrerValores, resolverCaminho, preenchido } from "../js/analise/caminhos.js";
import { CHAVES, criarContexto, chavesDoJson, regraDoAnexo, significadoDoCodigo } from "../js/analise/contexto.js";
import { aplicarRegrasDeclarativas } from "../js/analise/regras-declarativas.js";
import { analisarTextos, analisarDescricao } from "../js/analise/texto.js";
import { analisarNomesDeCampo, analisarTiposTrocados } from "../js/analise/campos.js";
import { documentoValido, analisarDocumentosFiscais } from "../js/analise/documentos.js";
import { analisarLeiaute } from "../js/analise/leiaute.js";
import { arredondar, truncar, analisarValores } from "../js/analise/valores.js";
import { derivarTipoRetencao, analisarRetencoes } from "../js/analise/retencoes.js";
import { analisarIss } from "../js/analise/iss.js";
import { analisarIbsCbs } from "../js/analise/ibscbs.js";

let falhas = 0;
const conferir = (titulo, condicao, extra = "") => {
  if (condicao) console.log(`  ok   ${titulo}`);
  else { console.log(`  FALHA ${titulo} ${extra}`); falhas++; }
};

const ler = (nome) => JSON.parse(readFileSync(`./definicoes/${nome}.json`, "utf8"));
const contexto = criarContexto({ regras: ler("regras-validacao"), dePara: ler("de-para-nacional"), ibscbs: ler("ibscbs") });
const daNota = (conferencia, nota) => {
  const achados = [];
  conferencia(nota, contexto, (item) => achados.push(item));
  return achados;
};
const doServico = (conferencia, servico) => {
  const achados = [];
  conferencia(servico, "servico[0]", contexto, (item) => achados.push(item));
  return achados;
};
const resumo = (achados) => achados.map((item) => `[${item.severidade}] ${item.titulo} @${item.campo}`).join(" | ");
const tem = (achados, severidade, titulo, campo) => achados.some((item) => item.severidade === severidade && item.titulo === titulo && item.campo === campo);
const bemFormados = (achados) => achados.every((item) => item.fonte && Array.isArray(item.tags) && item.detalhe);

const servicoLimpo = {
  codigo: "010101", valor: { servico: 1000 }, discriminacao: "Servico de consultoria",
  iss: { aliquota: 2, tipoTributacao: 6, exigibilidade: 1 }
};
const notaLimpa = {
  prestador: { cpfCnpj: "29062609000177", endereco: { codigoCidade: "4115200", cep: "87010000" } },
  tomador: { cpfCnpj: "12345678909", email: "cliente@exemplo.com.br", endereco: { codigoCidade: "4115200", cep: "87010000" } },
  servico: [servicoLimpo],
  ibscbs: { codigoOperacao: "100301", valores: { tributacao: { cst: "000", cct: "000001" } } }
};
const notaLimpaSemIbsCbs = { ...notaLimpa, ibscbs: undefined };

console.log("\n== achado e caminhos ==");
conferir("achado monta o formato comum", JSON.stringify(achado("erro", "T", "c", "d", FONTES.calculo, ["x"]))
  === JSON.stringify({ severidade: "erro", titulo: "T", campo: "c", detalhe: "d", fonte: "Cálculo sobre os valores do JSON", tags: ["x"] }));
const visitados = [];
percorrerValores({ a: [1, { b: "x" }], c: null }, "", (valor, caminho) => visitados.push(`${caminho}=${valor}`));
conferir("percorrerValores visita folhas com o caminho e pula nulos", visitados.join() === "a[0]=1,a[1].b=x", visitados.join());
conferir("resolverCaminho aceita objeto no lugar de lista", resolverCaminho({ servico: { a: 1 } }, "servico[].a").map((ponto) => ponto.caminho).join() === "servico.a");
conferir("preenchido ignora espaço, nulo e indefinido", preenchido(0) && !preenchido("  ") && !preenchido(null) && !preenchido(undefined));

console.log("\n== contexto ==");
conferir("contexto indexa o de-para por chave e por campo do JSON", contexto.porChave.has(CHAVES.pAliq) && chavesDoJson(contexto, "servico[].iss.aliquota").includes(CHAVES.pAliq));
conferir("regraDoAnexo acha a regra pelo código", regraDoAnexo(contexto, CHAVES.pAliq, "E0595")?.regra === "Não é permitido informar alíquota superior a 5%.");
conferir("significadoDoCodigo lê a linha do código na descrição", significadoDoCodigo({ descricao: "1 - Um;\n2 - Dois;" }, "2") === "2 - Dois");
conferir("contexto sem dados não quebra", criarContexto({}).porChave.size === 0 && criarContexto({}).ibscbs === null);

console.log("\n== regras declarativas ==");
const declarativas = daNota(aplicarRegrasDeclarativas, { prestador: { cpfcnpj: "1" }, servico: [{ codigo: "01.01" }] });
conferir("código do serviço fora do formato, com o caminho real da lista", tem(declarativas, "erro", "Código do serviço sem 6 dígitos", "servico[0].codigo"), resumo(declarativas));
conferir("prestador sem CPF ou CNPJ", tem(declarativas, "erro", "CPF ou CNPJ do prestador ausente", "prestador.cpfCnpj"), resumo(declarativas));
conferir("regras declarativas sem achado na nota limpa", daNota(aplicarRegrasDeclarativas, notaLimpa).length === 0, resumo(daNota(aplicarRegrasDeclarativas, notaLimpa)));

console.log("\n== texto ==");
const textos = daNota(analisarTextos, { tomador: { razaoSocial: "Empresa X ", nome: "" } });
conferir("caractere invisível apontado pelo nome", tem(textos, "alerta", "Caractere invisível: espaço não separável (U+00A0)", "tomador.razaoSocial"), resumo(textos));
conferir("espaço nas extremidades e campo vazio", tem(textos, "informacao", "Espaço nas extremidades", "tomador.razaoSocial") && tem(textos, "informacao", "Campo enviado vazio", "tomador.nome"), resumo(textos));
conferir("descrição com quebra de linha", tem(doServico(analisarDescricao, { discriminacao: "a\r\nb" }), "informacao", "Descrição com quebra de linha", "servico[0].discriminacao"));
conferir("texto limpo sem achado", daNota(analisarTextos, notaLimpa).length === 0 && doServico(analisarDescricao, servicoLimpo).length === 0);

console.log("\n== campos ==");
const nomes = daNota(analisarNomesDeCampo, { prestador: { cpfcnpj: "29062609000177" } });
conferir("nome de campo com grafia diferente da lib", tem(nomes, "alerta", "Nome de campo diferente do esperado", "prestador.cpfcnpj"), resumo(nomes));
const tipos = daNota(analisarTiposTrocados, { servico: [{ valor: { servico: "100" } }] });
conferir("número enviado como texto", tem(tipos, "informacao", "Número enviado como texto", "servico[0].valor.servico"), resumo(tipos));
conferir("campos limpos sem achado", daNota(analisarNomesDeCampo, notaLimpa).length === 0 && daNota(analisarTiposTrocados, notaLimpaSemIbsCbs).length === 0,
  resumo([...daNota(analisarNomesDeCampo, notaLimpa), ...daNota(analisarTiposTrocados, notaLimpaSemIbsCbs)]));

console.log("\n== documentos ==");
conferir("documentoValido confere CNPJ e CPF", documentoValido("29062609000177") && !documentoValido("29062609000178") && documentoValido("12345678909") && !documentoValido("11111111111"));
const documentos = daNota(analisarDocumentosFiscais, { prestador: { cpfCnpj: "29062609000178" } });
conferir("dígito verificador inválido", tem(documentos, "erro", "Documento com dígito verificador inválido", "prestador.cpfCnpj"), resumo(documentos));
conferir("documentos válidos sem achado", daNota(analisarDocumentosFiscais, notaLimpa).length === 0);

console.log("\n== leiaute ==");
const leiaute = daNota(analisarLeiaute, { tomador: { email: `${"a".repeat(90)}@x.com` } });
conferir("tamanho fora do leiaute", tem(leiaute, "alerta", "Tamanho fora do leiaute de email", "tomador.email"), resumo(leiaute));
conferir("leiaute limpo sem achado", daNota(analisarLeiaute, notaLimpa).length === 0);

console.log("\n== valores ==");
conferir("arredondar e truncar em duas casas", arredondar(6.505) === 6.51 && truncar(6.509) === 6.5);
const valores = doServico(analisarValores, { valor: { servico: 1000, deducoes: 1200 } });
conferir("deduções acima do valor do serviço", tem(valores, "alerta", "Deduções e descontos acima do valor do serviço", "servico[0].valor"), resumo(valores));
conferir("valores limpos sem achado", doServico(analisarValores, servicoLimpo).length === 0);

console.log("\n== retenções ==");
conferir("derivarTipoRetencao segue a lib", derivarTipoRetencao({ pis: { valor: 1 }, csll: { valor: 1 } }) === "9");
const retencoes = doServico(analisarRetencoes, { retencao: { pis: { aliquota: 0.65, baseCalculo: 1000, valor: 9.99 } } });
conferir("valor de PIS diferente da alíquota", tem(retencoes, "erro", "Valor de PIS diferente da alíquota", "servico[0].retencao.pis.valor"), resumo(retencoes));
conferir("serviço sem retenção sem achado", doServico(analisarRetencoes, servicoLimpo).length === 0);

console.log("\n== ISS ==");
const iss = doServico(analisarIss, { iss: { aliquota: 8 } });
conferir("alíquota acima do anexo VI", tem(iss, "erro", "Alíquota de ISS acima do permitido pelo anexo VI", "servico[0].iss.aliquota"), resumo(iss));
conferir("ISS limpo sem achado", doServico(analisarIss, servicoLimpo).length === 0);

console.log("\n== IBS e CBS ==");
conferir("sem grupo ibscbs", tem(daNota(analisarIbsCbs, { servico: [servicoLimpo] }), "alerta", "JSON sem o grupo ibscbs", "ibscbs"));
const ibscbs = daNota(analisarIbsCbs, { ibscbs: { codigoOperacao: "999999", valores: { tributacao: { cst: "000" } }, destinatario: { razaoSocial: "Y" } } });
conferir("indOp fora do anexo VII, cClassTrib ausente e destinatário sem identificação",
  tem(ibscbs, "alerta", "indOp fora da tabela do anexo VII", "ibscbs.codigoOperacao") && tem(ibscbs, "erro", "cClassTrib do IBS e da CBS ausente", "ibscbs.valores.tributacao.cct")
  && tem(ibscbs, "alerta", "Destinatário do IBS e da CBS sem identificação", "ibscbs.destinatario"), resumo(ibscbs));
conferir("IBS e CBS da correlação sem achado", daNota(analisarIbsCbs, notaLimpa).length === 0, resumo(daNota(analisarIbsCbs, notaLimpa)));

console.log("\n== formato dos achados ==");
const todos = [...declarativas, ...textos, ...nomes, ...tipos, ...documentos, ...leiaute, ...valores, ...retencoes, ...iss, ...ibscbs];
conferir("todo achado de cada módulo traz fonte, detalhe e lista de tags", todos.length > 0 && bemFormados(todos));

console.log(falhas === 0 ? "\nTeste dos módulos do validador passou." : `\n${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
