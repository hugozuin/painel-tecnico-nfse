const auxiliar = async ({ nfse }) => {
  if (await validate.isFromPadrao({ codigoCidade: nfse.prestador.endereco.codigoCidade, padrao: 'OUTRO' })) {
    return nfse.valorEspecial
  }
  return nfse.servico[0].valor.bruto
}

const somaRetida = async ({ nfse }) => {
  const total = nfse.servico.reduce((acumulado, item) => (acumulado += item?.retido?.quantia), 0)
  return total ? Number(total).toFixed(2) : 0
}

const getRps = async (nfse) => {
  const retido = await somaRetida({ nfse })

  return {
    numero: nfse.rps.numero ? nfse.rps.numero : 1,
    valor: await auxiliar({ nfse }),
    retido,
    lista: nfse.servico[0]?.itens?.map(item => ({
      codigoItem: item.codigo
    })),
    semOrigem: 'fixo'
  }
}

module.exports = { getRps }
