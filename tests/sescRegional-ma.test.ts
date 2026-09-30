import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sescMA } from '../src/services/sescRegional/ma'

const html = readFileSync('tests/fixtures/sesc/ma.html', 'utf8')
const url = 'https://sescma.com.br/licitacao_new/'

describe('sescMA.parse', () => {
  const agora = new Date(2026, 8, 30, 10, 0)
  const r = sescMA.parse(html, { url, agora })

  it('devolve só atuais (aberta e sessão hoje/futura)', () => {
    expect(r.map((t) => t.numeroControle)).toEqual(['0015/26-PG-SRP', '0014/26-PG-SRP'])
  })
  it('campos básicos', () => {
    const t = r[0]
    expect(t.fonte).toBe('SESC_REGIONAL')
    expect(t.fonteId).toBe('SESC-MA-0015-26-PG-SRP')
    expect(t.uf).toBe('MA')
    expect(t.orgao).toBe('Sesc Maranhão')
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.aberturaAt).toEqual(new Date(2026, 9, 7, 14, 30))
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 28))
    expect(t.linkEdital).toBe('https://sescma.com.br/licitacao_new/g/gerenciador/arquivos/editais/6aba9fd9cc466.pdf')
  })
  it('fonteIds únicos', () => {
    expect(new Set(r.map((t) => t.fonteId)).size).toBe(r.length)
  })
  it('descarta em aberto com sessão vencida e encerradas', () => {
    expect(r.some((t) => t.numeroControle === '0004/26-CV')).toBe(false)
    expect(r.some((t) => t.numeroControle === '0012/26-PG')).toBe(false)
  })
  it('em data posterior nada resta', () => {
    expect(sescMA.parse(html, { url, agora: new Date(2026, 11, 1) })).toHaveLength(0)
  })
})
