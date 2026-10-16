export interface Estado {
  sigla: string
  nome: string
  local: string
}

export const ESTADOS: Estado[] = [
  { sigla: 'AC', nome: 'Acre', local: 'no Acre' },
  { sigla: 'AL', nome: 'Alagoas', local: 'em Alagoas' },
  { sigla: 'AP', nome: 'Amapá', local: 'no Amapá' },
  { sigla: 'AM', nome: 'Amazonas', local: 'no Amazonas' },
  { sigla: 'BA', nome: 'Bahia', local: 'na Bahia' },
  { sigla: 'CE', nome: 'Ceará', local: 'no Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal', local: 'no Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo', local: 'no Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás', local: 'em Goiás' },
  { sigla: 'MA', nome: 'Maranhão', local: 'no Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso', local: 'em Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul', local: 'em Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais', local: 'em Minas Gerais' },
  { sigla: 'PA', nome: 'Pará', local: 'no Pará' },
  { sigla: 'PB', nome: 'Paraíba', local: 'na Paraíba' },
  { sigla: 'PR', nome: 'Paraná', local: 'no Paraná' },
  { sigla: 'PE', nome: 'Pernambuco', local: 'em Pernambuco' },
  { sigla: 'PI', nome: 'Piauí', local: 'no Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro', local: 'no Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte', local: 'no Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul', local: 'no Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia', local: 'em Rondônia' },
  { sigla: 'RR', nome: 'Roraima', local: 'em Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina', local: 'em Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo', local: 'em São Paulo' },
  { sigla: 'SE', nome: 'Sergipe', local: 'em Sergipe' },
  { sigla: 'TO', nome: 'Tocantins', local: 'no Tocantins' },
]

export function estadoDaSigla(sigla: string | null | undefined): Estado | null {
  if (!sigla) return null
  const limpa = sigla.trim().toUpperCase()
  return ESTADOS.find((e) => e.sigla === limpa) ?? null
}
