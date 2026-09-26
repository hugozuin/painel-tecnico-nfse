import { pausar } from "../../shared.js";
import { requisitar } from "../../plugnotas.js";

export async function executarItemAItem({ rota, contexto, estado, itens, dados, credencial, aoResponder, aoAvancar }) {
  let concluidos = 0;

  await estado.pool.executar(itens, async (item, posicao) => {
    const alvo = montarEndereco(rota, contexto, item, dados);
    const resposta = await requisitar({
      ...prepararPedido(rota, contexto, alvo),
      apiKey: credencial,
      sessao: estado.sessao,
      comoBlob: rota.resultado?.tipo === "arquivo"
    });

    aoResponder({ item, resposta: { ...resposta, destino: alvo.url }, posicao });
    concluidos++;
    aoAvancar(Math.round((concluidos / itens.length) * 100));
    if (rota.sensivel) await pausar(150);
  }, () => estado.sessao.cancelada);
}

export async function executarConjunto({ rota, contexto, estado, itens, dados, credencial }) {
  const alvo = montarEndereco(rota, contexto, "", dados);
  const resposta = await requisitar({
    ...prepararPedido(rota, contexto, { ...alvo, corpo: itens }),
    apiKey: credencial,
    sessao: estado.sessao
  });
  return { resposta, destino: alvo.url };
}

export function montarEndereco(rota, contexto, item, dados) {
  let caminho = rota.caminho;
  caminho = caminho.replace("{item}", encodeURIComponent(item));
  Object.entries(dados.caminho).forEach(([chave, valor]) => {
    caminho = caminho.replace(`{${chave}}`, encodeURIComponent(valor));
  });

  const consulta = new URLSearchParams(dados.consulta);
  if (rota.parametroItem && item) {
    const [, chave] = rota.parametroItem.split(".");
    consulta.set(chave, item);
  }

  const base = contexto.base(rota);
  const url = `${base}${caminho}${consulta.toString() ? `?${consulta}` : ""}`;
  const semCorpo = (rota.metodo || "GET") === "GET" || Object.keys(dados.corpo).length === 0;
  const corpo = semCorpo ? undefined : dados.corpo;

  return { url, corpo };
}

export function prepararPedido(rota, contexto, alvo) {
  if (contexto.prepararPedido) return contexto.prepararPedido(alvo, rota);
  return { url: alvo.url, metodo: rota.metodo || "GET", corpo: alvo.corpo };
}
