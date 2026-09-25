from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
                                TableStyle, KeepTogether, NextPageTemplate, PageBreak)
from reportlab.graphics import renderPDF
from svglib.svglib import svg2rlg
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

INDIGO_ESCURO = colors.HexColor("#2D2A8C")
INDIGO_MEDIO = colors.HexColor("#4A44C4")
INDIGO_CLARO = colors.HexColor("#6C63E0")
TEXTO_FORTE = colors.HexColor("#25234F")
TEXTO_BASE = colors.HexColor("#3C3A66")
TEXTO_SUAVE = colors.HexColor("#7B7A9B")
BORDA = colors.HexColor("#E3E4F0")
FUNDO_SUAVE = colors.HexColor("#F7F8FC")

titulo_capa = ParagraphStyle("tituloCapa", fontName="Helvetica-Bold", fontSize=28, leading=34, textColor=colors.white)
subtitulo_capa = ParagraphStyle("subtituloCapa", fontName="Helvetica", fontSize=12.5, leading=18, textColor=colors.HexColor("#DCDAF7"))
secao = ParagraphStyle("secao", fontName="Helvetica-Bold", fontSize=15.5, leading=20, textColor=INDIGO_ESCURO, spaceBefore=16, spaceAfter=8)
subsecao = ParagraphStyle("subsecao", fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=INDIGO_MEDIO, spaceBefore=10, spaceAfter=5)
corpo = ParagraphStyle("corpo", fontName="Helvetica", fontSize=9.8, leading=14.5, textColor=TEXTO_BASE, spaceAfter=7)
lista = ParagraphStyle("lista", parent=corpo, leftIndent=12, bulletIndent=2, spaceAfter=4)
nota = ParagraphStyle("nota", fontName="Helvetica-Oblique", fontSize=9, leading=13, textColor=TEXTO_SUAVE, spaceAfter=7)
celula = ParagraphStyle("celula", fontName="Helvetica", fontSize=8.6, leading=12, textColor=TEXTO_BASE)
celula_forte = ParagraphStyle("celulaForte", parent=celula, fontName="Helvetica-Bold", textColor=TEXTO_FORTE)
celula_cabecalho = ParagraphStyle("celulaCabecalho", parent=celula, fontName="Helvetica-Bold", textColor=colors.white)

LOGO = svg2rlg(str(RAIZ / "assets" / "logo.svg"))


def desenhar_logo(canvas, x, y, altura):
    escala = altura / LOGO.height
    canvas.saveState()
    canvas.translate(x, y)
    canvas.scale(escala, escala)
    renderPDF.draw(LOGO, canvas, 0, 0)
    canvas.restoreState()


def desenhar_capa(canvas, doc):
    largura, altura = A4
    canvas.saveState()
    canvas.setFillColor(INDIGO_ESCURO)
    canvas.rect(0, 0, largura, altura, fill=1, stroke=0)
    canvas.setFillColor(INDIGO_MEDIO)
    canvas.rect(0, altura - 480, largura, 480, fill=1, stroke=0)
    canvas.setFillColor(INDIGO_CLARO)
    canvas.rect(0, altura - 486, largura, 6, fill=1, stroke=0)
    canvas.restoreState()
    desenhar_logo(canvas, 20 * mm, altura - 42 * mm, 9 * mm)


def desenhar_pagina(canvas, doc):
    largura, altura = A4
    canvas.saveState()
    canvas.setFillColor(INDIGO_ESCURO)
    canvas.rect(0, altura - 16 * mm, largura, 16 * mm, fill=1, stroke=0)
    canvas.restoreState()
    desenhar_logo(canvas, 20 * mm, altura - 11.2 * mm, 4.2 * mm)
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#CFCCF5"))
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(largura - 20 * mm, altura - 10.2 * mm, "Painel Técnico NFS-e · Consultoria Técnica NFS-e")
    canvas.setStrokeColor(BORDA)
    canvas.setLineWidth(0.6)
    canvas.line(20 * mm, 15 * mm, largura - 20 * mm, 15 * mm)
    canvas.setFillColor(TEXTO_SUAVE)
    canvas.drawString(20 * mm, 10 * mm, "Documento interno · Desenvolvido por Hugo Zuin")
    canvas.drawRightString(largura - 20 * mm, 10 * mm, f"Página {doc.page - 1}")
    canvas.restoreState()


def tabela(dados, larguras):
    linhas = [[Paragraph(texto, celula_cabecalho) for texto in dados[0]]]
    linhas += [[Paragraph(texto, celula_forte if indice == 0 else celula) for indice, texto in enumerate(linha)] for linha in dados[1:]]
    componente = Table(linhas, colWidths=larguras, repeatRows=1)
    componente.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INDIGO_ESCURO),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FUNDO_SUAVE]),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDA),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return componente


def item(texto):
    return Paragraph(texto, lista, bulletText="•")


def construir():
    documento = BaseDocTemplate(str(RAIZ / "documentacao.pdf"), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                                topMargin=24 * mm, bottomMargin=20 * mm,
                                title="Manual do Painel Técnico NFS-e", author="Hugo Zuin")
    largura_util = A4[0] - 40 * mm
    documento.addPageTemplates([
        PageTemplate(id="capa", frames=[Frame(20 * mm, 20 * mm, largura_util, A4[1] - 40 * mm)], onPage=desenhar_capa),
        PageTemplate(id="conteudo", frames=[Frame(20 * mm, 20 * mm, largura_util, A4[1] - 44 * mm)], onPage=desenhar_pagina),
    ])
    h = []
    h += [Spacer(1, 190), Paragraph("Painel Técnico NFS-e", titulo_capa), Spacer(1, 16),
          Paragraph("Manual de uso da ferramenta interna da Consultoria Técnica NFS-e.<br/>"
                    "Operações da API PlugNotas e do Ambiente Nacional, de-para do XML,<br/>"
                    "relação IBS e CBS e validador de JSON.", subtitulo_capa),
          Spacer(1, 40), Paragraph("Versão 4.0", subtitulo_capa), Paragraph("Setembro de 2026", subtitulo_capa),
          Paragraph("Desenvolvido por Hugo Zuin · Uso interno TecnoSpeed", subtitulo_capa),
          NextPageTemplate("conteudo"), PageBreak()]

    h.append(Paragraph("1. O que é o painel", secao))
    h.append(Paragraph("O painel reúne as tarefas que a consultoria técnica repete durante o atendimento. Cada rota da "
                       "API tem a sua tela, escolhida no menu da esquerda, e cada tela abre com o título e uma legenda "
                       "do que ela faz. Tudo roda no navegador do consultor: as chamadas ao PlugNotas saem do seu "
                       "computador direto para a API, com a API Key informada na tela.", corpo))
    h.append(Paragraph("O menu agrupa as telas em Notas, Arquivos, Ciclo de vida, Nacional e Ferramentas. Telas que "
                       "alteram ou apagam dado aparecem marcadas como sensíveis e pedem confirmação antes de executar.", corpo))

    h.append(Paragraph("2. Credencial", secao))
    h.append(Paragraph("A API Key fica no topo das telas do PlugNotas. Sem marcar a opção de manter a chave, ela vive "
                       "apenas na sessão do navegador. Os perfis guardam chaves por apelido, o que ajuda a não rodar um "
                       "lote na conta errada. A chave só segue para a API PlugNotas. As telas do Nacional não usam a "
                       "API Key: passam pelo repasse da aplicação, e algumas exigem certificado digital.", corpo))

    h.append(Paragraph("3. Resolve em lote", secao))
    h.append(Paragraph("A rota de resolve confirma apenas que a solicitação foi recebida. Por isso o painel lê a "
                       "situação da nota antes do resolve, dispara o resolve e consulta de novo depois. No modo do "
                       "emissor Nacional, a consulta de eventos vem antes e a espera acontece uma única vez para o lote.", corpo))
    h.append(KeepTogether(tabela([
        ["Resultado", "O que significa", "O que fazer"],
        ["Resolvido", "A nota estava em outra situação e passou a concluída.", "Nada. O objetivo foi atingido."],
        ["Já estava concluída", "A situação já era concluída antes do resolve.", "Conferir se o problema relatado é outro."],
        ["Continua rejeitada", "O resolve foi aceito, mas a nota segue rejeitada.", "Ler a mensagem da prefeitura."],
        ["Cancelada na prefeitura", "A consulta retornou a nota como cancelada.", "Confirmar com o cliente."],
        ["Ainda em processamento", "A situação seguia em andamento no fim das verificações.", "Consultar de novo em alguns minutos."],
        ["Resolve recusado pela API", "A API recusou a solicitação.", "Ler a mensagem de retorno."],
    ], [95, 200, 170])))
    h.append(Spacer(1, 6))

    h.append(Paragraph("4. Consultas, empresa, arquivos, ciclo de vida e Nacional", secao))
    h.append(Paragraph("A Consulta de notas reúne numa tela só as consultas por ID, por idIntegracao e por período. "
                       "Pelo ID, um toggle troca entre a consulta simplificada e a completa; as outras formas têm uma "
                       "versão só, e o toggle fica desabilitado.", corpo))
    h.append(Paragraph("O grupo Empresa reúne Cadastro da empresa, Webhook e Certificado. Todas são "
                       "telas de leitura; a única ação é o envio de teste do webhook, que dispara um exemplo de "
                       "notificação ao endpoint configurado e pede confirmação antes.", corpo))
    h.append(Paragraph("Download de XML e de PDF salvam um arquivo por linha da lista. Regerar PDF, e-mail, cancelamento, "
                       "status do cancelamento, eventos, sincronização e interrupção seguem o catálogo de rotas. As telas "
                       "do Nacional consultam convênio, alíquota, benefício, cadastro do contribuinte, NFSe por chave, DPS "
                       "e DANFSe, com escolha entre produção e produção restrita.", corpo))
    h.append(Paragraph("As consultas do Nacional passam por um repasse da própria aplicação, porque os servidores do "
                       "gov.br não aceitam chamadas direto do navegador. Rodando o painel localmente essas telas não funcionam.", nota))

    h.append(Paragraph("Cada consulta mostra o retorno completo num campo próprio, com o status HTTP, o tipo do conteúdo, "
                       "o tempo e a URL chamada no Nacional. Quando o repasse não consegue falar com o Nacional, o campo "
                       "traz o motivo e uma orientação.", corpo))
    h.append(Paragraph("Algumas consultas exigem certificado digital na conexão. Carregue um certificado A1 ICP-Brasil "
                       "(.pfx ou .p12) e a senha no cartão Certificado digital; pode ser de qualquer CNPJ. O arquivo e a "
                       "senha são lidos no navegador, e só a chave e o certificado seguem para o repasse durante a "
                       "consulta, sem serem guardados. A senha é apagada do campo depois de cada leitura do arquivo, "
                       "com ou sem sucesso. Ao recarregar a página, carregue o certificado de novo.", corpo))

    h.append(Paragraph("5. De-para do Nacional", secao))
    h.append(Paragraph("Cada tag do XML aparece pelo nome do leiaute do Nacional e pela referência do anexo VI, como em "
                       "tpRetISSQN, Tipo de retencao do ISSQN. O texto é o do anexo, sem reescrita.", corpo))
    h.append(Paragraph("5.1 Busca", subsecao))
    h.append(Paragraph("A busca aceita o nome da tag, parte da descrição (com ou sem acento), o caminho no XML, o código "
                       "de rejeição e o campo do JSON. Digitar E0580 traz a tag que tem essa regra, o que ajuda quando o "
                       "cliente manda só o código da rejeição. O filtro de grupo separa as tags da DPS e da NFS-e.", corpo))
    h.append(Paragraph("5.2 Ícone de informação", subsecao))
    h.append(Paragraph("Passar o mouse no ícone abre as regras de negócio da tag com código, aplicação, efeito, nível, "
                       "texto da regra e mensagem de erro, seguidas da descrição completa e das notas explicativas. Com o "
                       "popup aberto, a tecla Shift ou um clique no ícone o deixam fixo para rolar, selecionar e copiar. "
                       "Esc, clique fora ou o botão de fechar soltam o popup.", corpo))
    h.append(Paragraph("5.3 Lado do PlugNotas", subsecao))
    h.append(Paragraph("Quando a ligação fecha nos arquivos analisados, a tag mostra o campo do JSON e o campo do TX2 "
                       "que a preenchem. A ligação segue quatro elos: lib do PlugNotas, script do Nacional, arquivo de "
                       "mapeamento e anexo VI. Se algum elo não fecha, a tela mostra o campo do TX2 lido pelo script e "
                       "informa que o campo do JSON não foi identificado, sem supor.", corpo))

    h.append(Paragraph("6. Relação IBS e CBS", secao))
    h.append(Paragraph("Escolha pesquisar por item da LC 116 ou por código de operação (indOp). Pelo item, a tela lista os "
                       "NBS do item com o indOp, se a operação é onerosa, se o adquirente é do exterior, o local de "
                       "incidência do IBS e os cClassTrib. Pelo indOp, mostra as características da operação no anexo VII "
                       "e os itens e NBS que o usam no anexo VIII. Todo código tem ícone de informação com a descrição "
                       "do anexo. A aba REGRA inc. X do anexo VIII fica disponível no fim da tela.", corpo))

    h.append(Paragraph("7. Validador de JSON", secao))
    h.append(Paragraph("Cole o corpo do POST /nfse e o painel analisa tudo no navegador. Cada achado informa a fonte e "
                       "liga as tags afetadas ao popup de regras.", corpo))
    h.append(KeepTogether(tabela([
        ["Conferência", "Fonte"],
        ["Obrigatoriedade de código, valor e descrição do serviço", "Anexo VI (ocorrência das tags) e script do Nacional"],
        ["Quantidade de dígitos de documento, código de serviço, cidade e CEP", "Script do Nacional e anexo VI (tipo e tamanho)"],
        ["Tamanho e tipo dos campos copiados sem conversão", "Anexo VI, leiaute da tag"],
        ["Alíquota de ISS acima de 5%", "Anexo VI, regra E0595 de pAliq, citada literalmente"],
        ["Soma das contribuições em vRetCSLL e código de tpRetPisCofins", "Lib do PlugNotas, script do Nacional e anexo VI"],
        ["Grupo IBSCBS ausente", "Anexo VI, notas de tpRetPisCofins e do grupo IBSCBS"],
        ["indOp e combinação com cClassTrib", "Anexos VII e VIII"],
        ["Dígito verificador, retenções e deduções", "Cálculo sobre os valores do JSON"],
    ], [235, 230])))
    h.append(Spacer(1, 6))

    h.append(Paragraph("8. Como o painel é publicado e atualizado", secao))
    h.append(Paragraph("O repositório é privado e o painel é aberto, sem login. Só vai para o site o que ele precisa "
                       "para funcionar; o gerador e os anexos ficam apenas no repositório.", corpo))
    h.append(Paragraph("Cada commit no branch principal gera um deploy automático, em geral em cerca de um minuto. Isso "
                       "vale para código, catálogos de rotas, regras do validador e definições regeneradas. Se um deploy "
                       "falhar, o anterior continua no ar.", corpo))
    h.append(Paragraph("O de-para e as tabelas do IBS e da CBS são gerados a partir dos anexos e das fontes internas do "
                       "PlugNotas por um gerador que acompanha o projeto. Nada desse conteúdo é escrito à mão.", corpo))

    h.append(Paragraph("9. Limitações", secao))
    h.append(item("A lib e o script do Nacional usam nomes de TX2 diferentes em alguns campos. Nesses casos o campo do "
                  "JSON aparece como não identificado."))
    h.append(item("O arquivo de mapeamento do componente é da v1.01 e alguns caminhos dele não existem no leiaute RTC do "
                  "anexo VI. Essas tags aparecem sem o lado do PlugNotas."))
    h.append(item("O validador não confere regras que dependem de parametrização municipal ou de cadastro no ADN; elas "
                  "ficam visíveis no popup de cada tag."))
    h.append(item("Com a conferência do resolve desligada, o resultado reflete só a resposta HTTP."))
    documento.build(h)
    print("manual gerado")


construir()
