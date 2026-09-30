import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescDF } from '../src/services/sescRegional/df'

// Recorte do HTML real de www.sescdf.com.br/portal-de-compras?delta=60 (2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/df.html'), 'utf8')
const ctx = { url: 'https://www.sescdf.com.br/portal-de-compras?delta=60', agora: new Date(2026, 8, 30, 10, 0) }

describe('sescDF', () => {
  const r = sescDF.parse(html, ctx)

  it('mantém só as em andamento e recentes, descartando homologadas/encerradas', () => {
    const nums = r.map((t) => t.numeroControle)
    expect(nums).toContain('02/2026')
    expect(nums).toContain('43/2026')
    expect(r.filter((t) => t.modalidade === 'CONVITE')).toHaveLength(1) // o Convite 01/2026 está homologado
    expect(nums).not.toContain('90072/2025') // Encerrado
    expect(nums).not.toContain('90088/2025') // badges "Encerrado | Em andamento"
    expect(r).toHaveLength(2)
  })

  it('descarta processo antigo que o portal ainda marca como Em andamento', () => {
    // 90020/2026 está "Em andamento" mas foi publicado há mais de 60 dias: sem data
    // de sessão na listagem, a recência da publicação é o que define "atual".
    const comAgoraTardia = sescDF.parse(html, { ...ctx, agora: new Date(2026, 8, 30) })
    expect(comAgoraTardia.map((t) => t.numeroControle)).not.toContain('90020/2026')
    // E recua-se o relógio, o mesmo processo volta a ser recente.
    const recuado = sescDF.parse(html, { ...ctx, agora: new Date(2026, 5, 10) })
    expect(recuado.map((t) => t.numeroControle)).toContain('90020/2026')
  })

  it('preenche fonte, UF, órgão e fonteId único', () => {
    const ids = r.map((t) => t.fonteId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of r) {
      expect(t.fonteId).toMatch(/^SESC-DF-/)
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('DF')
      expect(t.orgao).toBe('Sesc Distrito Federal')
      expect(t.linkEdital).toMatch(/^https:\/\/www\.sescdf\.com\.br/)
    }
  })

  it('extrai objeto, modalidade e data de publicação', () => {
    const t = r.find((x) => x.numeroControle === '02/2026')!
    expect(t.modalidade).toBe('CONVITE')
    expect(t.objeto).toContain('PRÊMIO SESC COMERCIÁRIO DESTAQUE 2026')
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 28))
    const pe = r.find((x) => x.numeroControle === '43/2026')!
    expect(pe.modalidade).toBe('PREGAO_ELETRONICO')
  })

  it('lista as próximas páginas da paginação', () => {
    const p = sescDF.proximasPaginas!(html, ctx)
    expect(p).toEqual([
      'https://www.sescdf.com.br/portal-de-compras?delta=60&start=2',
      'https://www.sescdf.com.br/portal-de-compras?delta=60&start=3',
    ])
  })
})
