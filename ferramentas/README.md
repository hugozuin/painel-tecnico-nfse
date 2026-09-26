# Ferramentas

Scripts que rodam fora do site. A pasta inteira fica fora do deploy
(`.vercelignore`).

| Arquivo | Para quê |
|---|---|
| `gerar_definicoes.py` | Gera `definicoes/de-para-nacional.json` e `definicoes/ibscbs.json` a partir dos anexos e, quando informados, dos insumos internos do PlugNotas |
| `gerar_manual.py` | Gera o `documentacao.pdf` (reportlab e svglib) |
| `relatorio-geracao.json` | Lacunas da última geração do de-para |

O uso de cada script está no próprio `--help` e no README da raiz. Rodar o
gerador sem `--script`, `--mapeamento` e `--lib` regrava o
`relatorio-geracao.json` só com o lado do Nacional; não faça commit desse
relatório parcial.

## Como o gerador decide

Estas regras explicam escolhas do `gerar_definicoes.py` que não estão nos
nomes das funções.

- **Raízes do JSON** (`RAIZES_JSON_CONFIRMADAS`): `prestador`, `tomador`,
  `servico[]` e `ibscbs` foram confirmadas pelo exemplo de emissão da coleção
  do Postman do PlugNotas. Outras raízes, como a do intermediário, ainda não
  estão confirmadas (CLAUDE.md, seção 9).
- **Cópia direta** (`SETTERS` e `jsonCopiaDireta`): uma gravação conta como
  cópia direta só quando recebe o campo do TX2 puro, sem conversão. As
  gravações de moeda convertem o formato numérico e não contam. Só os campos
  de cópia direta recebem a conferência de tamanho e tipo do anexo VI no
  validador.
- **Título da tag** (`titulo_da_descricao`): é o trecho da descrição do
  anexo antes dos dois pontos ou a primeira frase, cortado em 120 caracteres.
  Nada do anexo é reescrito.
- **Caminhos com grafia diferente** (`aproximar_caminho`): quando a aba de
  regras do anexo VI escreve o caminho de outro jeito que o leiaute (por
  exemplo, `totalTrib` e `totTrib`), a regra é ligada à tag de mesmo nome com a
  maior semelhança, desde que alta e sem empate. Essas regras saem marcadas
  com `caminhoNaAbaDeRegras`.
- **Script do Nacional** (`ler_script`): cada campo do dataset é ligado aos
  campos do TX2 que determinam seu valor, de três formas:
  - `direto`: o campo do TX2 aparece na própria chamada que grava o dataset;
  - `calculado`: o valor gravado é uma variável montada a partir de campos do
    TX2;
  - `condicao`: o valor gravado é fixo e depende do `if` ou `case` que o
    controla.
- **Blocos e ramos:** a análise acompanha os blocos `begin`, `case` e `try`
  para não ligar uma atribuição feita em outro ramo do mesmo `case`. Uma
  atribuição termina no ponto e vírgula ou antes de `else` ou `end`, como em
  `if X then v := A else v := B;`.
- **Condição de linha única** (`guarda`): é a condição do `if ... then`, do
  `else` ou do rótulo de `case` na mesma linha ou na linha anterior. Quando
  não há nenhuma, a atribuição não é condicional.
