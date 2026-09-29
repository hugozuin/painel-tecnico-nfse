const faixas = { 1: 3, 2: 2 };

const getPrestadorProps = (prestador) => ({
  DocumentoPrestador: prestador.cpfCnpj,
  ContatoPrestador: `${prestador.telefone?.ddd || ""}${prestador.telefone?.numero || ""}`,
  RegimePrestador: faixas[prestador.regime] || 0
});

module.exports = { getPrestadorProps };
