import { criar, aguardarDigitacao } from "../shared.js";
import { carregarDefinicao } from "../definicoes.js";
import { iconeDaTag, reiniciarIndiceTags } from "../tags.js";
import { montarCartao } from "../componentes.js";
import { resumoDoPlugNotas, temConversao } from "../origem-plugnotas.js";

const POR_PAGINA = 100;
const SEM_FILTRO = "Todas as tags";

export const FILTROS_DO_PLUGNOTAS = {
  preenchidas: { rotulo: "Preenchidas pelo PlugNotas", aceita: (plugnotas) => plugnotas?.situacao === "preenchida" },
  conversao: { rotulo: "Com conversão de valores", aceita: temConversao }
};

export function normalizarBusca(texto) {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function grupoDoCaminho(caminho) {
  const partes = String(caminho || "").split("/").filter(Boolean);
  const dps = partes.indexOf("infDPS");
  if (dps >= 0) return partes[dps + 1] ? `DPS · ${partes[dps + 1]}` : "DPS";
  const nfse = partes.indexOf("infNFSe");
  if (nfse >= 0) return partes[nfse + 1] ? `NFS-e · ${partes[nfse + 1]}` : "NFS-e";
  return "NFS-e";
}

export function filtrarDePara(itens, consulta, filtros = {}) {
  const termos = normalizarBusca(consulta).split(/\s+/).filter(Boolean);
  const primeiro = termos[0] || "";
  const grupos = filtros.grupos || [];
  const criterios = (filtros.plugnotas || []).map((nome) => FILTROS_DO_PLUGNOTAS[nome]?.aceita).filter(Boolean);
  return itens
    .filter((item) => (grupos.length === 0 || grupos.includes(item.grupo))
      && criterios.every((aceita) => aceita(item.entrada.plugnotas))
      && termos.every((termo) => item.busca.includes(termo)))
    .map((item, posicao) => {
      const tag = normalizarBusca(item.entrada.tag);
      const peso = !primeiro ? 2 : tag === primeiro ? 0 : tag.startsWith(primeiro) ? 1 : 2;
      return { item, peso, posicao };
    })
    .sort((primeiroItem, segundo) => primeiroItem.peso - segundo.peso || primeiroItem.posicao - segundo.posicao)
    .map((registro) => registro.item);
}

export function prepararItensDePara(entradas) {
  return entradas.map((entrada) => ({
    entrada,
    grupo: grupoDoCaminho(entrada.caminho),
    busca: normalizarBusca([
      entrada.tag, entrada.titulo, entrada.descricao, `${entrada.caminho}${entrada.tag}`,
      ...(entrada.regras || []).map((regra) => regra.codigo),
      ...(entrada.plugnotas?.json || [])
    ].join(" "))
  }));
}

export async function montarTelaDePara(container) {
  const carregando = criar("p", { class: "field-hint", texto: "Carregando o de-para…" });
  container.appendChild(carregando);
  const dados = await carregarDefinicao("de-para-nacional");
  carregando.remove();

  if (!dados) {
    container.appendChild(criar("p", { class: "aviso-caixa", texto: "Não foi possível carregar o de-para. Confira o log da sessão." }));
    return;
  }

  reiniciarIndiceTags();
  const itens = prepararItensDePara(dados.entradas);
  const grupos = [...new Set(itens.map((item) => item.grupo))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  let visiveis = POR_PAGINA;

  const busca = criar("input", {
    type: "search",
    class: "text-input",
    placeholder: "Busque por tag, descrição, caminho, código de rejeição (ex.: E0580) ou campo do JSON",
    spellcheck: false
  });
  const filtros = montarSeletorDeFiltros(grupos, () => reiniciar());
  const contador = criar("span", { class: "badge badge-neutral" });
  const lista = criar("div", { class: "depara-lista" });
  const botaoMais = criar("button", { type: "button", class: "btn btn-outline", texto: "Mostrar mais", hidden: true });

  const geradoEm = dados.geradoEm ? new Date(dados.geradoEm).toLocaleDateString("pt-BR") : "";
  container.appendChild(montarCartao({}, [
      criar("div", { class: "table-toolbar" }, [busca, filtros.seletor, contador]),
      criar("p", { class: "field-hint", texto: `Passe o mouse no ícone de cada tag para ver as regras de negócio e como o PlugNotas preenche a tag. Shift ou clique fixam o popup. Fonte: ${dados.fontes?.leiaute || "anexo VI"}${geradoEm ? `, gerado em ${geradoEm}` : ""}.` }),
      lista,
      botaoMais
  ]));

  function desenhar() {
    const filtrados = filtrarDePara(itens, busca.value, filtros.escolhidos());
    contador.textContent = `${filtrados.length} ${filtrados.length === 1 ? "tag" : "tags"}`;
    lista.textContent = "";

    if (filtrados.length === 0) {
      lista.appendChild(criar("p", { class: "field-hint", texto: "Nenhuma tag encontrada para essa busca." }));
      botaoMais.hidden = true;
      return;
    }

    const fragmento = document.createDocumentFragment();
    filtrados.slice(0, visiveis).forEach((item) => fragmento.appendChild(montarItemDePara(item.entrada)));
    lista.appendChild(fragmento);
    botaoMais.hidden = filtrados.length <= visiveis;
    botaoMais.textContent = `Mostrar mais (${filtrados.length - visiveis} restantes)`;
  }

  const reiniciar = () => { visiveis = POR_PAGINA; desenhar(); };
  busca.addEventListener("input", aguardarDigitacao(reiniciar, 200));
  botaoMais.addEventListener("click", () => { visiveis += POR_PAGINA; desenhar(); });
  desenhar();
}

function montarSeletorDeFiltros(grupos, aoMudar) {
  const opcao = (tipo, valor, rotulo) => criar("label", { class: "checkbox-row" }, [
    criar("input", { type: "checkbox", value: valor, dados: { tipo } }),
    criar("span", { texto: rotulo })
  ]);
  const resumo = criar("summary", { class: "text-input select-input", texto: SEM_FILTRO });
  const seletor = criar("details", { class: "seletor-multiplo filtro-tipo" }, [
    resumo,
    criar("div", { class: "seletor-multiplo-opcoes" }, [
      criar("p", { class: "seletor-multiplo-titulo", texto: "No PlugNotas" }),
      ...Object.entries(FILTROS_DO_PLUGNOTAS).map(([valor, filtro]) => opcao("plugnotas", valor, filtro.rotulo)),
      criar("p", { class: "seletor-multiplo-titulo", texto: "Grupo" }),
      ...grupos.map((grupo) => opcao("grupo", grupo, grupo))
    ])
  ]);

  const marcadas = () => [...seletor.querySelectorAll("input:checked")];
  const escolhidos = () => ({
    grupos: marcadas().filter((caixa) => caixa.dataset.tipo === "grupo").map((caixa) => caixa.value),
    plugnotas: marcadas().filter((caixa) => caixa.dataset.tipo === "plugnotas").map((caixa) => caixa.value)
  });
  seletor.addEventListener("change", () => {
    const rotulos = marcadas().map((caixa) => caixa.nextSibling.textContent);
    resumo.textContent = rotulos.length === 0 ? SEM_FILTRO : rotulos.length === 1 ? rotulos[0] : `${rotulos.length} filtros`;
    aoMudar();
  });
  seletor.addEventListener("keydown", (evento) => { if (evento.key === "Escape") seletor.open = false; });
  const fecharAoClicarFora = (evento) => {
    if (!seletor.isConnected) {
      document.removeEventListener("click", fecharAoClicarFora);
      return;
    }
    if (seletor.open && !seletor.contains(evento.target)) seletor.open = false;
  };
  document.addEventListener("click", fecharAoClicarFora);
  return { seletor, escolhidos };
}

function montarItemDePara(entrada) {
  const meta = [
    entrada.elemento && entrada.elemento !== "-" ? `Elemento ${entrada.elemento}` : "",
    entrada.tipo && entrada.tipo !== "-" ? `Tipo ${entrada.tipo}` : "",
    entrada.ocorrencia && entrada.ocorrencia !== "-" ? `Ocorrência ${entrada.ocorrencia}` : "",
    entrada.tamanho && entrada.tamanho !== "-" ? `Tamanho ${entrada.tamanho}` : ""
  ].filter(Boolean).join(" · ");

  return criar("article", { class: "depara-item" }, [
    criar("header", {}, [
      criar("code", { class: "tag-nome", texto: entrada.tag }),
      criar("span", { class: "tag-titulo", texto: entrada.titulo }),
      iconeDaTag(entrada)
    ]),
    criar("p", { class: "tag-caminho", texto: `${entrada.caminho}${entrada.tag}` }),
    entrada.plugnotas?.caminhoNoXmlGerado
      ? criar("p", { class: "tag-caminho", texto: `No XML gerado hoje: ${entrada.plugnotas.caminhoNoXmlGerado}` })
      : null,
    meta ? criar("p", { class: "tag-meta", texto: meta }) : null,
    resumoDoPlugNotas(entrada)
  ]);
}
