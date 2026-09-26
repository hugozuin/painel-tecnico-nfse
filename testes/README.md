# Testes do Painel Técnico NFS-e

Instalação, uma vez: `cd testes` e `npm install`.

Rodar tudo: `npm test` dentro de `testes/`. Para ver cada verificação: `npm run test:detalhes`.

Conferência dos dados contra as planilhas dos anexos (requer Python 3.10+ e
openpyxl): `python testes/teste_fontes.py` na raiz do repositório.

As suítes rodam com a raiz do repositório como pasta de trabalho; o
`executar.mjs` cuida disso e da variável `NODE_EXTRA_CA_CERTS` usada no teste de
certificado, e reprova a suíte que passar de 180 s sem terminar.

`teste-seguranca.mjs` reúne as garantias de segurança: varredura de sinks
proibidos no DOM, integridade do forge, destino da API Key, cabeçalhos,
entrada e saída do repasse (com o Nacional simulado, sem rede), certificado A1
sem vestígio no navegador, varredura de dados sensíveis e CSP do `vercel.json`
conferida contra a página, os estilos e as imagens. Os padrões e a lista de
permitidos da varredura de dados sensíveis ficam em `sigilo.mjs`; cada valor
permitido precisa ter fonte pública.

`npm run verificar:csp` (fora do `npm test`) abre o Chrome ou o Edge em modo
headless, serve o site com os cabeçalhos do `vercel.json`, percorre todas as
telas, carrega o forge pelo fluxo real do certificado e falha se houver
violação de CSP ou se o SRI barrar o forge. Exige internet: o repasse é
simulado, mas a fonte vem do Google Fonts e a consulta de teste vai à API
PlugNotas com uma chave fictícia e volta 401. Para usar outro navegador:
`node verificar-csp.mjs <caminho do executável>`.

`certificados/` recebe certificados de teste autoassinados, válidos por 10
anos, que `gerar-certificados.mjs` cria quando faltam. O `npm test` e o
`verificar:csp` chamam o gerador; para rodar uma suíte sozinha pela primeira
vez, use `node gerar-certificados.mjs`. A pasta fica fora do Git, porque o
padrão técnico proíbe chave privada e certificado versionados. Não são
ICP-Brasil e não servem para nenhuma consulta real. O `cliente-legado.pfx` usa
RC2-40 nos certificados e 3DES na chave, o mesmo formato de muitos A1, para
garantir que a leitura no navegador funciona onde o Node recusa.
