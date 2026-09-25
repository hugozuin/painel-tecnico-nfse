# CLAUDE.md · Painel Técnico NFS-e

Instruções do projeto para o Claude Code. A **Parte A** vale para toda sessão. A
**Parte B** é a missão inicial de revisão, refatoração e testes; quando ela for
concluída, mova-a para `docs/` e deixe aqui só um resumo, para este arquivo
continuar curto e focado no que vale sempre.

Regras de leitura:

- Leia a Parte A inteira antes de qualquer mudança.
- O código mostra o estado atual; as decisões da seção A8 mostram a intenção.
  Se os dois divergirem, pergunte ao Hugo antes de mudar comportamento.
- Escreva tudo em português: código, textos da interface, mensagens de commit,
  documentação e respostas.

---

# PARTE A · Regras permanentes

## A1. Resumo do projeto

O Painel Técnico NFS-e é a ferramenta interna da Consultoria Técnica NFS-e da
TecnoSpeed (produto PlugNotas), criada e mantida por Hugo Zuin, consultor
técnico. Antes se chamava "Consulta e Sincronização de Notas | Rota Resolve".

Objetivos:

1. Executar em lote as rotas da API PlugNotas usadas no suporte: resolve,
   consultas, XML e PDF, e-mail, cancelamento, eventos, sincronização,
   interrupção, empresa, webhook e certificado.
2. Consultar o Ambiente Nacional da NFS-e (ADN e Sefin) por um repasse próprio,
   com o certificado A1 do consultor quando a rota exige.
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
| Documentação da API | https://docs.plugnotas.com.br (só renderiza com JavaScript) |

## A2. Comandos

```bash
# testes (uma vez: cd testes && npm install)
cd testes && npm test
cd testes && npm run test:detalhes

# conferência dos dados contra as planilhas dos anexos (Python 3.10+ e openpyxl)
python testes/teste_fontes.py

# servidor local estático (as consultas do Nacional não funcionam: dependem da função api/proxy)
npx serve -l 3500 .

# servidor local com a função do repasse (exige login e vínculo na CLI da Vercel)
npx vercel dev

# regenerar de-para e tabelas do IBS e da CBS
python ferramentas/gerar_definicoes.py --anexos fontes/nacional \
  --script <LoadEnvio.txt> --mapeamento <Mapping.txt> --lib <pasta props> --saida definicoes

# regenerar o manual em PDF (reportlab e svglib)
python ferramentas/gerar_manual.py
```

`iniciar.bat` sobe o servidor estático no Windows e fica fora do Git
(`.gitignore`). Sem `--script`, `--mapeamento` e `--lib`, o gerador produz só o
lado do Nacional.

## A3. Stack e dependências

- **Front-end:** HTML, CSS e JavaScript em módulos ES, sem framework e sem etapa
  de build. `index.html` carrega `js/app.js`.
- **Função serverless:** `api/proxy.js` na Vercel, Node `24.x` (campo `engines`
  do `package.json`; a Vercel descontinua o Node 20 para builds e funções em
  01/10/2026).
- **Biblioteca no navegador:** node-forge 1.4.0 vendorizado em
  `assets/vendor/forge.min.js` (licença em `forge-LICENSE.txt`), carregado sob
  demanda só para ler o certificado A1. Nada vem de CDN.
- **Fonte:** Quicksand pelo Google Fonts.
- **Dados:** JSON versionados em `definicoes/`. Sem banco de dados.
- **Ferramentas Python (fora do site):** openpyxl no gerador; reportlab e svglib
  no manual.
- **Testes:** Node com jsdom 30.1.0 e node-forge 1.4.0 (`testes/package.json`);
  Python com openpyxl em `testes/teste_fontes.py`.
- **Hospedagem:** Vercel, Framework Preset "Other", sem comando de build e sem
  variáveis de ambiente. Deployment Protection com Vercel Authentication em
  **Standard Protection**: produção aberta e prévias de outros branches
  protegidas.

Restrições de arquitetura definidas pelo Hugo: sem MongoDB, PostgreSQL ou AWS;
deploy simples na web; backend só o mínimo necessário (hoje, o repasse).

## A4. Estrutura do repositório

```
index.html              estrutura, cabeçalho (Logs, Documentação, tema), menu lateral, modais, painel de logs
styles.css              tema claro e escuro com tokens da marca (índigo, Quicksand)
assets/                 logo.svg e logoicon.svg (brancos), favicon.svg (fundo índigo), vendor/forge.min.js
js/app.js               catálogo de telas, menu, título e legenda de cada tela, roteamento por hash, painel de logs
js/definicoes.js        leitura de definicoes/ com conferência de formato; de-para e ibscbs sob demanda
js/shared.js            criar(), avisos, confirmação, logs da sessão, pool de concorrência, CSV, cópia, arquivos
js/plugnotas.js         cliente HTTP: tempo limite, Retry-After, sessão cancelável, resolve, eventos, consulta
js/credencial.js        API Key e perfis salvos
js/certificado.js       leitura do A1 no navegador (forge) e cartão do certificado
js/info.js              ícone de informação com popup (passar o mouse, Shift ou clique fixa, Esc fecha)
js/tags.js              conteúdo do popup de cada tag do anexo VI
js/analise.js           conferências do validador, cada achado com fonte e tags do XML
js/telas/lote.js        motor genérico das telas de rota (Requisição e Retorno)
js/telas/variantes.js   telas agrupadas: seletor e toggle dentro do cartão Requisição
js/telas/resolve.js     resolve em lote com conferência antes e depois
js/telas/nacional.js    telas do Nacional pelo repasse, com certificado opcional
js/telas/depara.js      de-para por tag, com busca e popup de regras
js/telas/ibscbs.js      relação item LC 116, NBS, indOp e cClassTrib
js/telas/validador.js   tela do validador
api/proxy.js            repasse GET, ou POST com certificado, só para domínios do gov.br da lista
definicoes/             rotas.json, rotas-nacional.json, regras-validacao.json, config.json (manuais)
                        de-para-nacional.json, ibscbs.json (gerados, não editar à mão)
fontes/nacional/        anexos VI (v1.04, NT009), VII (v1.02) e VIII (v1.01), públicos
ferramentas/            gerar_definicoes.py, gerar_manual.py, relatorio-geracao.json
testes/                 suítes Node, executar.mjs, teste_fontes.py, certificados de teste
documentacao.pdf        manual de uso (gerado)
vercel.json             cabeçalhos HTTP
.vercelignore           ferramentas, fontes, iniciar.bat, README.md, testes, CLAUDE.md
```

Tamanho atual dos módulos maiores: `resolve.js` 695 linhas, `analise.js` 571,
`lote.js` 484, `styles.css` 1026.

## A5. Arquitetura e fluxos

### A5.1 Telas guiadas por catálogo

Cada rota de `definicoes/rotas.json` e `definicoes/rotas-nacional.json` vira
item de menu e tela, sem código novo. Cada tela abre com grupo, título e
legenda (`resumo`) no topo. Rotas com `"oculta": true` não aparecem no menu e
servem às telas agrupadas.

```json
{
  "id": "email",
  "grupo": "Arquivos",
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
  "ordem": 4
}
```

- `entrada.tipo`: `lote` (uma chamada por linha, `{item}` no caminho ou
  `parametroItem`), `lote-conjunto` (a lista inteira num array no corpo) ou
  `formulario` (uma chamada).
- `resultado.tipo`: `tabela` (com `colunas`), `json`, `arquivo` (extensão fixa
  ou deduzida do Content-Type) ou `mensagem`.
- `campos[].destino`: `corpo.x`, `caminho.x` ou `consulta.x`.
- Rotas que alteram dado levam `sensivel` e `confirmar`; aparecem marcadas no
  menu e pedem confirmação.
- No Nacional, `servidor` escolhe `adn` ou `sefin`, e o ambiente (produção ou
  produção restrita) é escolhido na tela.
- Os `exemplo` são sempre textos neutros. Nunca use IDs, CNPJs ou chaves reais
  (ver A6).

### A5.2 Telas agrupadas

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

### A5.3 Motor das telas de rota (`js/telas/lote.js`)

- A lista é separada por quebra de linha, espaço, vírgula ou ponto e vírgula, e
  os repetidos saem (`separarIdentificadores`).
- Uma requisição por item, com pool de 5 em paralelo nas rotas do PlugNotas e 3
  no Nacional. Rotas sensíveis esperam 150 ms entre itens.
- Campos fixos da tela valem para todos os itens.
- Cartão **Retorno** sempre visível, o último da tela: antes de executar, mostra
  o estado vazio; depois, um campo com o corpo completo, status HTTP, tipo do
  conteúdo, tempo e a URL de destino.
- Requisições sem campos de corpo saem sem corpo (ex.: teste de webhook).
- As telas de rota **não** repetem em falha temporária nem tratam 429; só o
  Resolve faz isso (decisão A8).

### A5.4 Resolve (`js/telas/resolve.js`, `js/plugnotas.js`)

1. Consulta a situação antes (`GET /nfse/consultar/{id}`).
2. Emissor Nacional: chama `POST /nfse/eventos/{id}` antes do resolve e espera
   uma única vez pelo lote inteiro (padrão 15 s), porque o resolve isolado não
   traz todos os dados.
3. `POST /nfse/resolve/{id}` com tentativas (padrão 3, intervalo 1000 ms) para
   os status de `STATUS_TEMPORARIOS` (429, 500, 502, 503). Respeita
   `Retry-After` e, no 429, reduz a concorrência.
4. Mensagem de resolve em execução (`RESOLVE_EM_ANDAMENTO`, `/sendo executad/i`)
   gera espera de `ESPERA_RESOLVE_MS` (10 s), até `MAXIMO_VERIFICACOES_RESOLVE`
   (12) vezes.
5. Verificação depois do resolve, com intervalo configurável (padrão 10 s).
6. Desfechos: Resolvido; Já estava concluída; Continua rejeitada; Cancelada na
   prefeitura; Ainda em processamento; Resolve recusado pela API.

Tempo limite das chamadas ao PlugNotas: `TEMPO_LIMITE_MS` = 120 s.

### A5.5 Nacional e certificado

- O navegador não chama o gov.br direto (sem CORS). As telas do Nacional usam
  `api/proxy`: `GET ?url=` sem certificado, ou `POST` com
  `{ url, certificado: { chave, certificado } }` em PEM.
- O repasse só aceita `https` e os domínios exatos de `DOMINIOS_LIBERADOS`
  (adn e sefin, produção e produção restrita). Tempo limite de 30 s. Erros viram
  502 com `erro`, `codigo`, `dica` e `certificadoEnviado`.
- O A1 é lido no navegador com node-forge porque o Node atual recusa o PFX em
  RC2-40, formato comum de A1 ICP-Brasil ("Unsupported PKCS12 PFX data"). A
  senha nunca sai do navegador; só a chave e a cadeia em PEM seguem para o
  repasse, a cada consulta. Nada é guardado; ao recarregar, carrega de novo.
- Certificado mockado foi descartado: o Nacional exige ICP-Brasil válido, e um
  certificado real no servidor de um site aberto deixaria qualquer pessoa
  consultar em nome da empresa.

### A5.6 Definições

- Abertura: `config.json`, `rotas.json`, `rotas-nacional.json` e
  `regras-validacao.json`. De-para e ibscbs carregam sob demanda.
- Todo JSON passa por conferência de formato antes de valer.
- `config.json`: `atualizacaoRemota: false` (o GitHub só entrega arquivos de
  repositório público) e `botaoRepositorio: false` (botão oculto; `true` exibe).
- O log da sessão registra de onde cada definição veio.

### A5.7 De-para e gerador

- `ferramentas/gerar_definicoes.py` liga quatro elos: lib do PlugNotas (JSON
  para TX2), script do Nacional (TX2 para dataset), `Mapping.txt` (dataset para
  caminho XML) e anexo VI (caminho para tag). Se um elo não fecha, a tela diz
  "campo do JSON não identificado nas fontes analisadas" em vez de supor.
- `jsonCopiaDireta` marca campos copiados sem conversão; só eles recebem a
  conferência de tamanho e tipo do anexo VI no validador.
- Regras cujo caminho difere entre as abas do anexo VI são associadas por
  semelhança e marcadas com `caminhoNaAbaDeRegras`.
- Volume atual: 430 tags e 579 regras (anexo VI); 39 indOp, 208 itens, 731 NBS,
  28 cClassTrib e 1.514 relações (anexos VII e VIII).
- `ferramentas/relatorio-geracao.json` lista as lacunas da última geração.

### A5.8 Validador

- `js/analise.js` (conferências calculadas) e `definicoes/regras-validacao.json`
  (regras declarativas com `fonte` e `tags` obrigatórios).
- Tipos de regra: `obrigatorio`, `digitos` (número ou lista), `formato`,
  `tamanho`, `faixa`, `enumerado`, `condicional` e `umDeles`.
- Todo achado tem `fonte`: anexo VI, VII ou VIII, lib do PlugNotas, script do
  Nacional ou cálculo sobre o JSON. Regras sem fonte nos documentos foram
  removidas; não reintroduza.

### A5.9 Interface transversal

- Popup de informação: passar o mouse abre; Shift ou clique fixam; Esc, clique
  fora ou o botão fecham.
- Logs: histórico da sessão num painel lateral aberto pelo botão **Logs** do
  cabeçalho, com contador. Traz Identificar-se, Exportar (TXT) e Limpar.
- Identificação: nome declarado, só para rastreabilidade nos logs exportados.
  Não há login.
- API Key: `sessionStorage` por padrão; `localStorage` só com "Manter a chave".
  Perfis salvos ficam em `localStorage`. A chave vai direto do navegador para a
  API PlugNotas e nunca passa pelo servidor da ferramenta.
- Rodapé: "**Painel Técnico NFS-e · Consultoria Técnica NFS-e** · TecnoSpeed" e
  "Desenvolvido por Hugo Zuin" com menos destaque.

## A6. Requisitos de segurança (obrigatórios)

1. **Sigilo do código interno.** Código, libs, scripts e demais insumos internos
   do PlugNotas nunca entram no repositório nem no site: coleções do Postman,
   `LoadEnvio.txt` e demais scripts TX2/Pascal, `Mapping.txt`, a lib
   `buildTx2/padrao-NACIONAL`, executáveis e projetos de demonstração. O
   gerador os recebe por parâmetro. O JSON publicado guarda nomes de campo e
   números de linha, nunca trechos de código (há teste para isso). As
   informações exibidas no site podem ser públicas; o código não.
2. **Dados de clientes e credenciais.** Os insumos internos contêm credenciais e
   dados reais de clientes. Nunca copie deles IDs, CNPJs, chaves de acesso,
   protocolos ou API Keys para código, catálogos, exemplos, testes ou
   documentação. Já houve um caso de exemplos copiados das coleções, corrigido.
   Use valores fictícios ou públicos (códigos IBGE, dados de exemplo da
   documentação oficial).
3. **API Key.** Nunca enviar ao servidor da ferramenta, nunca registrar em log,
   nunca incluir em exportação. `X-API-KEY` só pode ir para a base da API
   PlugNotas do catálogo.
4. **Certificado A1.** Nunca persistir em `localStorage`, `sessionStorage`,
   cookies ou logs. A senha não sai do navegador. O repasse usa chave e cadeia
   só durante a conexão e não registra o corpo da requisição.
5. **Repasse.** Somente `https`, domínios exatos da lista, métodos GET e POST.
   Qualquer domínio novo exige alteração explícita da lista e teste.
6. **DOM.** Proibido `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
   `document.write`, `eval` e `new Function` com dados dinâmicos. Use `criar()`
   e `textContent`.
7. **Dependências.** Sem CDN para scripts. Toda biblioteca nova precisa de
   aprovação, versão fixa e licença no repositório.
8. **Indexação.** O site é aberto, mas não indexável (`X-Robots-Tag: noindex,
   nofollow`).

## A7. Padrões de código

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
- CSS com os tokens existentes (`--indigo-*`, `--bg-*`, `--text-*`, `--border*`),
  funcionando nos temas claro e escuro.
- Textos da interface: português, concisos, sem jargão desnecessário, **sem
  travessões**.
- **Rigor de fonte:** nenhum limite, regra ou comportamento pode ser afirmado
  sem documento que o sustente (anexos, documentação do PlugNotas, lib, script
  ou cálculo). Na dúvida, a interface diz que não foi possível confirmar.
- Toda rota nova ou alterada é conferida antes na documentação do PlugNotas e
  entra no teste de contrato.
- Commits pequenos, mensagem no imperativo em português (ex.: "Adiciona CSP no
  vercel.json"). `npm test` verde antes de cada commit.

## A8. Decisões registradas (não reverter sem falar com o Hugo)

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
| Nome, logo, favicon e rodapé atuais | Identidade definida pelo Hugo |

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

## A9. Pendências e limitações conhecidas

- Nomes de TX2 divergentes entre a lib e o script do Nacional (ex.: lib gera
  `ValorIRRF`, `ValorCP`, `TipoRetIss`, `TipoTributacaoIss`; script lê
  `ValorIR`, `ValorCPP`, `IssRetido`, `ExigibilidadeISS`). Nesses campos o JSON
  aparece como não identificado. Falta analisar o código que grava o TX2 a
  partir das props (`buildTx2/padrao-NACIONAL/index.js`), que é interno.
- O `Mapping.txt` do componente é da v1.01; alguns caminhos não existem no
  leiaute RTC do anexo VI (ex.: `vDedRed`).
- Raízes do JSON como a do intermediário não estão confirmadas.
- Teste real do Nacional com certificado ainda pendente. Se falhar por cadeia
  do servidor, falta a cadeia ICP-Brasil no repasse; se falhar por tempo,
  avaliar a região da função.
- A documentação traz status de sincronização e de interrupção por protocolo e
  regeração de PDF por idIntegracao; oferecidos, ainda não decididos.
- O anexo VI tem regras com código provisório (`EXXX`); são exibidas como estão.

## A10. Glossário

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

---

# PARTE B · Missão inicial: revisão, refatoração e testes

## B0. Como conduzir

1. Rode `git status` e `git log -5` e confirme que o repositório bate com a
   seção A4. Se `testes/` não existir, pare e avise o Hugo.
2. Crie o branch `refatoracao/rodada-1`.
3. Rode `cd testes && npm install && npm test` e `python testes/teste_fontes.py`.
   Linha de base: **258 verificações** em 7 suítes, mais 11 conferências das
   planilhas, todas passando.
4. Trabalhe na ordem de prioridade abaixo, um item por commit, com os testes
   verdes a cada commit.
5. Não altere comportamento visível nem decisões da seção A8 sem aprovação. Se
   um item exigir, descreva a proposta e pergunte.
6. Ao final, escreva `docs/revisao-rodada-1.md`: o que mudou, riscos restantes e
   métricas antes e depois. Se a interface ou um fluxo mudar, atualize o README
   e rode `python ferramentas/gerar_manual.py`.

## B1. Prioridade 0 · Segurança

1. **Cabeçalhos no `vercel.json`.** Hoje só há `X-Content-Type-Options`,
   `Referrer-Policy` e `X-Robots-Tag`. Adicione e valide no navegador, sem
   violações no console:

   ```text
   Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.plugnotas.com.br; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
   Permissions-Policy: camera=(), microphone=(), geolocation=()
   Cross-Origin-Opener-Policy: same-origin
   ```

   Antes, levante todos os destinos de `fetch` e recursos carregados. Se a
   leitura remota for religada, inclua `https://raw.githubusercontent.com` em
   `connect-src`.
2. **Resposta do repasse.** Quem abrir `/api/proxy?url=...` direto no navegador
   veria o conteúdo repassado na origem do painel, que tem API Keys em
   `localStorage`. Nas respostas do repasse, envie
   `Content-Security-Policy: default-src 'none'; sandbox` e
   `X-Content-Type-Options: nosniff`, e `Content-Disposition: attachment` quando
   o tipo for HTML.
3. **Entrada do repasse.** Limite o tamanho do corpo do POST (ex.: 64 KB) e
   valide os marcadores PEM da chave e do certificado antes de usar. Mantenha a
   ausência de log do corpo. Avalie limitação de uso por IP (melhor esforço) e
   documente o limite da solução.
4. **API Key.** Garanta em `requisitar` que `X-API-KEY` só vai para a origem da
   base do PlugNotas e crie teste. Proponha ao Hugo, sem mudar ainda, um aviso
   na tela de perfis sobre chaves guardadas em `localStorage` e um botão para
   apagar todos os perfis.
5. **Certificado.** Teste que, depois de carregar e usar o A1, nenhum
   armazenamento do navegador contém PEM, senha ou trechos do PFX.
6. **DOM.** Remova `textoSeguro` de `js/shared.js` (não é usado) e troque
   `seletorPerfil.innerHTML = ""` em `js/credencial.js` por `replaceChildren()`.
7. **Varredura de dados sensíveis.** Crie teste que procure em `definicoes/`,
   `js/`, `api/`, `index.html` e documentação padrões de IDs Mongo (24 hex),
   UUIDs, chaves de acesso (44 dígitos), tokens e CNPJs fora de uma lista de
   valores públicos permitidos.
8. **Integridade do forge.** Registre o SHA-256 de `assets/vendor/forge.min.js`
   num teste e renomeie o arquivo para incluir a versão
   (`forge-1.4.0.min.js`), ajustando o carregamento em `js/certificado.js`.
9. Rode `npm audit` em `testes/` e reporte.

## B2. Prioridade 1 · Clean code

1. **Código e estilo mortos.** Remova, depois de confirmar com busca: a
   referência a `curadorAutorBadge` em `atualizarRotuloUsuario` (resto do antigo
   modo curador); as classes CSS sem uso `brand-logo`, `bloco-json`,
   `logsDetails`, `depara-descricao`, `tabela-valores`, `depara-campos`,
   `depara-origem`; chaves de `CHAVES_ARMAZENAMENTO` sem leitura.
2. **Comentários.** Remova os cabeçalhos de comentário dos módulos, levando para
   o README o que for explicação útil.
3. **Módulos grandes.** Divida mantendo a API pública e os testes:
   - `resolve.js`: orquestração pura e testável separada da tela.
   - `analise.js`: um módulo por domínio (texto, documentos, leiaute,
     retenções, ISS, IBS e CBS) e um agregador `analisarEmissao`.
   - `lote.js`: montagem da entrada, execução e renderização do Retorno.
   - `styles.css`: reorganize por componente, eliminando duplicatas das seções
     acrescentadas em rodadas diferentes.
4. **Duplicação.** Unifique o componente de toggle (Resolve e telas agrupadas),
   a montagem de cartões e os construtores de popup.
5. **Prefixo de armazenamento.** As chaves usam o prefixo legado
   `resolve-tools:`. Proponha migrar para `painel-nfse:` com migração única que
   preserve perfis e preferências; só execute com aprovação.

## B3. Prioridade 2 · Performance

Linha de base medida (tamanhos brutos e com gzip):

| Recurso | Bruto | gzip | Quando carrega |
|---|---|---|---|
| JS da aplicação (16 módulos) | 164 KB | 49 KB | Na abertura, todos |
| styles.css | 34 KB | 7 KB | Na abertura |
| index.html | 9 KB | 3 KB | Na abertura |
| Definições da abertura | 34 KB | 6 KB | Na abertura |
| de-para-nacional.json | 484 KB | 61 KB | Sob demanda |
| ibscbs.json | 185 KB | 29 KB | Sob demanda |
| forge.min.js | 277 KB | 73 KB | Só ao carregar certificado |

Parâmetros de rede atuais: tempo limite de 120 s no PlugNotas e 30 s no
repasse; pool de 5 e 3; Resolve com 3 tentativas a cada 1000 ms e verificação a
cada 10 s. Duração dos testes: `teste-fluxo` cerca de 10 s, `teste-interface`
8 s, `teste-execucao` 10 s, por esperas reais.

Ações:

1. **Carregamento por tela.** `js/app.js` importa todas as telas na abertura.
   Troque por `import()` dinâmico ao abrir cada tela e meça o JS inicial.
2. **Conexões do repasse.** Reaproveite conexões TLS com `https.Agent` em
   `keepAlive`: um agente compartilhado sem certificado e, com certificado,
   agentes por impressão digital num cache pequeno com expiração. Meça p50 e p95
   com `duracaoMs`.
3. **Região da função.** Avalie rodar o repasse em São Paulo (`gru1`) para
   reduzir a latência até o gov.br, conferindo antes na documentação da Vercel
   se o plano da conta permite.
4. **IBS e CBS.** Pré-calcule índices por item e por indOp ao carregar, em vez
   de filtrar as 1.514 relações a cada busca.
5. **Cache.** Com o forge versionado no nome, sirva `assets/vendor/` com cache
   longo e imutável. Mantenha revalidação para `definicoes/`.
6. **Fonte.** Avalie hospedar a Quicksand no próprio site, o que também
   simplifica a CSP.
7. **Testes.** Troque esperas reais por tempo controlado onde possível.

Métricas a acompanhar: KB de JS inicial com gzip; tempo até o menu ficar
interativo; p50 e p95 do repasse; itens por minuto num lote e quantidade de 429;
duração da suíte de testes.

## B4. Prioridade 3 · Testes

Suítes existentes (`testes/`):

| Suíte | Cobre |
|---|---|
| `teste.mjs` (80) | analisador, buscas do de-para e do IBS/CBS, conteúdo das definições, contrato com a documentação do PlugNotas |
| `teste-fluxo.mjs` (17) | cliente HTTP, tempo limite, Retry-After, 429, cancelamento, pool |
| `teste-proxy.mjs` (16) | controle de acesso do repasse e dicas de erro |
| `teste-interface.mjs` (81) | identidade, títulos, telas agrupadas, grupo Empresa, de-para, popup, IBS/CBS, validador, painel de logs |
| `teste-execucao.mjs` (37) | Resolve, rotas de lote e de conjunto, Nacional com e sem certificado, Retorno visível |
| `teste-atualizacao.mjs` (14) | leitura de definições, formato inválido, repositório fora do ar, botão Repositório |
| `teste-certificado.mjs` (13) | leitura de PFX legado e moderno, TLS com certificado contra servidor que o exige |
| `teste_fontes.py` (11) | JSON gerado contra as planilhas dos anexos, por leitura independente |

Checklist:

- [ ] `npm test` e `teste_fontes.py` verdes antes e depois de cada commit.
- [ ] Novo `testes/teste-seguranca.mjs`: CSP e cabeçalhos no `vercel.json`;
      cabeçalhos da resposta do repasse; limite do corpo e validação de PEM;
      varredura de sinks proibidos em `js/`; varredura de dados sensíveis;
      `X-API-KEY` só para a base do PlugNotas; certificado ausente de todo
      armazenamento; hash do forge.
- [ ] Novo `testes/teste-desempenho.mjs` com orçamentos: JS inicial com gzip no
      máximo igual à linha de base (49 KB), apertando depois do carregamento
      por tela; filtro do de-para nas 430 tags abaixo de 50 ms; busca de IBS/CBS
      abaixo de 20 ms; `analisarEmissao` de um JSON típico abaixo de 50 ms.
- [ ] Testes unitários para cada módulo extraído na refatoração.
- [ ] Teste de regressão para todo defeito corrigido.
- [ ] Teste de contrato atualizado sempre que uma rota mudar, depois de conferir
      a documentação do PlugNotas.
- [ ] Registre `executar.mjs` em `testes/package.json` para as novas suítes.

## B5. Definição de pronto

- Todas as suítes verdes, com as novas de segurança e desempenho.
- Nenhuma decisão da seção A8 alterada sem aprovação registrada.
- `docs/revisao-rodada-1.md` escrito com métricas antes e depois.
- README e manual atualizados quando a interface ou um fluxo mudar.
- Esta Parte B movida para `docs/` e substituída por um resumo.
