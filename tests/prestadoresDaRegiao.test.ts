import { describe, expect, it } from 'vitest'
import { SERVICOS_PROCURADOS, lugarDoGoogle, nichoAtende, notaAjustada, ordenarLugares, prestadorAtendeAObra, servicoPorId } from '../src/lib/prestadoresDaRegiao'
import { CATALOGO_DE_NICHOS } from '../src/lib/obrasEGanhadores'

const belem = { municipio: 'Belém', uf: 'PA', lat: -1.4558, lng: -48.4902 }
const ananindeua = { lat: -1.3656, lng: -48.3722 }

describe('prestadores da região', () => {
  it('tem um serviço para cada nicho do catálogo, com o que buscar no Google', () => {
    expect(SERVICOS_PROCURADOS.map((s) => s.id)).toEqual(CATALOGO_DE_NICHOS.map((n) => n.id))
    for (const s of SERVICOS_PROCURADOS) expect(s.busca.length).toBeGreaterThan(3)
  })

  it('casa o nicho pelo nome do catálogo ou por palavra num nicho próprio', () => {
    const eletrica = servicoPorId('eletrica')!
    expect(nichoAtende({ nome: 'Instalações elétricas' }, eletrica)).toBe(true)
    expect(nichoAtende({ nome: 'Manutenção Elétrica Predial' }, eletrica)).toBe(true)
    expect(nichoAtende({ nome: 'Pintura' }, eletrica)).toBe(false)
  })

  it('atende pela região cadastrada ou por estar perto da obra', () => {
    expect(prestadorAtendeAObra({ raioKm: null, ufs: ['PA'], base: null }, belem, 100).atende).toBe(true)
    const perto = prestadorAtendeAObra({ raioKm: 10, ufs: [], base: ananindeua }, belem, 100)
    expect(perto.atende).toBe(true)
    expect(perto.distanciaKm).toBeLessThan(30)
    expect(prestadorAtendeAObra({ raioKm: 150, ufs: ['SP'], base: { lat: -23.55, lng: -46.63 } }, belem, 300).atende).toBe(false)
  })

  it('ordena pela nota ajustada: muitas avaliações vencem nota alta com poucas', () => {
    expect(notaAjustada(4.8, 200)).toBeGreaterThan(notaAjustada(5, 3))
    expect(notaAjustada(null, 0)).toBe(0)
    const base = { endereco: null, telefone: null, site: null, linkMaps: null }
    const lista = ordenarLugares(
      [
        { ...base, id: 'a', nome: 'Poucas', nota: 5, avaliacoes: 3, ...ananindeua },
        { ...base, id: 'b', nome: 'Muitas', nota: 4.8, avaliacoes: 200, ...ananindeua },
        { ...base, id: 'b', nome: 'Repetida', nota: 4.8, avaliacoes: 200, ...ananindeua },
        { ...base, id: 'c', nome: 'Longe', nota: 5, avaliacoes: 900, lat: -23.55, lng: -46.63 },
      ],
      belem,
      100
    )
    expect(lista.map((l) => l.nome)).toEqual(['Muitas', 'Poucas'])
  })

  it('lê o lugar da Places API e descarta o fechado', () => {
    const l = lugarDoGoogle({
      id: 'x1',
      displayName: { text: 'Elétrica Pará' },
      formattedAddress: 'Belém - PA',
      location: { latitude: -1.4, longitude: -48.4 },
      rating: 4.7,
      userRatingCount: 58,
      nationalPhoneNumber: '(91) 3222-0000',
      googleMapsUri: 'https://maps.google.com/?cid=1',
      businessStatus: 'OPERATIONAL',
    })
    expect(l).toMatchObject({ nome: 'Elétrica Pará', nota: 4.7, avaliacoes: 58, telefone: '(91) 3222-0000', site: null })
    expect(lugarDoGoogle({ id: 'x2', displayName: { text: 'Fechada' }, businessStatus: 'CLOSED_PERMANENTLY' })).toBeNull()
    expect(lugarDoGoogle(null)).toBeNull()
  })
})
