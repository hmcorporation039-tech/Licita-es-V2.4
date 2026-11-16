import { describe, expect, it } from 'vitest'
import { ondeDisputar } from '../src/lib/ondeDisputar'

describe('ondeDisputar', () => {
  it('mostra o portal conhecido pelo nome curto', () => {
    expect(ondeDisputar({ fonte: 'PNCP', plataformaDeOrigem: 'BLL Compras' })).toBe('BLL')
  })
  it('usa o apelido de uma plataforma que não é portal da lista', () => {
    expect(ondeDisputar({ fonte: 'PNCP', plataformaDeOrigem: 'IPM Sistemas' })).toBe('IPM Sistemas')
  })
  it('diz quando é o próprio órgão que publica', () => {
    expect(ondeDisputar({ fonte: 'PNCP', plataformaDeOrigem: 'Prefeitura Municipal de Valparaíso de Goiás' })).toBe('Sistema do próprio órgão')
  })
  it('sem plataforma, não inventa', () => {
    expect(ondeDisputar({ fonte: 'SESC_GO', plataformaDeOrigem: null })).toBeNull()
  })
})
