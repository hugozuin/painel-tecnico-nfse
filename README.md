# Painel Técnico NFS-e

Ferramenta interna da Consultoria Técnica NFS-e. Reúne as operações da API
PlugNotas e do Ambiente Nacional, o de-para do XML do Nacional, a relação de
dados do IBS e da CBS e um validador do JSON de emissão.

A aplicação roda no navegador do consultor. As chamadas ao PlugNotas saem
direto do navegador com a API Key informada na tela, que nunca passa pelo
servidor desta ferramenta.

## Telas

**Notas, Arquivos e Ciclo de vida.** Uma tela por rota da API PlugNotas:
resolve em lote com conferência da situação antes e depois, a consulta de notas numa tela só (por ID, idIntegracao ou período, com opção de consulta completa pelo ID),
download de XML e PDF, regeração de PDF, e-mail, cancelamento e status,
eventos, sincronização e interrupção. As que alteram dado pedem confirmação
e aparecem marcadas no menu.

**Empresa.** Cadastro da empresa (por CNPJ, todas da conta e logotipo),
Webhook (da empresa ou da organização, com envio de teste) e Certificado (por ID
ou CPF/CNPJ, ou todos da conta). São telas de leitura; a única ação é o envio de
teste do webhook, que pede confirmação. Os caminhos foram conferidos na
documentação do PlugNotas.

**Nacional.** Consultas públicas do ADN e da Sefin (convênio, alíquota,
benefício, CNC, NFSe por chave, DPS e DANFSe), com escolha entre produção e
produção restrita. Cada consulta mostra o retorno completo num campo
próprio, com status HTTP, tipo do conteúdo, tempo e a URL chamada. Algumas
consultas exigem certificado digital na conexão: o consultor carrega um A1
ICP-Brasil (.pfx ou .p12) e a senha na tela. O arquivo e a senha são lidos no
navegador, e só a chave e o certificado seguem para o repasse durante a
consulta, sem serem guardados. A senha é apagada do campo depois de cada
leitura do arquivo, com ou sem sucesso.

**De-para do Nacional.** Cada tag do XML aparece pelo nome do leiaute e pela
descrição do anexo VI, por exemplo tpRetISSQN, Tipo de retencao do ISSQN. A
busca cobre tag, descrição, caminho, código de rejeição (E0580) e campo do
JSON. O ícone de informação abre as regras de negócio, a descrição completa e
as notas explicativas; Shift ou clique fixam o popup para ler e copiar, e Esc
fecha. Quando a cadeia fecha nos arquivos analisados, a tag mostra o campo do
JSON e o campo do TX2 que a preenchem.

**Relação IBS e CBS.** Pesquisa por item da LC 116 ou por código de operação
(indOp) e mostra NBS, indOp, local de incidência e cClassTrib, cada código com
a descrição dos anexos VII e VIII no ícone de informação.

**Validador de JSON.** Confere o corpo do POST /nfse no próprio navegador.
Cada achado informa a fonte (anexo VI, VII ou VIII, lib do PlugNotas, script do
Nacional ou cálculo sobre o JSON) e liga as tags afetadas ao popup de regras.

## De onde vem cada informação

Nada do de-para, da relação IBS e CBS ou das mensagens do validador é escrito
à mão. O gerador lê:

- anexo VI (leiaute e regras de negócio), anexo VII (indOp) e anexo VIII
  (correlação), que são públicos e ficam em `fontes/nacional`;
- o `Mapping.txt` e o `LoadEnvio.txt` do padrão Nacional e as props da lib do
  PlugNotas, que são internos e entram no gerador só por parâmetro.

A ligação do JSON até a tag segue quatro elos: lib (JSON para TX2), script
(TX2 para dataset), mapeamento (dataset para caminho XML) e anexo VI (caminho
para tag). Quando algum elo não fecha nos arquivos, a tela diz isso em vez de
supor. O relatório `ferramentas/relatorio-geracao.json` lista as lacunas.

O JSON publicado guarda nomes de campo e números de linha, nunca trechos de
código.

## Como regenerar as definições

Requer Python 3.10 ou mais novo e openpyxl (`pip install openpyxl`).

```
python ferramentas/gerar_definicoes.py --anexos fontes/nacional \
  --script <caminho>/Scripts/Nacional/LoadEnvio.txt \
  --mapeamento <caminho>/Arquivos/Esquemas/Nacional/v1.01/Mapping.txt \
  --lib <caminho>/buildTx2/padrao-NACIONAL/props
```

Sem script, mapeamento e lib, o de-para sai só com o lado do Nacional. Ao
trocar um anexo por versão nova, substitua o arquivo em `fontes/nacional` e
ajuste o nome no topo do gerador.

## Como a ferramenta se atualiza

O repositório é privado, então o código do painel e o gerador ficam acessíveis
só a quem for adicionado como colaborador. O site é aberto, sem login.

Cada commit no branch main gera um deploy automático, em geral em cerca de um
minuto. Isso vale para código, catálogos de rotas, regras do validador e para o
de-para e as tabelas do IBS e da CBS depois de regenerados. Se um deploy falhar,
o anterior continua no ar.

A leitura direta das definições pelo GitHub fica desligada em
`definicoes/config.json` (`atualizacaoRemota: false`), porque só funciona com
repositório público. O guia de cada arquivo está em `definicoes/README.md`.

## Execução local

Duplo clique em `iniciar.bat` no Windows. Ele confere o Node.js, sobe um
servidor na porta 3500 e abre o navegador. As telas do Nacional dependem do
repasse em `api/proxy`, que só existe no ambiente publicado.

## Publicação

Deploy na Vercel a partir do repositório privado, com Framework Preset Other e
sem variável de ambiente. Em Deployment Protection, a Vercel Authentication fica
em Standard Protection: o domínio de produção abre sem login e as prévias de
outros branches continuam protegidas. A pasta `api/` vira função serverless; o
repasse do Nacional aceita GET, ou POST com o certificado do consultor, e apenas os domínios do gov.br listados em
`api/proxy.js`. O `.vercelignore` deixa o gerador, os anexos e os READMEs fora do
site.

## Segurança

- **Cabeçalhos do site** (`vercel.json`): `nosniff`, `Referrer-Policy` e
  `X-Robots-Tag` em tudo. Nas páginas, fora de `/api/`, também valem a
  Content-Security-Policy (scripts só do próprio site, estilos do próprio site e
  da folha do Google Fonts, arquivos de fonte do Google Fonts, conexões só com o
  próprio site e a API PlugNotas, sem objetos, sem moldura e sem formulário), a
  Permissions-Policy (câmera, microfone e localização desligados) e
  `Cross-Origin-Opener-Policy: same-origin`. Se a
  leitura remota das definições for religada, `https://raw.githubusercontent.com`
  precisa entrar no `connect-src`; o teste de segurança cobra isso.
- **API Key**: só segue para `https://api.plugnotas.com.br`. Qualquer outro
  destino com chave é recusado antes de sair do navegador.
- **Repasse**: toda resposta sai com CSP `sandbox`, `nosniff` e `no-store`, e
  HTML ou SVG do Nacional vira download. A entrada aceita só `https`, os
  domínios da lista na porta padrão, sem usuário e senha na URL, corpo até
  64 KB e certificado com o formato PEM conferido. Cada consulta tem prazo
  total de 30 s, e respostas acima de 4 MB viram erro explicado. Não há
  limitador por IP no código; a recomendação é uma regra de rate limit no WAF
  da Vercel (detalhes na seção 5.5 do CLAUDE.md).
- **Listas de identificadores**: os itens `.` e `..` são recusados com aviso,
  porque mudariam o caminho da rota chamada.
- **Forge**: vendorizado com a versão no nome (`assets/vendor/forge-1.4.0.min.js`)
  e carregado com SRI. O `.gitattributes` impede que o Git troque o fim de linha
  e altere o hash.

## Estrutura

```
index.html               estrutura, menu lateral e modais
styles.css               tema claro e escuro alinhado à marca
assets/                  logo, ícone, favicon e vendor/forge-1.4.0.min.js
js/app.js                menu, título de cada tela e montagem das telas
js/definicoes.js         leitura das definições, com carregamento sob demanda
js/info.js               ícone de informação e popup fixável
js/tags.js               conteúdo do popup de cada tag do anexo VI
js/analise.js            conferências do validador, com fonte em cada achado
js/telas/                telas de rota, resolve, Nacional, de-para, IBS e CBS e validador
api/proxy.js             repasse das consultas públicas do Nacional
definicoes/              catálogos, regras, de-para e tabelas do IBS e da CBS
fontes/nacional/         anexos VI, VII e VIII
ferramentas/             gerador das definições e relatório da última geração
```

## Limitações conhecidas

A lib e o script do Nacional usam nomes de TX2 diferentes em alguns campos
(por exemplo, a lib gera ValorIRRF e o script lê ValorIR). Nesses casos o
de-para mostra o campo do TX2 lido pelo script e informa que o campo do JSON
não foi identificado. O código que grava o TX2 a partir das props não estava
entre os arquivos analisados.

O `Mapping.txt` do componente é da v1.01 e alguns caminhos dele não existem no
leiaute RTC do anexo VI, como vDedRed. Essas tags aparecem sem o lado do
PlugNotas.

O validador cobre as regras que dá para conferir com o JSON e os documentos.
Regras que dependem de parametrização municipal ou de cadastro no ADN ficam
visíveis no popup, mas não são conferidas.
