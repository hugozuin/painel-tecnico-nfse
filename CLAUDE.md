# CLAUDE.md · Painel Técnico NFS-e

Instruções permanentes do projeto para o Claude Code, válidas em toda sessão.

- As tarefas chegam por mensagem do Hugo. Faça só o que foi pedido.
- O código mostra o estado atual; as decisões da seção 8 mostram a intenção. Se
  os dois divergirem, pergunte antes de mudar comportamento.
- Não altere comportamento visível nem decisões da seção 8 sem aprovação. Se
  uma tarefa exigir, descreva a proposta e pergunte.
- Escreva tudo em português: código, textos da interface, mensagens de commit,
  documentação e respostas.

## 1. Resumo do projeto

O Painel Técnico NFS-e é a ferramenta interna da Consultoria Técnica NFS-e da
TecnoSpeed (produto PlugNotas), criada e mantida por Hugo Zuin, consultor
técnico. Antes se chamava "Consulta e Sincronização de Notas | Rota Resolve".

Objetivos:

1. Executar em lote as rotas da API PlugNotas usadas no suporte: resolve,
   consultas, XML e PDF, e-mail, cancelamento, eventos, sincronização,
   interrupção, empresa, webhook e certificado.
2. Consultar o Ambiente Nacional da NFS-e (ADN e Sefin) por um repasse próprio,
   com o certificado A1 do consultor, que o ADN e a Sefin exigem na conexão.
3. Explicar o XML do Nacional: de-para das tags do anexo VI com regras de
   negócio e o campo do PlugNotas que preenche cada tag.
4. Relacionar item da LC 116, NBS, indOp e cClassTrib (anexos VII e VIII) para
   IBS e CBS.
5. Validar o JSON de emissão antes do envio, citando a fonte de cada achado.

Público: consultores internos. Não é produto para cliente final.

| Item | Valor |
|---|---|
| Pasta local | `C:\Users\Hugo\Documents\painel-tecnico-nfse` |
| Repositório (privado) | https://github.com/hugozuin/painel-tecnico-nfse |
| Publicação | Vercel, deploy automático a cada commit no `main`; site aberto, sem login |
| Governança | Aplicação crítica pelas políticas corporativas; ficha, checklist, dados, operação e exceções em `docs/governanca/` |
| Documentação da API | https://docs.plugnotas.com.br (só renderiza com JavaScript) |

## 2. Comandos

```bash
# testes (uma vez: cd testes && npm install; e git config core.hooksPath .githooks,
# para o push rodar o npm test antes de enviar)
cd testes && npm test
cd testes && npm run test:detalhes

# CSP e SRI num Chrome ou Edge real, com os cabeçalhos do vercel.json (fora do npm test;
# exige internet: faz uma consulta à API PlugNotas com chave fictícia, que volta 401)
cd testes && npm run verificar:csp

# certificados de teste (o npm test já chama; só para rodar uma suíte sozinha pela primeira vez)
node testes/gerar-certificados.mjs

# depois do deploy: saúde e cabeçalhos da produção
curl -s https://<domínio>/api/saude && curl -sI https://<domínio>/

# conferência dos dados contra as planilhas dos anexos (Python 3.10+ e openpyxl)
python testes/teste_fontes.py

# ferramentas do de-para com fixtures sintéticas (Python e Node)
python testes/teste_gerador.py

# prova de que as fixtures não copiam os insumos internos (só na máquina com os insumos)
python testes/conferir_fixtures.py --insumos <pasta dos insumos>

# servidor local estático (as consultas do Nacional não funcionam: dependem da função api/proxy)
npx serve -l 3500 .

# servidor local com a função do repasse (exige login e vínculo na CLI da Vercel)
npx vercel dev

# regenerar de-para e tabelas do IBS e da CBS (Node precisa estar instalado)
python ferramentas/gerar_definicoes.py --anexos fontes/nacional --api <api.json> \
  --lib <pasta props> --rps <getRps.js> --script <LoadEnvio.txt> --mapeamento <Mapping.txt> \
  --notas <pasta com pares de notas> --saida definicoes

# regenerar o manual em PDF (reportlab e svglib)
python ferramentas/gerar_manual.py
```

`iniciar.bat` sobe o servidor estático no Windows e fica fora do Git
(`.gitignore`). Sem `--lib`, o gerador produz só o lado do Nacional. Sem
`--notas`, vale o último `ferramentas/conferencia-notas.json`. O `api.json` é
público: baixar de `https://docs.plugnotas.com.br/api.json`.

## 3. Stack e dependências

- **Front-end:** HTML, CSS e JavaScript em módulos ES, sem framework e sem etapa
  de build. `index.html` carrega `js/app.js`.
- **Funções serverless:** `api/proxy.js` (repasse) e `api/saude.js` (saúde)
  na Vercel, região `gru1` (`regions` do `vercel.json`), Node `24.x` (campo
  `engines` do `package.json`; a Vercel descontinua o Node 20 para builds e
  funções em 01/10/2026).
- **Biblioteca no navegador:** node-forge 1.4.0 vendorizado em
  `assets/vendor/forge-1.4.0.min.js` (licença em `forge-1.4.0-LICENSE.txt`), carregado
  sob demanda com SRI (`BIBLIOTECA_FORGE` em `js/certificado.js`) só para ler o
  certificado A1. Nada vem de CDN. Para atualizar: trocar o arquivo e o nome com
  a nova versão, a versão em `testes/package.json` e rodar `npm install` em
  `testes/` (o teste compara o arquivo vendorizado com o do `node_modules`), a
  integridade em `BIBLIOTECA_FORGE`, o SHA-256 em `testes/teste-seguranca.mjs`
  e o nome da licença (`forge-<versão>-LICENSE.txt`). O
  `.gitattributes` impede a conversão de fim de linha em `assets/vendor/` e nos
  PDFs, que mudaria o hash num clone com `core.autocrlf=true`.
- **Fonte:** Quicksand v37 vendorizada em `assets/vendor/quicksand-v37-latin.woff2`
  e `quicksand-v37-latin-ext.woff2` (fonte variável, pesos 400 a 700), licença em
  `quicksand-v37-OFL.txt`, declarada no topo do `styles.css` e pré-carregada no
  `index.html`. Nada vem do Google Fonts.
- **Dados:** JSON versionados em `definicoes/`. Sem banco de dados.
- **Ferramentas (fora do site):** Python com openpyxl no gerador, que também
  chama o Node para executar as props da lib (`executar_lib.cjs`); reportlab e
  svglib no manual.
- **Testes:** Node com jsdom 30.1.0 e node-forge 1.4.0 (`testes/package.json`);
  Python com openpyxl em `testes/teste_fontes.py`.
- **Hospedagem:** Vercel, Framework Preset "Other", sem comando de build e sem
  variáveis de ambiente. Deployment Protection com Vercel Authentication em
  **Standard Protection**: produção aberta e prévias de outros branches
  protegidas. `assets/vendor/` sai com cache imutável de um ano, por isso todo
  arquivo ali leva a versão no nome (há teste).

Restrições de arquitetura definidas pelo Hugo: sem MongoDB, PostgreSQL ou AWS;
deploy simples na web; backend só o mínimo necessário (hoje, o repasse).

## 4. Estrutura do repositório

```
index.html              estrutura, cabeçalho (Logs, Documentação, tema), menu lateral com o logo, modais, painel de logs
styles.css              padrão visual do design system da TecnoSpeed: tema claro e escuro com tokens da marca (índigo, Quicksand)
assets/                 logo.svg e logoicon.svg (brancos), favicon.svg (fundo índigo); logoicon.svg não é usado
                        pelo site e fica como arquivo-fonte da identidade
assets/vendor/          forge-1.4.0.min.js, quicksand-v37-*.woff2 e as licenças, todos com a versão no nome
js/app.js               catálogo de telas, menu, título e legenda de cada tela, roteamento por hash, painel de logs;
                        carrega o código de cada tela com import() só quando ela é aberta
js/definicoes.js        leitura de definicoes/ com conferência de formato; de-para e ibscbs sob demanda
js/shared.js            criar(), avisos, confirmação, logs da sessão, pool de concorrência, CSV, cópia, arquivos
js/plugnotas.js         cliente HTTP: tempo limite, Retry-After, sessão cancelável, resolve, eventos, consulta
js/credencial.js        API Key e perfis salvos
js/certificado.js       leitura do A1 no navegador (forge) e cartão do certificado
js/mascaras.js          máscaras dos campos do catálogo (campos[].mascara): formatação, tamanho e preenchimento completo
js/info.js              ícone de informação com popup (passar o mouse, Shift ou clique fixa, Esc fecha)
js/tags.js              conteúdo do popup de cada tag do anexo VI
js/origem-plugnotas.js  lado do PlugNotas de cada tag: resumo na lista do de-para e seções do popup
js/analise.js           agregador do validador: analisarEmissao e a API pública (reexports)
js/analise/             uma conferência por módulo: achado, caminhos, contexto, regras-declarativas, texto,
                        campos, documentos, leiaute, valores, retencoes, iss, ibscbs, de-para
js/fluxo-resolve.js     regras e orquestração do Resolve, sem DOM (executarLoteResolve)
js/componentes.js       montarCartao e montarInterruptor, usados por todas as telas
js/telas/lote.js        motor genérico das telas de rota: liga Requisição, execução e Retorno
js/telas/lote/          entrada.js (cartão Requisição e leitura dos campos), execucao.js (endereço,
                        pedido, item a item e conjunto), retorno.js (cartão Retorno, tabela, CSV, cópia)
js/telas/variantes.js   telas agrupadas: seletor e toggle dentro do cartão Requisição
js/telas/resolve.js     tela do Resolve: cartões, tabela e andamento por callbacks
js/telas/nacional.js    telas do Nacional pelo repasse, com o certificado A1
js/telas/depara.js      de-para por tag, com busca, seletor de filtros múltiplos e popup de origem e regras
js/telas/ibscbs.js      relação item LC 116, NBS, indOp e cClassTrib
js/telas/validador.js   tela do validador
api/proxy.js            repasse GET ou POST, com certificado, só para domínios do gov.br da lista
api/saude.js            verificação de saúde: situação e versão
definicoes/             rotas.json, rotas-nacional.json, regras-validacao.json, config.json (manuais)
                        de-para-nacional.json, ibscbs.json (gerados, não editar à mão)
fontes/nacional/        anexos VI (v1.04, NT009, e v1.03, NT007, o leiaute do XML gerado hoje), VII (v1.02) e
                        VIII (v1.01) e a NT 009, públicos
ferramentas/            gerar_definicoes.py, documentacao_api.py, sondar_lib.py, executar_lib.cjs,
                        leitura_getrps.py, conferir_notas.py, gerar_manual.py, relatorio-geracao.json,
                        conferencia-notas.json (só nomes e contagens), README.md (cadeia e regras do gerador)
testes/                 suítes Node (guia em testes/README.md), executar.mjs, teste_fontes.py, teste_gerador.py,
                        conferir_fixtures.py, fixtures/gerador/ (fixtures sintéticas do gerador), sigilo.mjs
                        (varredura de dados sensíveis), verificar-csp.mjs (CSP e SRI no navegador, fora do
                        npm test), gerar-certificados.mjs (certificados de teste em testes/certificados/, fora do Git)
docs/governanca/        ficha, checklist, dados e LGPD, operação e exceções (políticas corporativas)
CHANGELOG.md            histórico de versões
documentacao.pdf        manual de uso (gerado)
vercel.json             cabeçalhos HTTP
.vercelignore           ferramentas, fontes, iniciar.bat, README.md, testes, CLAUDE.md, .gitattributes, docs, CHANGELOG.md, .githooks
.gitattributes          sem conversão de fim de linha em assets/vendor/ e nos PDFs; LF em .githooks/
.githooks/pre-push      roda o npm test antes de cada push (ativar com git config core.hooksPath .githooks)
```

Tamanho atual dos módulos maiores: `telas/resolve.js` 494 linhas, `fluxo-resolve.js`
270, `api/proxy.js` 230, `telas/lote/retorno.js` 224, `analise/retencoes.js` 111,
`styles.css` 1018.

## 5. Arquitetura e fluxos

### 5.1 Telas guiadas por catálogo

Cada rota de `definicoes/rotas.json` e `definicoes/rotas-nacional.json` vira
item de menu e tela, sem código novo. Cada tela abre com grupo, título e
legenda (`resumo`) no topo. Rotas com `"oculta": true` não aparecem no menu e
servem às telas agrupadas.

```json
{
  "id": "email",
  "grupo": "Notas",
  "titulo": "Envio de e-mail",
  "resumo": "Reenvia a nota por e-mail para os destinatários informados.",
  "metodo": "POST",
  "caminho": "/nfse/email/{item}",
  "entrada": { "tipo": "lote", "rotulo": "IDs das notas", "exemplo": "ID da nota, um por linha" },
  "campos": [
    { "id": "destinatarios", "rotulo": "Destinatários", "tipo": "lista", "obrigatorio": true,
      "destino": "corpo.destinatarios", "dica": "Separe por vírgula. Todos recebem a nota de cada id informado." },
    { "id": "reenvio", "rotulo": "Marcar como reenvio", "tipo": "booleano", "padrao": true, "destino": "corpo.reenvio" }
  ],
  "resultado": { "tipo": "mensagem" },
  "confirmar": "Um e-mail será enviado para os destinatários informados, com a nota de cada id da lista.",
  "sensivel": true,
  "ordem": 6
}
```

- `entrada.tipo`: `lote` (uma chamada por linha, `{item}` no caminho ou
  `parametroItem`), `lote-conjunto` (a lista inteira num array no corpo) ou
  `formulario` (uma chamada).
- `resultado.tipo`: `tabela` (com `colunas`), `json`, `arquivo` (extensão fixa
  ou deduzida do Content-Type) ou `mensagem`.
- `campos[].destino`: `corpo.x`, `caminho.x` ou `consulta.x`.
- `campos[].mascara` (`js/mascaras.js`): formata o campo enquanto o consultor
  digita, limita o tamanho e recusa o valor incompleto antes de chamar a API.
  Aceita um padrão em que `9` é dígito e `.`, `/` e `-` são separadores (ex.:
  `99.99.99.999` no código de tributação) ou os nomes `cpf`, `cnpj` e
  `cpfCnpj` (escolhe pelo tamanho). Com `somenteNumeros`, os separadores saem
  antes do envio; sem ele, o valor segue formatado.
- Rotas que alteram dado levam `sensivel` e `confirmar`; aparecem marcadas no
  menu e pedem confirmação.
- No Nacional, `servidor` escolhe `adn` ou `sefin`, e o ambiente (produção ou
  produção restrita) é escolhido na tela.
- Os `exemplo` são sempre textos neutros. Nunca use IDs, CNPJs ou chaves reais
  (ver seção 6).

### 5.2 Telas agrupadas

```json
{
  "id": "consulta",
  "grupo": "Notas",
  "titulo": "Consulta de notas",
  "tela": "variantes",
  "rotuloVariantes": "Consultar por",
  "alternancia": {
    "rotulo": "Consulta completa",
    "ligada": "Traz o documento inteiro gravado na emissão.",
    "desligada": "Desligado, traz o resumo com situação, número e mensagem.",
    "indisponivel": "A consulta por {variante} tem uma forma só."
  },
  "variantes": [
    { "id": "id", "rotulo": "ID da nota", "rota": "consulta-id", "alternativa": "consulta-id-completa" },
    { "id": "integracao", "rotulo": "idIntegracao", "rota": "consulta-integracao" },
    { "id": "periodo", "rotulo": "Período", "rota": "consulta-periodo" }
  ]
}
```

- O seletor e o toggle ficam **dentro do cartão Requisição**, acima do endereço
  da rota; não há bloco próprio para eles.
- Sem `alternancia`, o toggle não aparece. Variante sem `alternativa` desabilita
  o toggle e mostra `indisponivel`.
- A escolha fica em `localStorage` por tela.
- Telas agrupadas atuais: Consulta de notas; Cadastro da empresa (por CNPJ,
  todas da conta, logotipo); Webhook (empresa ou organização, com toggle
  "Enviar um teste"); Certificado (por ID ou CPF/CNPJ, ou todos da conta).

### 5.3 Motor das telas de rota (`js/telas/lote.js` e `js/telas/lote/`)

- A lista é separada por quebra de linha, espaço, vírgula ou ponto e vírgula, e
  os repetidos saem (`separarIdentificadores`). Os itens `.` e `..` são
  recusados com aviso nas telas de rota e no Resolve, porque o navegador os
  resolve como segmento de caminho (ex.: `/empresa/../webhook/verify` viraria o
  teste do webhook da organização).
- Uma requisição por item, com pool de 5 em paralelo nas rotas do PlugNotas e 3
  no Nacional. Rotas sensíveis esperam 150 ms entre itens.
- Campos fixos da tela valem para todos os itens.
- Cartão **Retorno** sempre visível, o último da tela: antes de executar, mostra
  o estado vazio; depois, um campo com o corpo completo, status HTTP, tipo do
  conteúdo, tempo e a URL de destino.
- Requisições sem campos de corpo saem sem corpo (ex.: teste de webhook).
- As telas de rota **não** repetem em falha temporária nem tratam 429; só o
  Resolve faz isso (decisão da seção 8).
- `requisitar` (`js/plugnotas.js`) faz uma chamada só, com tempo limite e sem
  repetir; com `comoBlob`, devolve o arquivo em vez de interpretar JSON. Quem
  repete são `executarResolve` e `consultarEventos`.

### 5.4 Resolve (`js/telas/resolve.js`, `js/fluxo-resolve.js`, `js/plugnotas.js`)

A tela monta os cartões e a tabela; `js/fluxo-resolve.js` tem as regras e a
orquestração sem DOM (`executarLoteResolve`, que avisa a tela por callbacks) e
é coberto por `testes/teste-resolve.mjs`.

1. Consulta a situação antes (`GET /nfse/consultar/{id}`). A consulta pode
   voltar como objeto ou como lista de um item; `normalizarNota` e
   `primeiroDocumento` (`lote.js`) aceitam os dois.
2. Emissor Nacional: chama `POST /nfse/eventos/{id}` antes do resolve e espera
   uma única vez pelo lote inteiro (padrão 15 s), porque o resolve isolado não
   traz todos os dados. O 400 "evento de manifestacao em processamento" faz
   parte do fluxo normal e segue para a espera.
3. `POST /nfse/resolve/{id}` com tentativas (padrão 3, intervalo 1000 ms) para
   os status de `STATUS_TEMPORARIOS` (429, 500, 502, 503). Respeita
   `Retry-After` e, no 429, reduz a concorrência, que volta ao limite a cada
   nota concluída.
4. Mensagem de resolve em execução (`RESOLVE_EM_ANDAMENTO`, `/sendo executad/i`)
   gera espera de `ESPERA_RESOLVE_MS` (10 s), até `MAXIMO_VERIFICACOES_RESOLVE`
   (12) vezes, sem consumir tentativa.
5. Verificação depois do resolve, com intervalo configurável (padrão 10 s).
6. Desfechos: Resolvido; Já estava concluída; Continua rejeitada; Cancelada na
   prefeitura; Ainda em processamento; Resolve recusado pela API; Cancelado.
7. Cancelar: toda nota ainda aberta no fim do lote termina como Cancelado
   (`concluirAbertasComoCanceladas`), inclusive as que nem começaram e as que
   estavam na espera do Nacional. Cancelar durante a conferência fecha a nota
   como Cancelado com o que já foi lido, sem nova consulta depois da pausa. As
   pausas do Resolve e da consulta de eventos (espera do Nacional, intervalo da
   conferência, resolve em andamento, novas tentativas) usam
   `pausarAteCancelar` (`js/plugnotas.js`), que termina na hora do cancelamento.

Tempo limite das chamadas ao PlugNotas: `TEMPO_LIMITE_MS` = 120 s.

### 5.5 Nacional e certificado

- O navegador não chama o gov.br direto (sem CORS). O repasse `api/proxy` aceita
  `GET ?url=` ou `POST` com `{ url }` e `certificado: { chave, certificado }`
  em PEM. A tela usa sempre POST, para a URL com chave de acesso e CNPJ não
  aparecer nos logs de acesso da hospedagem; o GET continua aceito.
- O Nacional exige certificado em todas as consultas (conferido na produção em
  setembro de 2026): o ADN pede o certificado de cliente já no handshake TLS e
  derruba a conexão sem ele (`ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC`); a
  Sefin conecta e responde 403. O repasse continua aceitando consulta sem
  certificado, e `dicaDoErro` orienta a carregar o A1.
- O repasse só aceita `https` e os domínios exatos de `DOMINIOS_LIBERADOS`
  (adn e sefin, produção e produção restrita), na porta padrão e sem usuário ou
  senha na URL (o Node os transformaria em cabeçalho `Authorization`). Prazo
  total de 30 s por consulta, não só de ociosidade. Erros viram 502 com `erro`,
  `codigo`, `dica` e `certificadoEnviado`.
- Entrada: corpo do POST até 64 KB (`content-length` conferido antes de ler o
  corpo; 413 acima disso), objeto JSON com `url` em texto. A chave precisa ser
  PEM `RSA PRIVATE KEY`, `PRIVATE KEY` ou `EC PRIVATE KEY`, sem cifra, e a
  cadeia de 1 a 10 blocos `CERTIFICATE`, com fim de linha LF ou CRLF
  (`problemaNoCertificado`, que confere só o formato; conteúdo inválido cai no
  502 com a dica de par inválido). O domínio é conferido antes do PEM. O corpo
  da requisição nunca é registrado: o único `console` do repasse é o log
  estruturado, uma linha JSON por chamada com `evento`, `horario`, `metodo`,
  `status`, `dominio`, `rota` (trechos com número viram `{id}`),
  `certificado`, `codigo` e `duracaoMs`; há teste de que nada mais entra. O
  corpo gerado pela tela com os PFX de teste tem 2.930 e 4.114 bytes, e o teste
  exige que fique abaixo de 8 KB.
- Saída: respostas do Nacional acima de 4 MB viram 502 com código
  `ERESPOSTAGRANDE`. A Vercel corta respostas de função em 4,5 MB com um 500
  genérico.
- Conexões: sem certificado, o agente global do Node 24 já reaproveita a
  conexão (keepAlive, 5 s). Com certificado, `agent: false` abre uma conexão só
  para a consulta, fechada ao fim, para o socket autenticado com o A1 não ficar
  no pool.
- Saúde: `GET /api/saude` devolve `{ situacao: "ok", versao }`, sem cache. A
  versão fica em `api/saude.js` e o teste exige que seja igual à do
  `package.json`.
- Limitação de uso: não há limitador no código. Um contador em memória valeria
  por instância (a Vercel sobe várias e as zera a cada deploy), não protege
  custo (a invocação já foi cobrada) e, com os consultores saindo pelo mesmo IP
  e os lotes sem novas tentativas (seção 8), um limite baixo viraria itens com
  falha. A proteção recomendada é uma regra de rate limit no WAF da Vercel para
  `/api/proxy`, por IP (o Hobby permite 1 regra, e o pedido bloqueado nem chega
  à função), começando na ação Log para medir e depois 429 com limite folgado.
  A regra fica no painel, fora do Git (ver seção 9).
- Toda resposta do repasse, inclusive as de erro, sai com
  `Content-Security-Policy: default-src 'none'; sandbox`,
  `X-Content-Type-Options: nosniff` e `Cache-Control: no-store`
  (`cabecalhosDaResposta`). HTML, XHTML e SVG do Nacional saem também com
  `Content-Disposition: attachment`. Assim, quem abrir `/api/proxy?url=...` no
  navegador não executa conteúdo repassado na origem do painel, onde ficam os
  perfis com API Key. O app lê o repasse por `fetch`, então nada muda na tela.
- O A1 é lido no navegador com node-forge porque o Node atual recusa o PFX em
  RC2-40, formato comum de A1 ICP-Brasil ("Unsupported PKCS12 PFX data"). A
  senha nunca sai do navegador; só a chave e a cadeia em PEM seguem para o
  repasse, a cada consulta. Nada é guardado; ao recarregar, carrega de novo.
- Certificado mockado foi descartado: o Nacional exige ICP-Brasil válido, e um
  certificado real no servidor de um site aberto deixaria qualquer pessoa
  consultar em nome da empresa.

### 5.6 Definições

- Abertura: `config.json`, `rotas.json`, `rotas-nacional.json` e
  `regras-validacao.json`. De-para e ibscbs carregam sob demanda.
- Todo JSON passa por conferência de formato antes de valer.
- `config.json`: `atualizacaoRemota: false` (o GitHub só entrega arquivos de
  repositório público) e `botaoRepositorio: false` (botão oculto; `true` exibe).
  Religar a leitura remota exige incluir `https://raw.githubusercontent.com` no
  `connect-src` do `vercel.json`; sem isso a CSP bloqueia a leitura e o app usa
  a cópia publicada. O teste de segurança cobra essa ligação.
- O log da sessão registra de onde cada definição veio.

### 5.7 De-para e gerador

- Escopo: JSON do PlugNotas para o XML do Nacional. A fonte principal são as
  props de `buildTx2/padrao-NACIONAL` da lib. O componente TecnoNFSe (script
  `LoadEnvio.txt`, `Mapping.txt` e dataset TecnoNFSe) é só apoio: a conferência
  de 11 notas reais (setembro de 2026) mostrou `verAplic` `TSPD_1.0.1`, diferente
  do valor fixo do script, e tags iguais a chaves da lib que o script não lê
  (`TipoRetIss`, `ValorIRRF`, telefone com DDD).
- Cadeia do gerador (detalhes em `ferramentas/README.md`):
  1. documentação pública da API (`api.json`, esquema `dadosNfseNacional`):
     campos, tipos, valores, tamanhos e tags citadas;
  2. sondagem das props (`sondar_lib.py` e `executar_lib.cjs`): notas
     sintéticas com sentinelas, variando um campo por vez, sem e com RTC007.
     Dá origem, modo (cópia, arredondamento, data, concatenação, soma),
     tabelas de conversão, condições e campos que só valem como número;
  3. `getRps.js`, lido sem executar, só onde as props não cobrem;
  4. ponte da chave para a tag: conferência de notas, depois documentação,
     depois nomes do componente e, para chaves com tabela, nome e códigos da
     tag;
  5. conferência de notas (`conferir_notas.py`), que compara só quando o campo
     de origem está no JSON (a API completa o prestador pelo cadastro e
     calcula valores antes da lib);
  6. equivalência de caminhos do anexo VI 1.03 (leiaute do XML gerado hoje)
     para o 1.04 pelos itens 2.2, 2.3, 2.6 e 2.7 da NT 009.
- A convenção de chamada das props (raiz de cada função) é suposta, porque o
  `index.js` de `padrao-NACIONAL` não está nos insumos; `formatRounding` e
  `formatDate` são substituídos na execução, e o arredondamento aparece como
  "regra não confirmada".
- Formato 3: cada tag da DPS tem `plugnotas` com `situacao`, `json`,
  `jsonCopiaDireta`, `origens`, `documentacao`, `inconsistencias`,
  `caminhoNoXmlGerado` e `apoio`; a entrada pode ter `leiauteAnterior`.
  Tags da NFS-e não têm `plugnotas`.
- `jsonCopiaDireta` só quando a lib copia o campo sem conversão e o campo
  alimenta uma única tag; só eles recebem a conferência de tamanho e tipo do
  anexo VI no validador.
- Inconsistências geradas: divergência nas notas, campo lido fora da
  documentação (com o par documentado, quando a descrição bate com o título da
  tag), fontes que leem campos diferentes, valor da lib ou da documentação fora
  dos códigos do anexo e tamanho da documentação acima do anexo.
- Regras cujo caminho difere entre as abas do anexo VI são associadas por
  semelhança e marcadas com `caminhoNaAbaDeRegras`.
- Volume atual: 430 tags e 579 regras (anexo VI); 196 das 252 folhas da DPS com
  campo do JSON (68 confirmadas em notas), 22 com inconsistência; 39 indOp,
  208 itens, 731 NBS, 28 cClassTrib e 1.514 relações (anexos VII e VIII).
- `ferramentas/relatorio-geracao.json` traz a cobertura e as lacunas da última
  geração; `ferramentas/conferencia-notas.json`, o resultado agregado da
  conferência.
- A tela de IBS e CBS junta as linhas da correlação que só diferem no
  cClassTrib e mostra os cClassTrib juntos (`agruparRelacoes`).

### 5.8 Validador

- `js/analise.js` é o agregador: `analisarEmissao` roda as conferências da nota
  (regras declarativas, texto, nomes de campo, tipos trocados, documentos,
  leiaute e as tiradas do de-para), as de cada serviço (valores, retenções,
  ISS, descrição) e a de IBS e CBS, nessa ordem, e reexporta a API pública. Cada conferência fica num módulo
  de `js/analise/`, sem DOM e sem `definicoes.js`: os dados chegam por
  parâmetro. A ordem importa, porque decide empates no mesmo campo e severidade.
- Conferências calculadas em `js/analise/` e regras declarativas em
  `definicoes/regras-validacao.json` (com `fonte` e `tags` obrigatórios). Nas
  regras, `campo` aceita `[]` para listas (`servico[].iss.aliquota`): a regra
  vale para cada item presente e o achado cita o caminho real
  (`servico[0].iss.aliquota`).
- `derivarTipoRetencao` reproduz a regra de `getTipoRetPisCofinsRtc007` da lib
  do PlugNotas. Só o nome da função vai para a documentação; o código da lib não
  entra no repositório (seção 6.1).
- Tipos de regra: `obrigatorio`, `digitos` (número ou lista), `formato`,
  `tamanho`, `faixa`, `enumerado`, `condicional` e `umDeles`.
- Todo achado tem `fonte`: anexo VI, VII ou VIII, documentação da API, lib do
  PlugNotas, script do Nacional ou cálculo sobre o JSON. Regras sem fonte nos
  documentos foram removidas; não reintroduza.
- O grupo IBS/CBS é lido em `servico[].ibscbs`, o lugar documentado; na raiz,
  gera o alerta "fora do lugar documentado" e o conteúdo ainda é conferido.
- `js/analise/de-para.js` confere pelo de-para gerado:
  - valores e tamanhos aceitos pela documentação (pula campos que já têm
    regra declarativa);
  - campo documentado que a lib não lê;
  - número enviado como texto em campo que a lib só lê como número;
  - conversão de código em que a lib grava o valor padrão da tabela;
  - mais de um serviço na mesma nota (anexo VI, grupo `serv`).

### 5.9 Interface transversal

- Popup de informação: passar o mouse abre; Shift ou clique fixam; Esc, clique
  fora ou o botão fecham.
- Logs: histórico da sessão num painel lateral aberto pelo botão **Logs** do
  cabeçalho, com contador. Traz Identificar-se, Exportar (TXT) e Limpar.
- Identificação: nome declarado, só para rastreabilidade nos logs exportados.
  Não há login.
- API Key: os perfis (apelido e chave) ficam no `localStorage` e duram até o
  consultor apagá-los na tela ou limpar os dados do navegador. A chave digitada
  sem perfil, o perfil ativo e a lista de IDs do Resolve ficam só no
  `sessionStorage` da aba e somem ao fechá-la; não há opção de manter a chave
  digitada no navegador. Na abertura, `levarDadosSensiveisParaAba`
  (`js/shared.js`) move para a aba e apaga do `localStorage` a chave, o perfil
  ativo e a lista que versões anteriores gravaram; os perfis ficam. A chave vai
  direto do navegador para a API PlugNotas e nunca passa pelo servidor da
  ferramenta. No cartão da credencial, o ícone "?" ao lado de "Perfis salvos"
  abre o popup "Como a API Key fica guardada" (com a orientação de não salvar
  perfis em computador compartilhado), e o botão "Apagar todos os perfis" pede
  confirmação. Apagar ou remover perfil também
  tira do campo e da aba a chave que for de um perfil apagado; chave digitada
  que não é de perfil fica.
- Sem rodapé: o nome do painel fica no cabeçalho.
- Estrutura: menu lateral fixo com o gradiente da marca e o logo no topo (no
  tema escuro mantém as cores do claro) e cabeçalho branco com linha da marca.
  Até 768px o menu vira gaveta, aberta pelo botão flutuante `#alternarMenu` e
  fechada ao escolher uma tela ou clicar fora.
- Tema: interruptor com sol e lua; `aria-pressed` informa se o escuro está
  ligado e os ícones alternam pelo atributo `hidden`.
- Confirmação de ação sensível: modal de alerta, Confirmar em amarelo com texto
  escuro e antes de Cancelar.
- Avisos (`mostrarAviso`): canto superior direito, erro em vermelho sólido,
  botão de fechar. Saem pelo tempo, sem depender do fim da animação, que a
  regra de movimento reduzido anula.

## 6. Requisitos de segurança (obrigatórios)

1. **Sigilo do código interno.** Código, libs, scripts e demais insumos internos
   do PlugNotas nunca entram no repositório nem no site: coleções do Postman,
   `LoadEnvio.txt` e demais scripts TX2/Pascal, `Mapping.txt`, a lib
   `buildTx2/padrao-NACIONAL`, executáveis e projetos de demonstração. O
   gerador os recebe por parâmetro. O JSON publicado guarda nomes de campo,
   números de linha e tabelas de valores, nunca trechos de código (há teste
   para isso). As informações exibidas no site podem ser públicas; o código
   não. As notas reais usadas na conferência (pares de JSON e XML) são
   extremamente sensíveis: ficam fora do repositório, nunca aparecem em
   respostas, fixtures ou relatórios, e o `conferencia-notas.json` guarda só
   nomes de tag, nomes de campo documentados ou lidos pela lib, versão da DPS,
   `verAplic` e contagens. As fixtures do gerador são escritas do zero, e
   `testes/conferir_fixtures.py` prova isso.
2. **Dados de clientes e credenciais.** Os insumos internos contêm credenciais e
   dados reais de clientes. Nunca copie deles IDs, CNPJs, chaves de acesso,
   protocolos ou API Keys para código, catálogos, exemplos, testes ou
   documentação. Já houve um caso de exemplos copiados das coleções, corrigido.
   Use valores fictícios ou públicos (códigos IBGE, dados de exemplo da
   documentação oficial). `teste-seguranca.mjs` varre site, definições,
   documentação (inclusive o texto do `documentacao.pdf`), ferramentas e testes
   em busca de IDs do Mongo, UUIDs, chaves de acesso, tokens, CNPJs, CPFs e
   e-mails. A lista de permitidos fica em `testes/sigilo.mjs`, cada valor com a
   fonte pública; valor novo só entra com fonte.
3. **API Key.** Nunca enviar ao servidor da ferramenta, nunca registrar em log,
   nunca incluir em exportação. No `localStorage`, só os perfis salvos pelo
   consultor, gravados só por `js/credencial.js`; a chave digitada sem perfil,
   o perfil ativo e a lista do Resolve ficam só no `sessionStorage` da aba (há
   teste). `X-API-KEY` só pode ir para a origem fixa
   `ORIGEM_PLUGNOTAS` (`js/plugnotas.js`): `requisitar` recusa, sem chamar o
   `fetch`, qualquer outro destino com chave, e a `base` do `rotas.json` tem de
   ser igual a ela (teste de contrato). Nenhum código envia a chave por fora de
   `requisitar`.
4. **Certificado A1.** Nunca persistir em `localStorage`, `sessionStorage`,
   cookies ou logs. A senha não sai do navegador e é apagada do campo depois de
   cada leitura do arquivo, com ou sem sucesso. O repasse usa chave e cadeia só durante a
   conexão, que é fechada ao fim (`agent: false`), e não registra o corpo da requisição. `teste-seguranca.mjs` carrega e
   usa o A1 de teste e varre armazenamentos, cookie, logs, DOM, campos, área de
   transferência e arquivos exportados.
5. **Repasse.** Somente `https`, domínios exatos da lista na porta padrão, sem
   usuário ou senha na URL, métodos GET e POST, corpo até 64 KB e certificado com
   o formato PEM conferido. Toda resposta sai com CSP `sandbox`, `nosniff` e `no-store`.
   Qualquer domínio novo exige alteração explícita da lista e teste.
6. **DOM.** Proibido `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
   `document.write`, `eval` e `new Function` com dados dinâmicos. Use `criar()`
   e `textContent`.
7. **Dependências.** Sem CDN para scripts. Toda biblioteca nova precisa de
   aprovação, versão fixa e licença no repositório.
8. **Indexação.** O site é aberto, mas não indexável (`X-Robots-Tag: noindex,
   nofollow`).
9. **Cabeçalhos do site.** CSP, Permissions-Policy e
   `Cross-Origin-Opener-Policy: same-origin` valem nas páginas (regra
   `/((?!api/).*)` do `vercel.json`); o repasse define a própria CSP. Scripts,
   estilos e fontes só do próprio site. Nada
   inline: sem `<script>` ou `<style>` embutidos, sem atributo `style` ou `on*`,
   estilo dinâmico só por CSSOM (`elemento.style.x`). Origem nova de `fetch`
   precisa entrar no `connect-src`, e o teste de segurança falha até isso
   acontecer. Validar com `npm run verificar:csp` e, depois do deploy, com
   `curl -sI` na produção. As prévias mostram a Vercel Toolbar, que exigiria
   afrouxar a CSP; não liberar `vercel.live`.

## 7. Padrões de código

- Nomes em português, descritivos e específicos. Nada de `data`, `temp`, `aux`,
  `obj`, `handler`, `utils` genéricos.
- **Sem comentários no código.** O nome explica; o que precisar de contexto vai
  para o README ou para este arquivo.
- Funções pequenas com uma responsabilidade; estruturas enxutas. Prefira poucas
  peças claras a muitas camadas.
- DOM sempre por `criar(tag, atributos, filhos)` de `js/shared.js`; eventos por
  `addEventListener` ou `aoClicar`/`aoMudar` do `criar`.
- Sem framework e sem build. Módulos ES nativos.
- Comportamento novo de tela entra de preferência pelo catálogo em `definicoes/`.
- CSS com os tokens existentes (`--indigo-*`, `--bg-*`, `--text-*`, `--border*`,
  `--trilha`, `--fundo-sobreposicao`, `--warning-solido`, `--radius*`,
  `--altura-controle`, `--font-mono`), funcionando nos temas claro e escuro. O
  padrão visual segue o design system da TecnoSpeed: marca em três papéis
  (`--indigo-500` marca, `--bg-destaque` média e `--indigo-900` escura, que
  formam o gradiente do botão primário e do menu; `--indigo-700` é o texto da
  marca), cinzas neutros, raio de 0,65rem (`--radius`; 0,3rem em chips,
  `--radius-sm`), controles com `--altura-controle` (48px, 64px até 768px),
  texto em 0,75, 0,875, 1, 1,25, 1,5 ou 1,875rem e foco com contorno de 2px na
  cor da marca. Todo par de texto e fundo tem 4,5:1 ou mais nos dois temas; cor
  de estado usa o tom da mesma família que passa no AA. O `styles.css` é um
  arquivo só, sem comentários, na ordem: fontes (`@font-face`), tokens e temas, base, componentes
  (botões, campos, interruptor, badges, abas, cartões), estrutura (casca,
  cabeçalho, menu lateral), tabelas e progresso, telas de rota e
  Retorno, popup de informação, painel de logs, modal, avisos e as telas
  específicas (validador, de-para, IBS e CBS, certificado). Regra nova entra no
  bloco do seu componente. `[hidden] { display: none !important }` faz o
  atributo `hidden` vencer o `display` das classes: esconda sempre pelo
  atributo. `testes/teste-padroes.mjs` cobra a ausência de comentários em `js/`,
  `api/`, no CSS e nos scripts Python (fica só a docstring do módulo, que vira o
  `--help`).
- Testes: esperas longas da aplicação com o relógio simulado do `node:test`;
  esperar tela ou chamada com `aguardarAte(condicao)`. Espera fixa só para
  debounce e para conferir que algo não aconteceu. Todo defeito corrigido ganha
  teste que falha no código antigo.
- Textos da interface: português, concisos, sem jargão desnecessário, **sem
  travessões**.
- **Rigor de fonte:** nenhum limite, regra ou comportamento pode ser afirmado
  sem documento que o sustente (anexos, documentação do PlugNotas, lib, script
  ou cálculo). Na dúvida, a interface diz que não foi possível confirmar.
- Toda rota nova ou alterada é conferida antes na documentação do PlugNotas e
  entra no teste de contrato.
- Commits pequenos, mensagem no imperativo em português (ex.: "Adiciona CSP no
  vercel.json"). `npm test` verde antes de cada commit; o gancho `.githooks/pre-push`
  roda de novo antes de cada push, porque todo commit no `main` vai ao ar.

## 8. Decisões registradas (não reverter sem falar com o Hugo)

| Decisão | Motivo |
|---|---|
| Repositório privado na conta pessoal e site aberto na Vercel | Não é possível hospedar na organização da TecnoSpeed; o que não pode vazar é o código |
| Standard Protection, sem login | Login da Vercel limitaria o acesso da equipe |
| Atualização por commit, leitura remota desligada | Repositório privado |
| Botão Repositório oculto por configuração | Pedido do Hugo; religa com `botaoRepositorio: true` |
| Node 24.x | Node 20 descontinuado na Vercel em 01/10/2026 |
| API Key direto do navegador para a API | A chave não passa pelo servidor |
| Certificado lido no navegador e enviado só por consulta | Sigilo da senha e formato RC2-40 |
| Sem certificado mockado | Exigência ICP-Brasil e risco de uso por terceiros |
| Retorno sempre visível como último cartão | O consultor precisa ver a resposta crua |
| Logs no cabeçalho, não por aba | O log é da sessão, não da operação |
| Seletor e toggle dentro do cartão Requisição | Pedido do Hugo |
| Consultas de nota numa tela só; completa só pelo ID | A documentação só tem versão completa por ID |
| Grupo Empresa só de leitura, com teste de webhook sensível | Alterações de cadastro ficam na interface do PlugNotas |
| Relatório de NFS-e removido | Não é usado |
| Telas de rota sem novas tentativas e separação por espaço mantida | Hugo aprovou o comportamento atual |
| Validador só com regras de fonte documentada | Rigor: nada de conhecimento geral sem fonte |
| CSP só nas páginas, com `img-src 'self'` (sem `data:`) e sem liberar a Vercel Toolbar | Aprovado na rodada 1; nada do app usa `data:` e o repasse tem CSP própria |
| Sem limitador por IP no código do repasse; limite pelo WAF da Vercel | Aprovado na rodada 1; contador em memória não protege e barraria lotes da equipe no mesmo IP |
| Nome, logo e favicon atuais, sem rodapé | Identidade definida pelo Hugo; o rodapé saiu a pedido dele em outubro de 2026 |
| Perfis de API Key no `localStorage`; chave digitada sem perfil, perfil ativo e lista do Resolve só na aba, sem "Manter a chave" | Pedido do Hugo em 29/09/2026, revendo a rodada 1 (tudo só na aba, porque a API Key é informação Restrita pela política de dados): os perfis precisam durar entre aberturas do site. Governança atualizada em `docs/governanca/` |
| Consultas do Nacional sempre por POST, GET ainda aceito no repasse | Identificadores fora da URL e dos logs de acesso; contrato do repasse mantido |
| Quicksand servida pelo próprio site | Um terceiro a menos recebendo o IP do consultor; CSP só `'self'` |
| Padrão visual do design system da TecnoSpeed, com marca índigo e Quicksand | Aprovado em outubro de 2026: o design system prevê cor por produto; a Visby Round CF exigiria licença web para site aberto; menu colorido com o logo e cabeçalho branco; confirmação em amarelo para todas as ações sensíveis |
| Código de cada tela carregado sob demanda | Orçamento de 49 KB com gzip para o JS da abertura (`teste-desempenho.mjs`) |
| Classificação como Aplicação crítica | Políticas corporativas (ação fiscal em produção, exposição externa, credenciais de clientes) |
| De-para só do JSON do PlugNotas para o XML do Nacional; props da lib como fonte principal e componente (script e Mapping) só como apoio | Pedido do Hugo em 29/09/2026; a conferência de notas mostrou que o XML não sai do script do componente |
| Conferência de notas reais como fonte do de-para, com relatório só de nomes e contagens | Aprovado em 29/09/2026; as notas ficam fora do repositório |
| Documentação pública da API (`api.json`) como fonte do de-para e do validador | Aprovado em 29/09/2026 |
| Tabelas de conversão e listas de valores da lib publicadas no de-para | Aprovado em 29/09/2026: são comportamento, não código |
| Inconsistências entre fontes entram no de-para com aviso discreto: "Há inconsistências entre as fontes desta tag. Para uma informação precisa, valide nos scripts." | Pedido do Hugo em 29/09/2026 |
| Nomes do TX2 e linhas do script só no popup, como apoio | Aprovado em 29/09/2026 |
| Tags sem campo próprio no JSON indicadas como enviáveis por `camposPrefeitura` (linhas `@` do TX2) | Confirmação do Hugo em 29/09/2026; o formato do campo no JSON não está documentado |
| Anexo VI 1.03 e NT 009 em `fontes/nacional`, com a equivalência de caminhos pelos itens da NT | Aprovado em 29/09/2026; o XML gerado hoje segue o 1.03 |
| `versaoEsquema` RTC007 vem da tag do JSON | Informação do Hugo em 29/09/2026 (em outros produtos, o cliente preenche no TX2) |

As três primeiras decisões da tabela (repositório pessoal, site aberto na
Vercel e Standard Protection sem login) conflitam com as políticas
corporativas. Valem sob a exceção temporária E1 (`docs/governanca/excecoes.md`)
até a migração para GitLab, hospedagem corporativa e SSO.

Rotas conferidas na documentação do PlugNotas (método e caminho):

```
GET  /nfse/consultar/{idNotaOrProtocol}      GET  /nfse/{idNotaOrProtocol}
GET  /nfse/consultar/{idIntegracao}/{cnpj}   GET  /nfse/consultar/periodo (cpfCnpj obrigatório; dataInicial, dataFinal, hashProximaPagina na URL)
GET  /nfse/xml/{idNota}                      GET  /nfse/pdf/{idNota}          POST /nfse/pdf/{idNota}
POST /nfse/email/{idNota}   (reenvio, destinatarios)
POST /nfse/cancelar/{idNota} (codigo, motivo) GET /nfse/cancelar/status/{protocolo}
POST /nfse/eventos/{idNota} (tipo obrigatório, modelo, codigo, motivo)
POST /nfse/resolve/{idNota} POST /nfse/sincronizar  POST /nfse/interromper
GET  /empresa  (hashProximaPagina; 150 por página)   GET /empresa/{cnpj}   GET /empresa/{cnpj}/logotipo
GET  /empresa/{cnpj}/webhook   POST /empresa/{cnpj}/webhook/verify   GET /webhook   POST /webhook/verify
GET  /certificado   GET /certificado/{idCertificadoOrCpfCnpj}
```

## 9. Pendências e limitações conhecidas

- O código que liga as chaves das props ao XML (`buildTx2/padrao-NACIONAL/index.js`
  e o que vem depois) e o `utils.js` (`formatRounding`) não estão nos insumos, e
  o Hugo não tem acesso. Sem nota que exercite a tag, a ligação vem dos nomes do
  componente (125 tags) ou do nome e códigos da tag (3). Mais notas com
  dedução, IBS/CBS com destinatário e imóvel, tomador no exterior, evento,
  obra, pedágio e retenções confirmariam essas ligações: basta gerar de novo
  com `--notas`.
- `camposPrefeitura` via `@`: o formato do campo no JSON não está na
  documentação; o de-para mostra o nome do campo do dataset.
- Tags do anexo VI 1.03 sem equivalente no 1.04 pela NT 009 ficam em
  `relatorio-geracao.json` (`leiauteAnteriorSemEquivalente`), assim como os
  campos renomeados que a NT não lista um a um (ex.: `vDR` e `pDR`).
- Regra de rate limit do WAF da Vercel para `/api/proxy` ainda não criada no
  painel (seção 5.5). Ao criar, registrar aqui a janela, o limite e a ação.
- A documentação traz status de sincronização e de interrupção por protocolo e
  regeração de PDF por idIntegracao; oferecidos, ainda não decididos.
- O anexo VI tem regras com código provisório (`EXXX`); são exibidas como estão.
- Do design system ficaram para outra rodada: erro de preenchimento sob o campo
  em vez de aviso, título da tela dentro do cabeçalho e vermelho nas
  confirmações irreversíveis (exige campo no catálogo e a indicação das rotas).
- Conformidade com as políticas corporativas (plano aprovado na rodada 1):
  - Onda 0, com o Hugo e o gestor: registrar no TecnoApps como Aplicação
    crítica, formalizar responsável de negócio e revisor independente, obter o
    aceite das exceções de `docs/governanca/excecoes.md`, pedir à Tecnologia
    GitLab, hospedagem corporativa com SSO e a confirmação de que o Claude Code
    é homologado, com conta corporativa, e confirmar a classificação da
    informação.
  - Onda 3, depois da Tecnologia: repositório no GitLab com Merge Request e
    revisão independente, pipeline (testes, dependências, segredos, deploy só
    com tudo verde), hospedagem corporativa com SSO e WAF, auditoria das ações
    sensíveis com a identidade do SSO, integração do log ao monitoramento
    centralizado e responsável pelo custo.
- Validado na produção em setembro de 2026, com a 4.1.0: `/api/saude`, função
  em `gru1`, cabeçalhos das páginas iguais ao `vercel.json`, cache imutável de
  `assets/vendor/`, arquivos publicados iguais ao `main`, recusas do repasse
  (domínio, `http`, porta, usuário na URL, PEM, 64 KB, método) e
  `npm run verificar:csp` sem violações. O Hugo consultou o Nacional com o A1
  ICP-Brasil real, pela tela, e funcionou; sem certificado o Nacional recusa
  (seção 5.5).

## 10. Glossário

| Termo | Significado |
|---|---|
| NFS-e | Nota fiscal de serviço eletrônica |
| ADN | Ambiente de Dados Nacional da NFS-e |
| Sefin Nacional | Emissor e consulta de DPS e NFS-e do Nacional |
| DPS | Declaração de Prestação de Serviço, que origina a NFS-e |
| DANFSe | Documento auxiliar (PDF) da NFS-e |
| CNC | Cadastro Nacional de Contribuintes do Nacional |
| TX2 | Formato de entrada do componente TecnoNFSe, montado pela lib a partir do JSON |
| RTC, RTC007 | Versões de esquema da reforma tributária no PlugNotas |
| IBS, CBS | Tributos da reforma tributária |
| indOp | Indicador de operação (anexo VII) |
| cClassTrib | Classificação tributária do IBS e da CBS |
| NBS | Nomenclatura Brasileira de Serviços |
| idIntegracao | Identificador da nota definido pelo integrador |
