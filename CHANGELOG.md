# Histórico de versões

## 4.1.0 (setembro de 2026): rodada 1 de revisão, refatoração e testes

### Mudanças visíveis

- A API Key digitada, os perfis e a lista de IDs do Resolve ficam só na aba
  (sessionStorage) e somem ao fechá-la. A opção "Manter a chave" saiu. O que
  versões anteriores gravaram no navegador é movido para a aba e apagado.
- O cartão da credencial explica como a chave é guardada e traz o botão
  "Apagar todos os perfis".
- Cancelar o Resolve fecha como "Cancelado" todas as notas ainda abertas,
  inclusive na espera do Nacional e durante a conferência, e interrompe na
  hora as pausas em andamento.
- A fonte Quicksand é servida pelo próprio site.

### Segurança e conformidade

- Cabeçalhos do site: CSP estrita (sem Google Fonts), Permissions-Policy e
  Cross-Origin-Opener-Policy. Forge com SRI e versão no nome.
- A API Key só segue para a API PlugNotas; outro destino é recusado antes do
  `fetch`.
- Repasse: CSP `sandbox`, `nosniff` e `no-store` em toda resposta; HTML e SVG
  viram download; corpo até 64 KB; PEM conferido; porta e usuário na URL
  recusados; prazo total de 30 s; resposta até 4 MB; conexão com certificado
  fechada ao fim da consulta; log estruturado sem dados sensíveis.
- Consultas do Nacional sempre por POST, com a URL no corpo.
- `GET /api/saude` para monitoramento.
- Itens `.` e `..` recusados nas listas de identificadores.
- Senha do A1 apagada do campo depois de cada leitura.
- Certificados de teste gerados na execução, fora do Git.
- Gancho `pre-push` versionado que roda o `npm test` antes de cada push.
- Documentação de governança em `docs/governanca/`.

### Desempenho

- Código de cada tela carregado só quando ela é aberta: JS da abertura de
  55.418 para 11.219 bytes com gzip.
- Funções na região `gru1`; `assets/vendor` com cache imutável de um ano.

### Código e testes

- `resolve.js`, `analise.js`, `lote.js` e `styles.css` divididos por
  responsabilidade; cartão, interruptor e popup unificados; código e CSS sem
  uso removidos; sem comentários no código.
- Suítes novas: segurança, padrões, fluxo do Resolve, componentes, módulos do
  validador e desempenho. De 258 para 628 verificações, e a suíte inteira cai
  de cerca de 40 s para cerca de 17 s.

## 4.0.0

Estado anterior à rodada 1: telas guiadas por catálogo para as rotas do
PlugNotas e do Nacional, de-para do anexo VI, relação IBS e CBS, validador de
JSON e manual em PDF.
