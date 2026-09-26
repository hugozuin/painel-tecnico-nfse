# Dados e LGPD

Inventário exigido pela Política de Proteção e Uso de Dados (seções 4 a 6) e
pelo Padrão Técnico (seções 9 e 10). A classificação é uma proposta do
responsável técnico; quem atribui a classificação é o responsável de negócio.

## Classificação da informação

| Informação | Onde aparece | Classe proposta |
|---|---|---|
| API Key do PlugNotas | Campo da tela; sessionStorage da aba (chave digitada e perfis) | Restrita |
| Chave privada e senha do A1 | Memória do navegador; chave e cadeia seguem ao repasse a cada consulta com certificado | Restrita |
| Conteúdo das notas (tomador, CPF ou CNPJ, endereço, e-mail, valores) | Cartão Retorno, arquivos baixados e CSV exportado | Confidencial, com dados pessoais |
| IDs de nota, chaves de acesso, protocolos, CNPJs | Listas das telas, sessionStorage do Resolve, corpo das consultas do Nacional, log da sessão | Confidencial |
| CN do certificado (nome e CPF do consultor) e nome declarado | Log da sessão e exportação do log | Dado pessoal, Interna |
| Lado PlugNotas do de-para (nomes de campo do TX2, linhas do script) | Site | Interna, a confirmar |
| Anexos VI, VII e VIII e o lado Nacional do de-para | Site | Pública |

## Onde cada dado fica e por quanto tempo

| Lugar | O que guarda | Retenção |
|---|---|---|
| Servidor (função do repasse) | Nada. A chave e a cadeia do A1 existem só durante a conexão, que é fechada ao fim da consulta | Não há |
| Log do repasse (plataforma de hospedagem) | Método, status, domínio, rota sem identificadores, se levou certificado, código de erro e duração. Nunca corpo, URL com identificadores, chave ou certificado | Retenção da plataforma |
| sessionStorage da aba | API Key digitada, perfis, perfil ativo e lista de IDs do Resolve | Até fechar a aba |
| localStorage do navegador | Preferências sem dado sensível: tema, ambiente do Nacional, escolhas de tela, configuração do Resolve e nome declarado | Até o consultor limpar o navegador |
| Memória da aba | Log da sessão, certificado carregado, resultados na tela | Até recarregar ou fechar |
| Computador do consultor | Arquivos que ele baixa (XML, PDF, CSV, log exportado) | Responsabilidade do consultor, pela política de dados |

Versões anteriores gravavam a API Key e os perfis no localStorage. Na abertura,
a aplicação move esses dados para a aba e os apaga do navegador.

## Dados pessoais

- **Titulares:** tomadores de serviço das notas consultadas, destinatários de
  e-mail informados na tela e o próprio consultor (nome declarado e CN do
  certificado).
- **Finalidade:** suporte técnico às notas fiscais emitidas pelos clientes do
  PlugNotas.
- **Base legal:** a confirmar com o responsável de negócio e o Encarregado.
  Proposta: execução do contrato de prestação de serviço com o cliente do
  PlugNotas (LGPD, art. 7º, V).
- **Minimização:** a aplicação não coleta dados por conta própria. Mostra o
  que a API PlugNotas e o Nacional devolvem para a consulta feita pelo
  consultor e não grava nada no servidor.
- **Testes e exemplos:** só dados fictícios ou públicos. O `npm test` varre o
  repositório e o manual em PDF atrás de CNPJ, CPF, chave de acesso, token e
  e-mail fora da lista de permitidos.

## Descarte

Não há base de dados. Na descontinuação: apagar o projeto da hospedagem e os
logs da plataforma, arquivar o repositório e revogar tokens de deploy. O que
fica no navegador de cada consultor some ao fechar a aba (credenciais) ou ao
limpar os dados do site (preferências).
