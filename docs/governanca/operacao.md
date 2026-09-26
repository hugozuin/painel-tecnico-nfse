# Arquitetura e operação

## Arquitetura simplificada

```
Navegador do consultor
 ├─ site estático (HTML, CSS, JS em módulos ES, sem build)
 ├─ API PlugNotas (https://api.plugnotas.com.br), direto, com a API Key da tela
 └─ /api/proxy (função Node 24 na Vercel, região gru1)
      └─ ADN e Sefin do Nacional (gov.br), com o A1 do consultor quando a rota exige
/api/saude (função Node 24): verificação de saúde
```

- A API Key nunca passa pelo servidor da ferramenta: o navegador chama a API
  PlugNotas direto, e o código recusa enviar a chave a qualquer outra origem.
- O navegador não chama o gov.br direto (sem CORS). O repasse aceita só
  `https`, os domínios da lista e a porta padrão, com corpo até 64 KB, prazo de
  30 s e resposta até 4 MB.
- O certificado A1 é lido no navegador (node-forge, com SRI). A senha não sai
  do navegador; a chave e a cadeia seguem ao repasse só durante a consulta, e a
  conexão com certificado é fechada ao fim.
- Detalhes em `CLAUDE.md` (seções 5 e 6) e no `README.md`.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Front-end | HTML, CSS e JavaScript em módulos ES, sem framework e sem build |
| Função | Node.js 24 (Vercel Functions) |
| Biblioteca no navegador | node-forge 1.4.0 vendorizado, com SRI |
| Fonte | Quicksand v37 vendorizada, licença OFL |
| Ferramentas | Python 3.10+ (openpyxl, reportlab, svglib) |
| Testes | Node com jsdom e node-forge; Python com openpyxl |

### Justificativa da stack

O Padrão Técnico recomenda React ou Vue.js, e outra tecnologia exige
justificativa aprovada por Arquitetura na aplicação crítica. O front-end usa a
própria plataforma web, sem framework, porque:

- a aplicação é pequena e guiada por catálogo (`definicoes/`), sem estado
  compartilhado complexo;
- sem etapa de build e sem dependências de runtime, a superfície de cadeia de
  suprimentos é mínima (uma biblioteca vendorizada, com SRI);
- a CSP pode ser estrita (`script-src 'self'`, nada inline);
- migrar para React ou Vue custaria semanas, traria build e dependências e não
  entregaria ganho funcional.

Node.js e Python, usados na função e nas ferramentas, estão na lista
homologada.

## Integrações e dependências externas

| Integração | Uso | Autenticação |
|---|---|---|
| API PlugNotas | Todas as telas do PlugNotas | API Key do consultor, direto do navegador |
| ADN e Sefin do Nacional (produção e produção restrita) | Telas do Nacional | Sem autenticação, ou A1 do consultor |
| Vercel | Hospedagem do site e das funções | Conta do responsável técnico (em exceção) |
| GitHub | Repositório (deploy automático a cada commit no main) | Conta do responsável técnico (em exceção) |

## Implantação

1. Commit no branch `main` gera deploy automático na Vercel, em geral em
   cerca de um minuto. A Vercel não roda os testes: até existir pipeline, o
   gancho `.githooks/pre-push` roda o `npm test` antes de cada push (ative uma
   vez por clone com `git config core.hooksPath .githooks`).
2. Depois do deploy, confira `GET /api/saude` (versão esperada) e os
   cabeçalhos com `curl -sI` na produção.
3. Configuração da Vercel: Framework Preset "Other", sem comando de build e
   sem variáveis de ambiente; região das funções em `vercel.json`.

## Recuperação

- **Deploy com problema:** no painel da Vercel, promova o deploy anterior
  (Instant Rollback) ou reverta o commit no `main` (`git revert`), o que gera
  um deploy novo.
- **Dados:** não há dado persistido para restaurar. Código, definições e
  manual estão no Git.
- **RTO e RPO:** não definidos formalmente. Proposta: RTO de 1 hora (tempo de
  um rollback) e RPO zero, porque não há dado.

## Guia de operação

| Sinal | Onde ver | O que fazer |
|---|---|---|
| Saúde da função | `GET /api/saude` responde 200 com a versão | Se falhar, conferir o deploy e os logs da função |
| Consultas ao Nacional | Log da função: uma linha JSON por consulta (`evento: "repasse-nacional"`) | Muitos 502 com `ETIMEDOUT`: instabilidade do Nacional; muitos 403: alguém tentando usar o repasse para outros destinos |
| Abuso do repasse | Log da função e regra de rate limit no WAF da Vercel (pendente) | Ajustar o limite da regra |
| Erros de tela | Painel de logs da sessão (botão Logs) e exportação em TXT | Anexar o log exportado ao chamado |

## Sustentação (proposta, a confirmar pelo responsável de negócio)

- **Responsável técnico:** Hugo Zuin.
- **Suporte:** canal a definir pela área; até lá, contato direto com o
  responsável técnico.
- **Escopo:** correções e evolução pelo responsável técnico; a Consultoria
  Técnica reporta falhas com o log exportado.
- **SLA:** não formal. Uso interno, com alternativa manual (interface do
  PlugNotas) se o Painel ficar fora do ar.
- **Continuidade:** indicar um segundo mantenedor, que também pode ser o
  revisor independente.

## Uso de IA

- **Na aplicação:** nenhum. O Painel não usa modelo, agente nem MCP em
  execução.
- **No desenvolvimento:** o código foi escrito com apoio do Claude Code
  (assistente de programação da Anthropic). Todo código gerado passa pelas
  suítes de teste e pela revisão do responsável técnico; na aplicação crítica,
  falta a revisão independente.
- **Pendências da política de IA:** confirmar com Tecnologia que a ferramenta
  é homologada e passar a usá-la com conta corporativa. Os insumos internos do
  PlugNotas (scripts, `Mapping.txt`, lib) não entram no repositório e não
  devem ser enviados a ferramentas de IA não homologadas.
