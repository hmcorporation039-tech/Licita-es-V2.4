import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescMT } from '../src/services/sescRegional/mt'

const html = readFileSync(join(__dirname, 'fixtures/sesc/mt.html'), 'utf8')
const ctx = { url: 'https://www.sescmt.com.br/index.php/licitacao/', agora: new Date(2026, 8, 30, 10, 0) }

describe('sescMT.parse', () => {
  const tenders = sescMT.parse(html, ctx)

  it('mantém só as atuais; descarta concluída e "Em Aberto" com data vencida', () => {
    expect(tenders.map((t) => t.numeroControle)).toEqual(['26/001', '25/005'])
  })

  it('preenche os campos padrão', () => {
    const [t] = tenders
    expect(t.fonte).toBe('SESC_REGIONAL')
    expect(t.uf).toBe('MT')
    expect(t.orgao).toBe('Sesc Mato Grosso')
    expect(t.modalidade).toBe('CONCORRENCIA')
    expect(t.fonteId).toBe('SESC-MT-26-001-concorrencia-eletronica')
    expect(t.encerramentoAt).toEqual(new Date(2026, 9, 6, 9, 0))
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 1))
    expect(t.objeto).toContain('TRANSACOES FINANCEIRAS')
    expect(t.linkEdital).toBe('https://www.sescmt.com.br/index.php/licitacao/')
    expect((t.rawJson as { anexos: unknown[] }).anexos.length).toBeGreaterThan(0)
  })

  it('credenciamento em aberto continua atual mesmo com data de início passada', () => {
    const c = tenders[1]
    expect(c.modalidade).toBe('CREDENCIAMENTO')
    expect(c.fonteId).toBe('SESC-MT-25-005-credenciamento')
  })

  it('fonteId único', () => {
    expect(new Set(tenders.map((t) => t.fonteId)).size).toBe(tenders.length)
  })

  it('paginação: demais páginas via ajax (pagina 0-based)', () => {
    const p = sescMT.proximasPaginas?.(html, ctx) ?? []
    expect(p.length).toBeGreaterThan(0)
    expect(p[0]).toContain('licitacao_listagem.php?pagina=1')
  })
})
