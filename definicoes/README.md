# Como alimentar a ferramenta

Esta pasta é o que o painel lê para saber o que fazer. Cada commit no branch
main gera um deploy automático na Vercel, e a alteração passa a valer em cerca
de um minuto. Quem for colaborar precisa ser adicionado ao repositório privado.

## Arquivos escritos à mão

**config.json** guarda o endereço do repositório e duas chaves. `atualizacaoRemota`
fica em false porque o repositório é privado. `botaoRepositorio` controla o botão
Repositório no cabeçalho: false oculta, true exibe apontando para `repositorio`.
Religar `atualizacaoRemota` exige incluir `https://raw.githubusercontent.com` no
`connect-src` do `vercel.json`; sem isso a CSP bloqueia a leitura e o painel usa
a cópia publicada. O teste de segurança cobra essa ligação.

**rotas.json** e **rotas-nacional.json** são os catálogos de rotas. Cada item
vira uma tela no menu, com título, legenda (`resumo`), método, caminho,
campos e formato do resultado. Em rotas.json, `base` fica fixa em
`https://api.plugnotas.com.br` (`ORIGEM_PLUGNOTAS` em `js/plugnotas.js`), a
única origem que recebe a API Key e que está no `connect-src`. Com outra base,
o painel recusa todas as chamadas com chave.

- `entrada.tipo`: `lote` (uma chamada por linha, com `{item}` no caminho),
  `lote-conjunto` (a lista inteira no corpo) ou `formulario`.
- `resultado.tipo`: `tabela` (com `colunas`), `json`, `arquivo` ou `mensagem`.
- `campos[].destino`: `corpo.x`, `caminho.x` ou `consulta.x`.
- Rotas que alteram dado levam `"sensivel": true` e um texto em `confirmar`.

No catálogo do Nacional, `servidor` escolhe entre `adn` e `sefin`. Domínio
novo também precisa entrar na lista do repasse em `api/proxy.js`.

**regras-validacao.json** traz as regras declarativas do validador. Toda regra
precisa de `fonte`, dizendo em que documento se apoia, e pode ligar o achado
às tags do XML em `tags`, usando o caminho completo do anexo VI.

Tipos aceitos: obrigatorio, digitos (`quantidade` com um número ou uma lista),
formato, tamanho, faixa, enumerado, condicional (`quandoValorEm` ou
`quandoPreenchido` mais `exige`) e umDeles (`alternativas`). `apelidos` lista
nomes de campo escritos errado com frequência.

## Arquivos gerados

**de-para-nacional.json** e **ibscbs.json** saem do gerador
`ferramentas/gerar_definicoes.py` a partir dos anexos em `fontes/nacional` e
das fontes internas do PlugNotas. Não edite à mão: a próxima geração
sobrescreve. Para corrigir um conteúdo, corrija a fonte e gere de novo.

## Antes de publicar

Confira que o JSON é válido. Mesmo com o repositório privado, não inclua dados
de cliente: CNPJ, razão social, chave de acesso e API Key precisam ser fictícios.
Rode `cd testes && npm test` antes do commit: o deploy da Vercel não roda os
testes, e a varredura de dados sensíveis cobre esta pasta.
