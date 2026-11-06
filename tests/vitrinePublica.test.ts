import { describe, expect, it } from 'vitest'
import { citaPessoaOuProcesso, limparObjetoDaVitrine, orgaoDaVitrine } from '../src/lib/vitrinePublica'

describe('vitrine pública', () => {
  it('tira da vitrine compras que citam paciente, mandado ou processo judicial', () => {
    expect(
      citaPessoaOuProcesso(
        'Aquisição de medicamento emergencial para atender ao mandado de segurança n.º 5651594-90.2025.8.09.0138 impetrado pelo paciente anna july'
      )
    ).toBe(true)
    expect(citaPessoaOuProcesso('Fornecimento de fraldas por determinação judicial')).toBe(true)
    expect(citaPessoaOuProcesso('Processo 0001234-56.2024.8.26.0100')).toBe(true)
    expect(citaPessoaOuProcesso('Paciente: CPF 123.456.789-00')).toBe(true)
  })

  it('mantém compras comuns, inclusive com "menor preço"', () => {
    expect(citaPessoaOuProcesso('Registro de preços para medicamentos da farmácia básica, menor preço por item')).toBe(false)
    expect(citaPessoaOuProcesso('Aquisição de câmeras de videomonitoramento')).toBe(false)
    expect(citaPessoaOuProcesso('Processo administrativo nº 123/2025 - aquisição de cadeiras')).toBe(false)
  })

  it('limpa prefixo de portal e acentua o órgão', () => {
    expect(limparObjetoDaVitrine('[Portal de Compras Públicas] - Aquisição de  material de limpeza')).toBe('Aquisição de material de limpeza')
    expect(limparObjetoDaVitrine('Aquisição de material [lote 1]')).toBe('Aquisição de material [lote 1]')
    expect(orgaoDaVitrine('Municipio de Rio Verde')).toBe('Município de Rio Verde')
    expect(orgaoDaVitrine('MUNICIPIO DE ANAPOLIS')).toBe('MUNICÍPIO DE ANAPOLIS')
  })
})
