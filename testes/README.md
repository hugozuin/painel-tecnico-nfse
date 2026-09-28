# Testes

Suítes automatizadas do Painel Técnico NFS-e: cerca de 650 verificações em 13
suítes Node, mais a conferência dos dados contra as planilhas dos anexos e a
verificação de CSP num navegador real.

## Comandos

```bash
cd testes
npm install                 # uma vez
npm test                    # todas as suítes
npm run test:detalhes       # cada verificação, uma por linha
npm run verificar:csp       # CSP e SRI num Chrome ou Edge real (fora do npm test)
```

```bash
python testes/teste_fontes.py     # na raiz; exige Python 3.10+ e openpyxl
```

Para o `git push` rodar o `npm test` antes de enviar, ative o gancho uma vez por
clone, na raiz do repositório:

```bash
git config core.hooksPath .githooks
```

> [!NOTE]
> O deploy da Vercel não roda os testes, e todo commit no `main` vai ao ar.
> O `npm test` verde antes de cada commit é obrigatório.

## Suítes

| Suíte | O que cobre |
|---|---|
| `teste.mjs` | De-para, IBS e CBS, validador ponta a ponta e contrato das rotas |
| `teste-analise.mjs` | Cada conferência de `js/analise/` chamada direto, com um caso que dispara e uma nota limpa |
| `teste-fluxo.mjs` | Cliente HTTP: resolve, tentativas, Retry-After, cancelamento e pool |
| `teste-resolve.mjs` | Regras e orquestração do Resolve com a API simulada, inclusive o cancelamento |
| `teste-componentes.mjs` | Cartão, interruptor, popup, máscaras dos campos e o motor das telas de rota |
| `teste-proxy.mjs` | Controle de acesso, dicas de erro, log e saúde das funções de `api/` |
| `teste-interface.mjs` | A aplicação montada no jsdom, tela a tela |
| `teste-execucao.mjs` | Execução das rotas no jsdom: lotes, Nacional pelo repasse, certificado e máscaras |
| `teste-atualizacao.mjs` | Leitura e conferência das definições |
| `teste-certificado.mjs` | Leitura do A1 e conexão TLS com certificado de cliente |
| `teste-seguranca.mjs` | Garantias de segurança (abaixo) |
| `teste-padroes.mjs` | Sem comentários em `js/`, `api/`, CSS e Python |
| `teste-desempenho.mjs` | Orçamentos de desempenho (abaixo) |

O `executar.mjs` roda as suítes com a raiz do repositório como pasta de
trabalho, define a variável `NODE_EXTRA_CA_CERTS` usada no teste de
certificado e reprova a suíte que passar de 180 s sem terminar.

### Segurança

`teste-seguranca.mjs` reúne as garantias de segurança:

- varredura de sinks proibidos no DOM (`innerHTML`, `eval` e afins);
- integridade do forge vendorizado;
- destino da API Key: só a API PlugNotas;
- cabeçalhos do `vercel.json`, com a CSP conferida contra a página, os estilos
  e as imagens;
- entrada e saída do repasse, com o Nacional simulado e sem rede;
- certificado A1 sem vestígio em armazenamentos, cookie, logs, DOM, campos,
  área de transferência e arquivos exportados;
- varredura de dados sensíveis (IDs do Mongo, UUIDs, chaves de acesso, tokens,
  CNPJs, CPFs e e-mails) em tudo o que o Git versiona.

Os padrões e a lista de permitidos da varredura ficam em `sigilo.mjs`. **Cada
valor permitido precisa ter fonte pública.**

### Desempenho

| Orçamento | Limite |
|---|---|
| JS da abertura, com gzip | 49 KB |
| Filtro do de-para | 50 ms |
| Busca do IBS e da CBS | 20 ms |
| `analisarEmissao` | 50 ms |

## Verificação no navegador

`npm run verificar:csp` abre o Chrome ou o Edge em modo headless, serve o site
com os cabeçalhos do `vercel.json`, percorre todas as telas, carrega o forge
pelo fluxo real do certificado e falha se houver violação de CSP ou se o SRI
barrar o forge.

- Exige internet: o repasse é simulado, mas a consulta de teste vai à API
  PlugNotas com uma chave fictícia e volta 401.
- Outro navegador: `node verificar-csp.mjs <caminho do executável>`.
- Em Linux como root, o Chromium só abre com `--no-sandbox`: passe um script
  que chame o navegador com essa opção.

## Certificados de teste

`certificados/` recebe certificados autoassinados, válidos por 10 anos, que
`gerar-certificados.mjs` cria quando faltam. O `npm test` e o `verificar:csp`
chamam o gerador; para rodar uma suíte sozinha pela primeira vez, use
`node gerar-certificados.mjs`.

- A pasta fica **fora do Git**: o padrão técnico proíbe chave privada e
  certificado versionados.
- Não são ICP-Brasil e não servem para nenhuma consulta real.
- O `cliente-legado.pfx` usa RC2-40 nos certificados e 3DES na chave, o mesmo
  formato de muitos A1, para garantir que a leitura no navegador funciona onde
  o Node recusa.

## Boas práticas

- **Esperas:** prefira o relógio simulado do `node:test` (`mock.timers`) para
  esperas longas da aplicação e o `aguardarAte(condicao)` das suítes de
  interface e execução para esperar uma tela ou uma chamada. Espera fixa só
  para debounce de digitação e para conferir que algo não aconteceu.
- **Defeitos:** todo defeito corrigido ganha um teste que falha no código
  antigo.
- **Dados:** só valores fictícios ou públicos. A varredura de sigilo cobre os
  próprios testes.
