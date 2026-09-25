# Testes do Painel Técnico NFS-e

Instalação, uma vez: `cd testes` e `npm install`.

Rodar tudo: `npm test` dentro de `testes/`. Para ver cada verificação: `npm run test:detalhes`.

Conferência dos dados contra as planilhas dos anexos (requer Python 3.10+ e
openpyxl): `python testes/teste_fontes.py` na raiz do repositório.

As suítes rodam com a raiz do repositório como pasta de trabalho; o
`executar.mjs` cuida disso e da variável `NODE_EXTRA_CA_CERTS` usada no teste de
certificado.

`certificados/` guarda certificados de teste autoassinados, gerados só para
estes testes, válidos por 10 anos. Não são ICP-Brasil e não servem para
nenhuma consulta real. O `cliente-legado.pfx` usa RC2-40, o mesmo formato de
muitos A1, para garantir que a leitura no navegador funciona onde o Node recusa.
