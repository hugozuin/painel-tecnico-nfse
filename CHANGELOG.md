# Histórico de versões

## Não publicado

### Mudanças visíveis

- Os perfis de API Key ficam gravados no navegador (localStorage) e continuam
  lá depois de fechar o site, até serem apagados na tela ou até a limpeza dos
  dados do navegador. A chave digitada sem perfil, o perfil ativo e a lista
  do Resolve continuam só na aba.
- A explicação "Como a API Key fica guardada" deixou de ficar sempre visível
  no cartão da credencial e abre ao passar o mouse no ícone "?" ao lado de
  "Perfis salvos".
- Novo padrão visual, alinhado ao design system da TecnoSpeed: menu lateral
  com o gradiente da marca e o logo no topo, cabeçalho branco com linha da
  marca, cinzas neutros, raio e sombras do padrão, botões e campos de 48px,
  abas sublinhadas, tabelas zebradas e contraste AA nos dois temas. A cor da
  marca continua índigo e a fonte continua Quicksand.
- No celular, o menu abre por um botão flutuante e fecha ao clicar fora.
- Mais espaço entre as opções do menu lateral e entre o menu e o conteúdo.
- Menu com quatro seções em destaque: Notas, Empresa, Nacional e Ferramentas.
  As telas de Arquivos e Ciclo de vida passam para Notas.
- Rodapé removido.
- Confirmação de ação sensível com ícone de alerta e botão Confirmar amarelo.
- Avisos no canto superior direito, com botão de fechar; o de erro em vermelho.
- O interruptor de tema mostra sol ou lua e informa o estado ao leitor de tela.
- Com as animações desligadas no sistema, os avisos não sumiam e se acumulavam
  na tela. Agora saem pelo tempo.
- Máscara preenchida ao digitar no código de tributação da consulta de
  alíquota (`00.00.00.000`), nos campos de CPF e CNPJ e no código IBGE do CNC.
  Valor incompleto é recusado antes de chamar a API.
- A tela do certificado informa que as consultas do Nacional exigem
  certificado digital. Sem ele, o repasse passa a orientar a carregar o A1 em
  vez de devolver só o erro técnico do TLS.
- De-para do Nacional refeito a partir das props da lib do PlugNotas:
  - A tag mostra o campo do JSON, com os selos Convertido, Condicional e Muda
    no RTC007. Passar o mouse no selo mostra o que ele significa.
  - O popup traz a tabela de conversão, as condições, o que a documentação da
    API diz do campo, o caminho no XML gerado hoje e no anexo VI anterior e as
    fontes com arquivo e linha.
  - Os nomes do TX2 saíram da lista e da busca e ficam só como apoio no popup.
  - Filtros num seletor só, com mais de uma escolha: grupos da tag,
    preenchidas pelo PlugNotas e com conversão de valores.
  - Tag com fontes em desacordo mostra o aviso discreto "Inconsistências nas
    fontes".
  - Tags da NFS-e aparecem como geradas pelo Nacional.
- Cobertura do de-para: de 103 para 196 tags da DPS com campo do JSON.
  Destas, 68 foram confirmadas na conferência de 11 notas reais, 125 foram
  inferidas pelo componente (apoio) e 3 pelo nome e pelos códigos da tag.
- Validador:
  - O grupo IBS/CBS passa a ser lido em `servico[].ibscbs`, como na
    documentação da API. O grupo na raiz ganha o alerta "fora do lugar
    documentado".
  - Novas conferências:
    - valores e tamanhos aceitos pela documentação;
    - conversão de código pela lib;
    - número enviado como texto em campo que a lib só lê como número;
    - campo documentado que a lib do Nacional não lê;
    - mais de um serviço na mesma nota.
  - O número decimal do JSON deixa de ser acusado como conteúdo não numérico.

### Ferramentas e testes

- Gerador com novas fontes:
  - documentação pública da API (`--api`);
  - sondagem das props executadas no Node (`--lib`);
  - `getRps.js` como fonte secundária (`--rps`);
  - conferência de notas (`--notas`).
- Script e mapeamento do componente passam a ser só apoio. A leitura do
  script aceita cabeçalhos em várias linhas e compara nomes sem diferenciar
  maiúsculas.
- Equivalência de caminhos entre o anexo VI 1.03 e o 1.04 pelos itens da
  NT 009, que entraram em `fontes/nacional` junto com o anexo 1.03.
- `testes/teste_gerador.py` com fixtures sintéticas e
  `testes/conferir_fixtures.py`, que prova que as fixtures não copiam os
  insumos internos.
- Testes do tema, do menu do celular e da saída dos avisos; o da saída falhava
  no código anterior.

### Documentação

- READMEs reescritos: principal, definições, ferramentas, testes e governança.
- Validação da produção registrada no CLAUDE.md.
- Padrão visual, tokens novos e a decisão registrados no CLAUDE.md.

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
