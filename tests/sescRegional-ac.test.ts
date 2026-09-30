import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescAC } from '../src/services/sescRegional/ac'

// Recorte do HTML real de cpl.sescacre.com.br/transparencia/ (2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/ac.html'), 'utf8')
const ctx = { url: 'http://cpl.sescacre.com.br/transparencia/', agora: new Date(2026, 8, 15, 10, 0) }

describe('sescAC', () => {
  const r = sescAC.parse(html, ctx)

  it('mantém só as com abertura futura e descarta passadas, concluídas e linhas vazias', () => {
    // 008/2026 abriu em 02/09 (passou); 001/2026 está Concluída; id 575 é linha vazia
    expect(r.map((t) => t.numeroControle)).toEqual(['PE Nº 016/2026', 'PE Nº 018/2026'])
  })

  it('preenche fonte, UF, órgão, fonteId único e link absoluto', () => {
    const ids = r.map((t) => t.fonteId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('SESC-AC-580')
    for (const t of r) {
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('AC')
      expect(t.orgao).toBe('Sesc Acre')
      expect(t.linkEdital).toMatch(/^http:\/\/cpl\.sescacre\.com\.br\/transparencia\/detalhar\.php\?id_edital=\d+$/)
    }
  })

  it('extrai objeto, modalidade e data de abertura', () => {
    const t = r.find((x) => x.fonteId === 'SESC-AC-580')!
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.objeto).toContain('resíduos sólidos urbanos')
    expect(t.aberturaAt).toEqual(new Date(2026, 8, 21))
  })

  it('sem licitação atual quando todas já abriram', () => {
    expect(sescAC.parse(html, { ...ctx, agora: new Date(2026, 8, 30) })).toHaveLength(0)
  })

  it('aponta as próximas páginas só a partir da primeira', () => {
    expect(sescAC.proximasPaginas!(html, ctx)).toEqual([
      'http://cpl.sescacre.com.br/transparencia/index.php?pagina=2',
      'http://cpl.sescacre.com.br/transparencia/index.php?pagina=3',
    ])
    expect(
      sescAC.proximasPaginas!(html, { ...ctx, url: 'http://cpl.sescacre.com.br/transparencia/index.php?pagina=2' })
    ).toEqual([])
  })
})
