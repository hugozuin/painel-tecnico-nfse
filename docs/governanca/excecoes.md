# Exceções em aberto

Registro exigido pela Política de Governança (seção 10): justificativa, risco,
controles compensatórios, responsável pelo aceite e prazo. As exceções abaixo
são propostas; valem depois do aceite do dono do risco (Gerente ou Diretor, com
Segurança da Informação).

## E1: repositório, hospedagem e acesso fora dos recursos corporativos

| Campo | Conteúdo |
|---|---|
| Requisitos | Código no GitLab corporativo (Padrão, seção 2); hospedagem em recurso autorizado, com responsável pelo custo (Dados, seção 5; Padrão, seção 12); identidade corporativa com SSO (Padrão, seção 7) |
| Situação | Repositório privado no GitHub pessoal do responsável técnico; site e funções na Vercel em conta pessoal (plano Hobby); site sem login |
| Justificativa | A ferramenta nasceu como apoio individual e passou a ser usada pela equipe antes das políticas; a migração depende de repositório, hospedagem e SSO fornecidos por Tecnologia |
| Risco | Código proprietário e dados de consulta em conta pessoal; site e repasse acessíveis a qualquer pessoa; plano Hobby não é para uso comercial |
| Controles compensatórios | Repositório privado; nenhum segredo da aplicação no código; a API Key não passa pelo servidor e fica só na aba; o repasse aceita só domínios do gov.br, sem guardar corpo nem certificado; CSP estrita; site não indexável; log estruturado sem dados sensíveis; varredura de dados sensíveis a cada teste; gancho `pre-push` que roda o `npm test` antes de publicar |
| Plano de saída | Onda 3 do plano de conformidade: GitLab corporativo com pipeline, hospedagem corporativa com SSO e WAF (OCI São Paulo, preferência da política, ou conta corporativa da Vercel) |
| Responsável pelo aceite | A definir |
| Prazo proposto | 90 dias a partir do aceite |

## E2: stack do front-end sem React ou Vue

| Campo | Conteúdo |
|---|---|
| Requisito | Tecnologias homologadas ou justificativa aprovada por Arquitetura (Padrão, seção 1) |
| Justificativa | operacao.md, "Justificativa da stack" |
| Risco | Baixo: menos padronização com outras aplicações |
| Responsável pelo aceite | Arquitetura |
| Prazo proposto | Permanente, se aprovada |

## E3: revisão independente

| Campo | Conteúdo |
|---|---|
| Requisito | Na aplicação crítica, quem altera não aprova (Padrão, seção 4) |
| Situação | Um único mantenedor; revisão por testes automatizados e apoio de IA |
| Controles compensatórios | Mais de 600 verificações automatizadas, incluindo segurança e desempenho; commits pequenos, com mensagem descritiva |
| Plano de saída | Indicar revisor e passar a integrar por Merge Request no GitLab |
| Responsável pelo aceite | A definir |
| Prazo proposto | Até a migração para o GitLab (E1) |
