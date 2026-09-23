/* Recursos compartilhados pelos módulos: toast, modais, logs, tema,
   armazenamento local, pool de concorrência e exportações. */

export const elemento = (id) => document.getElementById(id);

/* Criação de elementos sem montar HTML por string, o que evita injeção
   de marcação vinda de retorno de API ou de arquivo do repositório. */
export function criar(tag, atributos = {}, filhos = []) {
  const alvo = document.createElement(tag);
  Object.entries(atributos).forEach(([chave, valor]) => {
    if (valor === undefined || valor === null || valor === false) return;
    if (chave === "class") alvo.className = valor;
    else if (chave === "texto") alvo.textContent = valor;
    else if (chave === "dados") Object.entries(valor).forEach(([nome, conteudo]) => { alvo.dataset[nome] = conteudo; });
    else if (chave === "aoClicar") alvo.addEventListener("click", valor);
    else if (chave === "aoMudar") alvo.addEventListener("change", valor);
    else if (chave === "aoDigitar") alvo.addEventListener("input", valor);
    else alvo[chave] = valor;
  });
  (Array.isArray(filhos) ? filhos : [filhos]).forEach((filho) => {
    if (filho === null || filho === undefined || filho === false) return;
    alvo.appendChild(typeof filho === "string" ? document.createTextNode(filho) : filho);
  });
  return alvo;
}

export const CHAVES_ARMAZENAMENTO = {
  apiKey: "resolve-tools:apiKey",
  lembrarApiKey: "resolve-tools:lembrarApiKey",
  perfis: "resolve-tools:perfis",
  perfilAtivo: "resolve-tools:perfilAtivo",
  idsResolve: "resolve-tools:ids",
  modoIdentificacao: "resolve-tools:modo",
  tentativas: "resolve-tools:tentativas",
  intervalo: "resolve-tools:intervalo",
  nacional: "resolve-tools:nacional",
  esperaEvento: "resolve-tools:esperaEvento",
  verificarAposResolve: "resolve-tools:verificar",
  verificacoes: "resolve-tools:verificacoes",
  intervaloVerificacao: "resolve-tools:intervaloVerificacao",
  ambienteNacional: "resolve-tools:ambienteNacional",
  usuario: "resolve-tools:usuario",
  tema: "resolve-tools:tema"
};

export const pausar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function textoSeguro(valor) {
  const caixa = document.createElement("div");
  caixa.textContent = String(valor ?? "");
  return caixa.innerHTML;
}

export function aguardarDigitacao(acao, espera = 300) {
  let temporizador = null;
  return (...argumentos) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => acao(...argumentos), espera);
  };
}

/* Converte texto colado em lista de identificadores únicos.
   Aceita quebra de linha, espaço, tabulação, vírgula e ponto e vírgula. */
export function separarIdentificadores(textoBruto) {
  const vistos = new Set();
  const lista = [];
  String(textoBruto || "").split(/[\s;,]+/).forEach((parte) => {
    const identificador = parte.trim();
    if (identificador && !vistos.has(identificador)) {
      vistos.add(identificador);
      lista.push(identificador);
    }
  });
  return lista;
}

export function mostrarAviso(mensagem, tipo = "info", duracao = 4000) {
  const container = elemento("toastContainer");
  if (!container) return;
  const aviso = document.createElement("div");
  aviso.className = `toast ${tipo}`;
  aviso.textContent = mensagem;
  container.appendChild(aviso);
  setTimeout(() => {
    aviso.classList.add("leaving");
    aviso.addEventListener("animationend", () => aviso.remove(), { once: true });
  }, duracao);
}

export function pedirConfirmacao(titulo, mensagem) {
  return new Promise((resolve) => {
    const modal = elemento("confirmModal");
    const botaoOk = elemento("confirmOk");
    const botaoCancelar = elemento("confirmCancel");
    elemento("confirmTitle").textContent = titulo;
    elemento("confirmMessage").textContent = mensagem;
    modal.hidden = false;

    const encerrar = (resposta) => {
      modal.hidden = true;
      botaoOk.onclick = null;
      botaoCancelar.onclick = null;
      modal.onclick = null;
      document.removeEventListener("keydown", aoTeclar);
      resolve(resposta);
    };
    const aoTeclar = (evento) => { if (evento.key === "Escape") encerrar(false); };

    botaoOk.onclick = () => encerrar(true);
    botaoCancelar.onclick = () => encerrar(false);
    modal.onclick = (evento) => { if (evento.target === modal) encerrar(false); };
    document.addEventListener("keydown", aoTeclar);
    botaoOk.focus();
  });
}

const historicoLogs = [];

const classePorNivel = {
  error: "log-error",
  success: "log-success",
  warn: "log-warn"
};

/* O histórico vive em memória porque o painel é remontado a cada troca de
   tela. Assim nada se perde e mensagens emitidas antes da montagem aparecem
   quando o painel entra. */
export function registrarLog(mensagem, nivel = "info") {
  const registro = { horario: new Date().toLocaleTimeString("pt-BR"), mensagem, nivel };
  historicoLogs.push(registro);
  const painel = elemento("logsPanel");
  if (!painel) return;
  painel.appendChild(montarLinhaLog(registro));
  painel.scrollTop = painel.scrollHeight;
  atualizarContadorLogs();
}

function montarLinhaLog({ horario, mensagem, nivel }) {
  const linha = document.createElement("span");
  linha.className = classePorNivel[nivel] || "";
  linha.textContent = `[${horario}] ${mensagem}\n`;
  return linha;
}

function atualizarContadorLogs() {
  const total = historicoLogs.length;
  const noCabecalho = elemento("logCounter");
  if (noCabecalho) noCabecalho.textContent = String(total);
  const noPainel = elemento("logContagemPainel");
  if (noPainel) noPainel.textContent = `${total} registro${total === 1 ? "" : "s"}`;
}

export function restaurarLogs() {
  const painel = elemento("logsPanel");
  if (!painel) return;
  painel.textContent = "";
  const fragmento = document.createDocumentFragment();
  historicoLogs.forEach((registro) => fragmento.appendChild(montarLinhaLog(registro)));
  painel.appendChild(fragmento);
  painel.scrollTop = painel.scrollHeight;
  atualizarContadorLogs();
}

export function limparLogs() {
  historicoLogs.length = 0;
  const painel = elemento("logsPanel");
  if (painel) painel.textContent = "";
  atualizarContadorLogs();
}

export function textoDosLogs() {
  return historicoLogs.map(({ horario, mensagem }) => `[${horario}] ${mensagem}`).join("\n");
}

export function iniciarTema() {
  const salvo = localStorage.getItem(CHAVES_ARMAZENAMENTO.tema);
  if (salvo) document.documentElement.dataset.theme = salvo;
  elemento("themeToggle").addEventListener("click", () => {
    const proximo = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = proximo;
    localStorage.setItem(CHAVES_ARMAZENAMENTO.tema, proximo);
  });
}

/* Identificação simples do consultor, usada nos registros da base e no
   cabeçalho dos logs exportados. Não é autenticação. */
export const identificacao = {
  ler() {
    return localStorage.getItem(CHAVES_ARMAZENAMENTO.usuario) || "";
  },
  gravar(nome) {
    const limpo = String(nome || "").trim();
    if (limpo) localStorage.setItem(CHAVES_ARMAZENAMENTO.usuario, limpo);
    else localStorage.removeItem(CHAVES_ARMAZENAMENTO.usuario);
    atualizarRotuloUsuario();
    return limpo;
  },
  solicitar() {
    return new Promise((resolve) => {
      const modal = elemento("usuarioModal");
      const campo = elemento("usuarioInput");
      const botaoOk = elemento("usuarioOk");
      const botaoCancelar = elemento("usuarioCancel");
      campo.value = identificacao.ler();
      modal.hidden = false;
      campo.focus();

      const encerrar = (valor) => {
        modal.hidden = true;
        botaoOk.onclick = null;
        botaoCancelar.onclick = null;
        modal.onclick = null;
        campo.onkeydown = null;
        document.removeEventListener("keydown", aoTeclar);
        resolve(valor);
      };
      const confirmar = () => {
        const nome = campo.value.trim();
        if (!nome) {
          mostrarAviso("Informe um usuário para continuar.", "error");
          return;
        }
        identificacao.gravar(nome);
        encerrar(nome);
      };
      const aoTeclar = (evento) => { if (evento.key === "Escape") encerrar(""); };

      botaoOk.onclick = confirmar;
      botaoCancelar.onclick = () => encerrar("");
      campo.onkeydown = (evento) => { if (evento.key === "Enter") confirmar(); };
      modal.onclick = (evento) => { if (evento.target === modal) encerrar(""); };
      document.addEventListener("keydown", aoTeclar);
    });
  },
  async garantir() {
    const atual = identificacao.ler();
    if (atual) return atual;
    return identificacao.solicitar();
  }
};

export function atualizarRotuloUsuario() {
  const rotulo = elemento("usuarioChipLabel");
  const distintivo = elemento("curadorAutorBadge");
  const nome = identificacao.ler();
  if (rotulo) rotulo.textContent = nome || "Identificar-se";
  if (distintivo) distintivo.textContent = nome ? `Editando como ${nome}` : "Sem identificação";
}

/* Pool de execução com concorrência ajustável em tempo real.
   A concorrência cai quando a API responde 429 e volta ao normal depois. */
export function criarPoolExecucao(limiteInicial = 5) {
  const controle = {
    limite: limiteInicial,
    limiteMaximo: limiteInicial,
    reduzir() {
      if (controle.limite > 1) {
        controle.limite -= 1;
        registrarLog(`Concorrência reduzida para ${controle.limite} requisição(ões) simultânea(s).`, "warn");
      }
    },
    restaurar() {
      if (controle.limite < controle.limiteMaximo) controle.limite = controle.limiteMaximo;
    },
    async executar(itens, tarefa, deveParar = () => false) {
      let proximo = 0;
      let ativos = 0;
      return new Promise((resolve) => {
        const despachar = () => {
          if (deveParar()) {
            if (ativos === 0) resolve();
            return;
          }
          while (ativos < controle.limite && proximo < itens.length) {
            const posicao = proximo++;
            ativos++;
            Promise.resolve(tarefa(itens[posicao], posicao)).finally(() => {
              ativos--;
              despachar();
            });
          }
          if (ativos === 0 && proximo >= itens.length) resolve();
        };
        if (itens.length === 0) resolve();
        else despachar();
      });
    }
  };
  return controle;
}

export function baixarArquivo(conteudo, nomeArquivo, tipo) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const endereco = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = endereco;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(endereco);
}

export function carimboDeTempo() {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
}

export function montarCsv(cabecalho, linhas) {
  const escapar = (valor) => `"${String(valor ?? "").replace(/"/g, '""')}"`;
  const conteudo = [cabecalho.map(escapar).join(";")];
  linhas.forEach((linha) => conteudo.push(linha.map(escapar).join(";")));
  return "\uFEFF" + conteudo.join("\n");
}

export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copiou = document.execCommand("copy");
    area.remove();
    return copiou;
  }
}

export function lerArquivoTexto(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result || ""));
    leitor.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    leitor.readAsText(arquivo, "UTF-8");
  });
}
