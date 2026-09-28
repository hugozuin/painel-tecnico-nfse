# Governança do Painel Técnico NFS-e

Documentação exigida pela **Política de Governança de Aplicações Internas**,
pelo **Padrão Técnico para Aplicações Internas** e pelo **Checklist de
Documentação** da TecnoSpeed.

> [!NOTE]
> Esta pasta fica fora do deploy (`.vercelignore`). O conteúdo é interno e não
> vai para o site.

## Sumário

- [Documentos](#documentos)
- [Situação resumida](#situação-resumida)
- [Ficha da aplicação](#ficha-da-aplicação)
- [Classificação: Aplicação crítica](#classificação-aplicação-crítica)
- [Checklist por etapa](#checklist-por-etapa)
- [Próximas ações](#próximas-ações)

## Documentos

| Documento | Conteúdo |
|---|---|
| Este arquivo | Ficha da aplicação, classificação e checklist por etapa |
| [dados-e-lgpd.md](dados-e-lgpd.md) | Classificação da informação, inventário de dados pessoais, retenção e descarte |
| [operacao.md](operacao.md) | Arquitetura, tecnologias, integrações, implantação, recuperação, operação, sustentação e uso de IA |
| [excecoes.md](excecoes.md) | Exceções em aberto, com risco, controles compensatórios e prazo |
| [../../CHANGELOG.md](../../CHANGELOG.md) | Histórico de versões |

## Situação resumida

Contagem dos itens do [checklist](#checklist-por-etapa). "A confirmar" reúne os
itens atendidos que ainda dependem de validação do responsável de negócio ou de
Segurança da Informação.

| Etapa | OK | A confirmar | Parcial | Pendente | N/A |
|---|:-:|:-:|:-:|:-:|:-:|
| 1. Descobrir | 0 | 0 | 0 | 2 | 0 |
| 2. Experimentar | 2 | 0 | 0 | 2 | 0 |
| 3. Compartilhar | 3 | 3 | 0 | 2 | 0 |
| 4. Homologar | 6 | 1 | 1 | 6 | 2 |
| 5. Operar | 1 | 1 | 1 | 4 | 1 |
| **Total** | **12** | **5** | **2** | **16** | **3** |

A maior parte das pendências não depende de código: depende do registro no
TecnoApps, da indicação do responsável de negócio e do revisor, do aceite das
[exceções](excecoes.md) e dos recursos corporativos (GitLab, hospedagem e SSO).

## Ficha da aplicação

| Campo | Valor |
|---|---|
| Nome da aplicação | Painel Técnico NFS-e |
| Nome curto | painel-tecnico-nfse |
| Área solicitante | Consultoria Técnica NFS-e (PlugNotas) |
| Responsável de negócio | A definir (Diretor, Gerente ou Coordenador da área) |
| Responsável técnico | Hugo Zuin |
| Revisor independente | A definir |
| Data de criação | 2026 (primeira versão como "Consulta e Sincronização de Notas") |
| Nível de governança atual | Aplicação crítica |
| Registro no TecnoApps | Pendente |
| Versão | 4.1.0 |

## Classificação: Aplicação crítica

O item 5.3 da Política de Governança classifica como crítica a aplicação que
atende a qualquer um dos critérios abaixo. O Painel atende a cinco:

| Critério | Situação no Painel |
|---|---|
| Altera dados ou age em sistema oficial ou produtivo | Resolve, cancelamento, eventos, e-mail, sincronização e interrupção na API de produção do PlugNotas |
| Executa ação fiscal | Cancelamento de NFS-e |
| Tem exposição externa | Site e repasse abertos na internet |
| Usa credencial privilegiada | API Key de contas de clientes e chave privada do A1 do consultor |
| Trata informação confidencial ou restrita com impacto | API Keys e chave do A1 (Restrita); conteúdo das notas (Confidencial) |

A arquitetura reduz o risco (a API Key vai direto do navegador à API
PlugNotas, o servidor não guarda nada e o certificado é lido no navegador),
mas não muda o nível. A classificação só baixa com revisão formal de
Tecnologia e Segurança da Informação.

## Checklist por etapa

Legenda: **OK** atendido e evidenciado; **Pendente** falta ação; **N/A** não
se aplica, com justificativa. Itens marcados como obrigatórios para Aplicação
crítica.

### Etapa 1: Descobrir

| Item | Situação | Evidência ou ação |
|---|---|---|
| Consulta ao TecnoApps por solução semelhante | Pendente | Registrar no TecnoApps (onda 0) |
| Justificativa para não reutilizar solução existente | Pendente | Depende da consulta ao TecnoApps |

### Etapa 2: Experimentar

| Item | Situação | Evidência ou ação |
|---|---|---|
| Objetivo e problema descritos | OK | README, seção de telas; CLAUDE.md, seção 1 |
| Público-alvo estimado | OK | Consultores da Consultoria Técnica NFS-e |
| Construção em ambiente autorizado, sem dado real em teste | Pendente | Testes e exemplos só com dados fictícios (varredura no `npm test`); repositório e hospedagem pessoais em exceção (excecoes.md) |
| Limites de custo verificados | Pendente | Hospedagem em plano pessoal; definir centro de custo |

### Etapa 3: Compartilhar

| Item | Situação | Evidência ou ação |
|---|---|---|
| Responsável de negócio formalizado | Pendente | Indicar na ficha |
| Responsável técnico formalizado | OK | Hugo Zuin |
| Nível de governança classificado no TecnoApps | Pendente | Proposta: Aplicação crítica |
| Dados pessoais identificados e classificados | OK, a confirmar | dados-e-lgpd.md; o responsável de negócio confirma a classificação |
| Classificação da informação definida | OK, a confirmar | dados-e-lgpd.md |
| Integrações listadas | OK | operacao.md |
| Uso de IA declarado | OK | operacao.md, seção de IA |
| Modelo de sustentação preliminar | OK, a confirmar | operacao.md |

### Etapa 4: Homologar

| Item | Situação | Evidência ou ação |
|---|---|---|
| Repositório no GitLab corporativo | Pendente | Hoje no GitHub pessoal, em exceção |
| README com instalação e execução | OK | README.md |
| Arquitetura documentada | OK | operacao.md |
| Arquitetura aprovada por Arquitetura | Pendente | Enviar operacao.md e a justificativa da stack |
| Requisitos de segurança e LGPD avaliados | OK, a validar por SI | CLAUDE.md, seção 6; dados-e-lgpd.md; relatório de conformidade |
| Aprovação formal de Segurança da Informação | Pendente | |
| Autenticação corporativa homologada | Pendente | Site sem login, em exceção; o SSO entra com a hospedagem corporativa |
| Revisão técnica independente | Pendente | Falta revisor; a rodada 1 (versão 4.1.0) já entrou no main sem essa revisão, amparada na exceção E3, que ainda aguarda aceite formal (excecoes.md) |
| Testes funcionais | OK | mais de 600 verificações em 13 suítes (`npm test`) e conferência das planilhas (`teste_fontes.py`) |
| Testes de segurança e desempenho | OK | `teste-seguranca.mjs`, `teste-desempenho.mjs` e `verificar-csp.mjs` no navegador real |
| Banco homologado ou justificativa | N/A | Não há banco nem persistência no servidor |
| Criptografia em trânsito | OK | HTTPS em todos os destinos |
| Criptografia em repouso | N/A | Nada é gravado no servidor; no navegador, a API Key fica só na aba (sessionStorage) |
| Segredos fora do código | OK | Sem segredo da aplicação; certificados de teste gerados na execução, fora do Git |
| CI/CD configurado | Parcial | Gancho `pre-push` versionado roda o `npm test` antes de cada push (controle compensatório); o pipeline entra com o GitLab |
| Aceite formal da área de negócio | Pendente | |

### Etapa 5: Operar

| Item | Situação | Evidência ou ação |
|---|---|---|
| Monitoramento (logs, métricas, health check) | Parcial | `GET /api/saude` e log estruturado do repasse; falta integrar ao monitoramento centralizado |
| Backup e recuperação | N/A com justificativa | Sem dado persistido; o código e as definições estão no Git; recuperação por redeploy (operacao.md) |
| Responsável e modelo de sustentação | OK, a confirmar | operacao.md |
| Canal de suporte | Pendente | Definir o canal na área |
| Cadastro atualizado no TecnoApps | Pendente | |
| Revisão periódica de acessos | Pendente | Depende do SSO; hoje não há usuários cadastrados |
| Responsável pelo custo | Pendente | Plano pessoal da Vercel |
| Retenção e descarte de dados | OK | dados-e-lgpd.md |

### Etapa 6: Evoluir ou descontinuar

Na descontinuação: comunicar a equipe, arquivar o repositório, remover o
projeto da Vercel (ou da hospedagem corporativa), revogar tokens de deploy e
de CI, e atualizar o TecnoApps. O Painel não guarda credenciais de clientes no
servidor; API Keys e certificados ficam com cada consultor.

## Próximas ações

Plano de conformidade aprovado na rodada 1 (detalhes na seção 9 do
`CLAUDE.md`).

**Onda 0, com o responsável técnico e o gestor**

- [ ] Registrar no TecnoApps como Aplicação crítica.
- [ ] Formalizar o responsável de negócio e o revisor independente.
- [ ] Obter o aceite das exceções E1, E2 e E3.
- [ ] Pedir à Tecnologia GitLab, hospedagem corporativa com SSO e a
      confirmação de que o Claude Code é homologado, com conta corporativa.
- [ ] Confirmar a classificação da informação.

**Onda 3, depois da Tecnologia**

- [ ] Repositório no GitLab com Merge Request e revisão independente.
- [ ] Pipeline com testes, dependências, segredos e deploy só com tudo verde.
- [ ] Hospedagem corporativa com SSO e WAF.
- [ ] Auditoria das ações sensíveis com a identidade do SSO.
- [ ] Log integrado ao monitoramento centralizado e responsável pelo custo.
