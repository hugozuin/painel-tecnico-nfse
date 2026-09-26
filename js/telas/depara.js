import { criar, aguardarDigitacao } from "../shared.js";
import { carregarDefinicao } from "../definicoes.js";
import { iconeDaTag, reiniciarIndiceTags } from "../tags.js";
import { montarCartao } from "../componentes.js";

const POR_PAGINA = 100;

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

export function filtrarDePara(itens, consulta, grupo, somentePlugNotas) {
  const termos = normalizarBusca(consulta).split(/\s+/).filter(Boolean);
  const primeiro = termos[0] || "";
  return itens
    .filter((item) => (!grupo || item.grupo === grupo)
      && (!somentePlugNotas || item.entrada.plugnotas?.tx2?.length)
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
      ...(entrada.plugnotas?.tx2 || []).map((campo) => campo.campo),
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
  const seletorGrupo = criar("select", { class: "text-input select-input filtro-tipo" }, [
    criar("option", { value: "", texto: "Todos os grupos" }),
    ...grupos.map((grupo) => criar("option", { value: grupo, texto: grupo }))
  ]);
  const somentePlugNotas = criar("input", { type: "checkbox" });
  const contador = criar("span", { class: "badge badge-neutral" });
  const lista = criar("div", { class: "depara-lista" });
  const botaoMais = criar("button", { type: "button", class: "btn btn-outline", texto: "Mostrar mais", hidden: true });

  const geradoEm = dados.geradoEm ? new Date(dados.geradoEm).toLocaleDateString("pt-BR") : "";
  container.appendChild(montarCartao({}, [
      criar("div", { class: "table-toolbar" }, [busca, seletorGrupo]),
      criar("div", { class: "table-toolbar" }, [
        criar("label", { class: "checkbox-row" }, [somentePlugNotas, criar("span", { texto: "Somente tags preenchidas pelo PlugNotas" })]),
        contador
      ]),
      criar("p", { class: "field-hint", texto: `Passe o mouse no ícone de cada tag para ver as regras de negócio. Shift ou clique fixam o popup. Fonte: ${dados.fontes?.leiaute || "anexo VI"}${geradoEm ? `, gerado em ${geradoEm}` : ""}.` }),
      lista,
      botaoMais
  ]));

  function desenhar() {
    const filtrados = filtrarDePara(itens, busca.value, seletorGrupo.value, somentePlugNotas.checked);
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
  seletorGrupo.addEventListener("change", reiniciar);
  somentePlugNotas.addEventListener("change", reiniciar);
  botaoMais.addEventListener("click", () => { visiveis += POR_PAGINA; desenhar(); });
  desenhar();
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
    meta ? criar("p", { class: "tag-meta", texto: meta }) : null,
    blocoPlugNotas(entrada)
  ]);
}

function blocoPlugNotas(entrada) {
  const dados = entrada.plugnotas;
  if (!dados) return null;
  const linhas = dados.linhasScript?.length ? `Script do Nacional (LoadEnvio.txt), linha(s) ${dados.linhasScript.join(", ")}` : "";
  const tx2 = (dados.tx2 || []).map((campo) => campo.campo);

  if (tx2.length === 0) {
    return criar("p", { class: "depara-plugnotas depara-sem-tx2", title: linhas, texto: "No PlugNotas: o script grava esta tag sem ler campo do TX2 identificado na análise." });
  }

  const partes = [criar("span", { class: "depara-rotulo", texto: "No PlugNotas" })];
  if (dados.json?.length) {
    partes.push(criar("span", { class: "depara-sub", texto: "JSON" }), ...dados.json.map((campo) => criar("code", { class: "campo-json", texto: campo })));
  }
  partes.push(criar("span", { class: "depara-sub", texto: "TX2" }), ...tx2.map((campo) => criar("code", { class: "campo-tx2", texto: campo })));
  if (!dados.json?.length) {
    partes.push(criar("span", { class: "depara-aviso", texto: "campo do JSON não identificado nas fontes analisadas" }));
  }
  return criar("div", { class: "depara-plugnotas", title: linhas }, partes);
}
