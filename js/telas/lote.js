import { mostrarAviso, pedirConfirmacao, registrarLog, criarPoolExecucao } from "../shared.js";
import { criarSessaoRequisicoes } from "../plugnotas.js";
import { montarCartaoRequisicao, lerPedidoDaTela, travarRequisicao, rotuloAcao } from "./lote/entrada.js";
import { executarItemAItem, executarConjunto } from "./lote/execucao.js";
import { montarCartaoRetorno, prepararTabela, registrarResultado, registrarConjunto } from "./lote/retorno.js";

export { textoDoRetorno } from "./lote/retorno.js";

export function montarTelaRota(container, rota, contexto) {
  const estado = {
    sessao: criarSessaoRequisicoes(),
    pool: criarPoolExecucao(contexto.concorrencia || 5),
    executando: false,
    linhas: [],
    registros: []
  };

  const requisicao = montarCartaoRequisicao(rota, contexto);
  const retorno = montarCartaoRetorno(rota, estado, rotuloAcao(rota));
  container.appendChild(requisicao.cartao);
  container.appendChild(retorno.cartao);

  requisicao.botaoExecutar.addEventListener("click", () => executar());
  requisicao.botaoCancelar.addEventListener("click", () => {
    if (!estado.executando) return;
    estado.sessao.cancelar();
    registrarLog(`${rota.titulo}: cancelamento solicitado.`, "warn");
  });

  async function executar() {
    if (estado.executando) return;
    const pedido = lerPedidoDaTela(rota, contexto, requisicao);
    if (!pedido) return;
    const formulario = requisicao.entrada.tipo === "formulario";

    if (rota.confirmar) {
      const quantidade = formulario ? "" : ` Itens informados: ${pedido.itens.length}.`;
      const confirmou = await pedirConfirmacao(rota.titulo, `${rota.confirmar}${quantidade}`);
      if (!confirmou) return;
    }

    estado.sessao.reiniciar();
    estado.registros = [];
    estado.linhas = [];
    estado.executando = true;
    travarRequisicao(requisicao, true);
    retorno.area.textContent = "";

    registrarLog(`${rota.titulo}: iniciando com ${formulario ? "1 requisição" : `${pedido.itens.length} item(ns)`}.`);

    if (requisicao.entrada.tipo === "lote-conjunto") await executarLoteConjunto(pedido);
    else await executarLoteItemAItem(pedido);

    estado.executando = false;
    travarRequisicao(requisicao, false);
    retorno.botaoExportar.disabled = estado.registros.length === 0;
    if (!estado.sessao.cancelada) mostrarAviso(`${rota.titulo} concluída.`, "success");
  }

  async function executarLoteItemAItem({ itens, dados, credencial }) {
    const tabela = rota.resultado?.tipo === "tabela" ? prepararTabela(retorno.area, rota, estado, itens) : null;
    await executarItemAItem({
      rota, contexto, estado, itens, dados, credencial,
      aoResponder: (resultado) => registrarResultado({ rota, estado, area: retorno.area, tabela }, resultado),
      aoAvancar: (percentual) => { requisicao.barraProgresso.style.width = `${percentual}%`; }
    });
  }

  async function executarLoteConjunto({ itens, dados, credencial }) {
    const resultado = await executarConjunto({ rota, contexto, estado, itens, dados, credencial });
    requisicao.barraProgresso.style.width = "100%";
    registrarConjunto({ rota, estado, area: retorno.area }, `${itens.length} item(ns) enviados`, resultado);
  }
}
