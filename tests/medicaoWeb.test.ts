import { describe, expect, it } from 'vitest'
import { guardarEscolha, idDaMedicao, lerEscolha } from '../web/src/lib/medicao'

function memoria() {
  const dados = new Map<string, string>()
  return { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => void dados.set(k, v) }
}

describe('Google Analytics com consentimento', () => {
  it('usa o ID da Licita Bela por padrão, aceita troca e pode ser desligado', () => {
    expect(idDaMedicao(undefined)).toBe('G-ZJQHVTXD35')
    expect(idDaMedicao('G-ABC1234')).toBe('G-ABC1234')
    expect(idDaMedicao('desligado')).toBeNull()
    expect(idDaMedicao('qualquer-coisa')).toBeNull()
  })

  it('sem escolha guardada o aviso aparece; a escolha fica guardada', () => {
    const a = memoria()
    expect(lerEscolha(a)).toBeNull()
    guardarEscolha('recusada', a)
    expect(lerEscolha(a)).toBe('recusada')
    guardarEscolha('aceita', a)
    expect(lerEscolha(a)).toBe('aceita')
  })

  it('valor estranho no armazenamento conta como sem escolha', () => {
    const a = memoria()
    a.setItem('licita-bela:medicao', 'talvez')
    expect(lerEscolha(a)).toBeNull()
    expect(lerEscolha(null)).toBeNull()
  })
})
