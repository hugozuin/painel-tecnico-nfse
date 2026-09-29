# Definições

Os arquivos desta pasta dizem ao painel **o que mostrar e como chamar cada
rota**. Uma tela nova, um campo a mais ou uma regra do validador entram aqui,
sem mexer no código.

> [!IMPORTANT]
> Cada commit no `main` gera um deploy automático na Vercel, e a alteração
> passa a valer em cerca de um minuto. Rode `cd testes && npm test` antes de
> cada commit: o deploy não roda os testes.

## Sumário

- [Arquivos](#arquivos)
- [Catálogo de rotas](#catálogo-de-rotas)
- [Telas agrupadas](#telas-agrupadas)
- [Catálogo do Nacional](#catálogo-do-nacional)
- [Regras do validador](#regras-do-validador)
- [Configuração](#configuração)
- [Arquivos gerados](#arquivos-gerados)
- [Checklist antes de publicar](#checklist-antes-de-publicar)

## Arquivos

| Arquivo | Conteúdo | Edição |
|---|---|---|
| `rotas.json` | Rotas da API PlugNotas: uma tela por rota | À mão |
| `rotas-nacional.json` | Consultas do ADN e da Sefin | À mão |
| `regras-validacao.json` | Regras declarativas do validador | À mão |
| `config.json` | Leitura remota e botão Repositório | À mão |
| `de-para-nacional.json` | De-para do anexo VI | **Gerado**, não editar |
| `ibscbs.json` | Anexos VII e VIII (indOp, itens, NBS, cClassTrib) | **Gerado**, não editar |

Todo arquivo passa por uma conferência de formato ao abrir o painel. Se falhar,
o problema aparece no painel de Logs.

## Catálogo de rotas

Cada item de `rotas` em `rotas.json` vira um item de menu e uma tela.

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
      "destino": "corpo.destinatarios", "dica": "Separe por vírgula." },
    { "id": "reenvio", "rotulo": "Marcar como reenvio", "tipo": "booleano", "padrao": true, "destino": "corpo.reenvio" }
  ],
  "resultado": { "tipo": "mensagem" },
  "confirmar": "Um e-mail será enviado para os destinatários informados, com a nota de cada id da lista.",
  "sensivel": true,
  "ordem": 4
}
```

### Atributos da rota

| Atributo | Obrigatório | Descrição |
|---|---|---|
| `id` | Sim | Identificador único; vira o endereço da tela (`#email`) |
| `titulo` | Sim | Nome no menu e no topo da tela |
| `caminho` | Sim* | Caminho na API, com `{item}` e `{campo}` a substituir. *Dispensado nas telas com `tela` |
| `grupo` | Não | Grupo do menu (Notas, Arquivos, Ciclo de vida, Empresa) |
| `resumo` | Não | Legenda exibida abaixo do título |
| `metodo` | Não | `GET` (padrão) ou `POST` |
| `entrada` | Não | Como a lista de itens é lida (abaixo) |
| `campos` | Não | Campos fixos da tela, que valem para todos os itens |
| `parametroItem` | Não | Leva o item para a query ou o corpo em vez do caminho (ex.: `consulta.inscricaoFederal`) |
| `resultado` | Não | Como a resposta é exibida (abaixo) |
| `observacao` | Não | Aviso em destaque no cartão Requisição |
| `sensivel` e `confirmar` | Para rotas que alteram dados | Marca a rota no menu e pede confirmação com o texto de `confirmar` |
| `oculta` | Não | Esconde do menu; usada pelas telas agrupadas |
| `ordem` | Não | Posição no grupo |

### `entrada.tipo`

| Valor | Comportamento |
|---|---|
| `lote` | Uma chamada por item da lista, com `{item}` no caminho ou `parametroItem` |
| `lote-conjunto` | Uma única chamada, com a lista inteira num array no corpo |
| `formulario` | Uma chamada, sem lista, só com os campos |

A lista aceita quebra de linha, espaço, vírgula ou ponto e vírgula como
separador, e os repetidos saem. Os itens `.` e `..` são recusados.

### Atributos de `campos[]`

| Atributo | Descrição |
|---|---|
| `id`, `rotulo` | Identificador e nome exibido |
| `tipo` | `texto`, `lista` (separada por vírgula), `booleano`, `selecao` (com `opcoes`), `data` ou `competencia` (AAAA-MM) |
| `destino` | Onde o valor vai: `corpo.x`, `caminho.x` ou `consulta.x` |
| `obrigatorio` | Recusa a execução com o campo vazio |
| `padrao` | Valor inicial do `booleano` |
| `dica` | Texto de ajuda abaixo do campo |
| `exemplo` | Texto de exemplo dentro do campo |
| `somenteNumeros` | Remove tudo o que não é dígito antes do envio |
| `mascara` | Formata o campo enquanto o consultor digita (abaixo) |

### Máscaras

`mascara` formata o valor durante a digitação, limita o tamanho do campo e
recusa o valor incompleto antes de chamar a API.

| Valor | Resultado | Uso atual |
|---|---|---|
| Padrão com `9` para dígito e `.`, `/` ou `-` como separador | `99.99.99.999` vira `06.04.01.002` | Código de tributação (alíquota) |
| `9999999` | Só dígitos, até 7 | Código IBGE do município (CNC) |
| `cnpj` | `00.000.000/0000-00` | CNPJ do prestador (consulta por idIntegracao) |
| `cpf` | `000.000.000-00` | Nenhum |
| `cpfCnpj` | CPF até 11 dígitos, CNPJ acima disso | Consulta por período, benefício |

Com `somenteNumeros`, os separadores saem antes do envio; sem ele, o valor
segue formatado, como o código de tributação no caminho da alíquota.

### `resultado.tipo`

| Valor | Exibição |
|---|---|
| `tabela` | Uma linha por item, com as `colunas` (`campo` e `titulo`) lidas da resposta |
| `json` | A resposta formatada |
| `arquivo` | Download de um arquivo por item; `extensao` fixa ou deduzida do Content-Type, `prefixo` no nome |
| `mensagem` | A mensagem devolvida pela API |

Em todos os casos, o cartão **Retorno** mostra a resposta crua.

> [!WARNING]
> Em `rotas.json`, `base` fica fixa em `https://api.plugnotas.com.br`
> (`ORIGEM_PLUGNOTAS` em `js/plugnotas.js`). É a única origem que recebe a API
> Key e que está no `connect-src` da CSP. Com outra base, o painel recusa todas
> as chamadas com chave. Rota nova ou alterada precisa ser conferida na
> [documentação do PlugNotas](https://docs.plugnotas.com.br) e entrar no teste
> de contrato.

## Telas agrupadas

Uma tela agrupada junta rotas parecidas com um seletor e, opcionalmente, um
interruptor, ambos dentro do cartão Requisição.

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
    { "id": "periodo", "rotulo": "Período", "rota": "consulta-periodo" }
  ]
}
```

- `variantes[].rota` aponta para uma rota com `"oculta": true`.
- Sem `alternancia`, o interruptor não aparece. Variante sem `alternativa`
  desabilita o interruptor e mostra o texto de `indisponivel`.
- A escolha fica salva no navegador, por tela.

## Catálogo do Nacional

`rotas-nacional.json` segue o mesmo formato, com duas diferenças:

- `ambientes` lista produção e produção restrita, com o endereço do ADN e da
  Sefin de cada um; o consultor escolhe na tela.
- Cada rota tem `servidor`: `adn` ou `sefin`.

As consultas passam pelo repasse `api/proxy`, com o certificado A1 carregado na
tela. Domínio novo também precisa entrar em `DOMINIOS_LIBERADOS`, em
`api/proxy.js`, com teste.

## Regras do validador

`regras-validacao.json` traz as regras declarativas. As conferências que
exigem cálculo ficam em `js/analise/`.

```json
{
  "id": "servico-codigo-digitos",
  "campo": "servico[].codigo",
  "tipo": "digitos",
  "quantidade": 6,
  "severidade": "erro",
  "titulo": "Código do serviço sem 6 dígitos",
  "mensagem": "O script do Nacional remove a máscara e exige exatamente 6 dígitos.",
  "fonte": "Script do Nacional (LoadEnvio.txt) e anexo VI (cTribNac, tamanho 6)",
  "tags": ["NFSe/infNFSe/DPS/infDPS/serv/cServ/cTribNac"]
}
```

| Atributo | Descrição |
|---|---|
| `id`, `titulo`, `mensagem` | Identificação e texto do achado |
| `campo` | Caminho no JSON; `[]` vale para cada item da lista (`servico[].iss.aliquota`), e o achado cita o caminho real (`servico[0].iss.aliquota`) |
| `tipo` | Tipo da conferência (abaixo) |
| `severidade` | `erro`, `alerta` ou `informacao` |
| `fonte` | **Obrigatório.** O documento que sustenta a regra |
| `tags` | Caminhos completos do anexo VI; ligam o achado ao popup de regras |

| Tipo | Parâmetros | Confere |
|---|---|---|
| `obrigatorio` | Nenhum | Campo presente e preenchido |
| `digitos` | `quantidade` (número ou lista) | Quantidade de dígitos, ignorando a máscara |
| `formato` | `expressao` | Expressão regular |
| `tamanho` | `minimo`, `maximo` | Quantidade de caracteres |
| `faixa` | `minimo`, `maximo` | Valor numérico |
| `enumerado` | `valores` | Valor dentro da lista |
| `condicional` | `quandoValorEm` ou `quandoPreenchido`, e `exige` | Um campo exige outro |
| `umDeles` | `alternativas` | Ao menos um dos campos presente |

`apelidos` lista nomes de campo escritos errado com frequência e o nome certo,
para o validador sugerir a correção.

> [!CAUTION]
> Regra sem fonte documentada não entra. Nada de conhecimento geral: se não for
> possível apontar o anexo, a documentação, a lib, o script ou o cálculo que a
> sustenta, a regra fica de fora.

## Configuração

| Chave de `config.json` | Valor atual | Efeito |
|---|---|---|
| `atualizacaoRemota` | `false` | Leitura das definições direto do GitHub. Desligada porque o repositório é privado |
| `botaoRepositorio` | `false` | Exibe o botão Repositório no cabeçalho, apontando para `repositorio` |
| `repositorio`, `branch`, `pasta` | | Endereço usado pela leitura remota e pelo botão |

Religar `atualizacaoRemota` exige incluir `https://raw.githubusercontent.com`
no `connect-src` do `vercel.json`. Sem isso, a CSP bloqueia a leitura e o
painel usa a cópia publicada. O teste de segurança cobra essa ligação.

## Arquivos gerados

`de-para-nacional.json` e `ibscbs.json` saem de
`ferramentas/gerar_definicoes.py`, a partir dos anexos e da NT 009 em
`fontes/nacional`, da documentação pública da API, dos insumos internos do
PlugNotas e da conferência de notas reais. A próxima geração sobrescreve
qualquer edição manual: para corrigir um conteúdo, corrija a fonte e gere de
novo. O de-para está no formato 3 (lado do PlugNotas com origens, conversões,
condições, documentação e inconsistências); o formato está descrito no
[README das ferramentas](../ferramentas/README.md).

As regras de IBS e CBS de `regras-validacao.json` usam `servico[].ibscbs`, o
lugar que a documentação da API dá ao grupo.

## Checklist antes de publicar

- [ ] O JSON é válido.
- [ ] Nenhum dado real de cliente: CNPJ, razão social, chave de acesso, ID e
      API Key são fictícios ou públicos.
- [ ] Rota nova conferida na documentação do PlugNotas e no teste de contrato.
- [ ] Regra nova com `fonte`.
- [ ] `cd testes && npm test` verde. A varredura de dados sensíveis cobre esta
      pasta.
