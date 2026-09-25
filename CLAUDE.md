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

## 2. Comandos

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

## 3. Stack e dependências

- **Front-end:** HTML, CSS e JavaScript em módulos ES, sem framework e sem etapa
  de build. `index.html` carrega `js/app.js`.
- **Função serverless:** `api/proxy.js` na Vercel, Node `24.x` (campo `engines`
  do `package.json`; a Vercel descontinua o Node 20 para builds e funções em
  01/10/2026).
- **Biblioteca no navegador:** node-forge 1.4.0 vendorizado em
  `assets/vendor/forge-1.4.0.min.js` (licença em `forge-LICENSE.txt`), carregado
  sob demanda com SRI (`BIBLIOTECA_FORGE` em `js/certificado.js`) só para ler o
  certificado A1. Nada vem de CDN. Para atualizar: trocar o arquivo e o nome com
  a nova versão, a versão em `testes/package.json`, a integridade em
  `BIBLIOTECA_FORGE` e o SHA-256 em `testes/teste-seguranca.mjs`. O
  `.gitattributes` impede a conversão de fim de linha em `assets/vendor/` e nos
  PDFs, que mudaria o hash num clone com `core.autocrlf=true`.
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

## 4. Estrutura do repositório

```
index.html              estrutura, cabeçalho (Logs, Documentação, tema), menu lateral, modais, painel de logs
styles.css              tema claro e escuro com tokens da marca (índigo, Quicksand)
assets/                 logo.svg e logoicon.svg (brancos), favicon.svg (fundo índigo), vendor/forge-1.4.0.min.js
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
.vercelignore           ferramentas, fontes, iniciar.bat, README.md, testes, CLAUDE.md, .gitattributes
.gitattributes          sem conversão de fim de linha em assets/vendor/ e nos PDFs
```

Tamanho atual dos módulos maiores: `resolve.js` 695 linhas, `analise.js` 571,
`lote.js` 484, `styles.css` 1026.

## 5. Arquitetura e fluxos

### 5.1 Telas guiadas por catálogo

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

### 5.3 Motor das telas de rota (`js/telas/lote.js`)

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
  Resolve faz isso (decisão da seção 8).

### 5.4 Resolve (`js/telas/resolve.js`, `js/plugnotas.js`)

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

### 5.5 Nacional e certificado

- O navegador não chama o gov.br direto (sem CORS). As telas do Nacional usam
  `api/proxy`: `GET ?url=` sem certificado, ou `POST` com
  `{ url, certificado: { chave, certificado } }` em PEM.
- O repasse só aceita `https` e os domínios exatos de `DOMINIOS_LIBERADOS`
  (adn e sefin, produção e produção restrita). Tempo limite de 30 s. Erros viram
  502 com `erro`, `codigo`, `dica` e `certificadoEnviado`.
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
- O log da sessão registra de onde cada definição veio.

### 5.7 De-para e gerador

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

### 5.8 Validador

- `js/analise.js` (conferências calculadas) e `definicoes/regras-validacao.json`
  (regras declarativas com `fonte` e `tags` obrigatórios).
- Tipos de regra: `obrigatorio`, `digitos` (número ou lista), `formato`,
  `tamanho`, `faixa`, `enumerado`, `condicional` e `umDeles`.
- Todo achado tem `fonte`: anexo VI, VII ou VIII, lib do PlugNotas, script do
  Nacional ou cálculo sobre o JSON. Regras sem fonte nos documentos foram
  removidas; não reintroduza.

### 5.9 Interface transversal

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

## 6. Requisitos de segurança (obrigatórios)

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
   nunca incluir em exportação. `X-API-KEY` só pode ir para a origem fixa
   `ORIGEM_PLUGNOTAS` (`js/plugnotas.js`): `requisitar` recusa, sem chamar o
   `fetch`, qualquer outro destino com chave, e a `base` do `rotas.json` tem de
   ser igual a ela (teste de contrato). Nenhum código envia a chave por fora de
   `requisitar`.
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

## 9. Pendências e limitações conhecidas

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
