import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescCE } from '../src/services/sescRegional/ce'

// Recorte do HTML real de sistemas.sesc-ce.com.br/LICITASESC/download/licitacaoList.seam (2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/ce.html'), 'utf8')
const ctx = {
  url: 'https://sistemas.sesc-ce.com.br/LICITASESC/download/licitacaoList.seam',
  agora: new Date(2026, 8, 30, 10, 0),
}

describe('sescCE', () => {
  const r = sescCE.parse(html, ctx)

  it('mantém as atuais e descarta homologada/arquivada e exclusiva do Senac', () => {
    const ids = r.map((t) => t.fonteId)
    expect(ids).toContain('SESC-CE-9025')
    expect(ids).toContain('SESC-CE-9017')
    expect(ids).toContain('SESC-CE-7289') // credenciamento de 2025 ainda em andamento
    expect(r).toHaveLength(3)
  })

  it('preenche fonte, UF, órgão e links absolutos sem jsessionid', () => {
    for (const t of r) {
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('CE')
      expect(t.orgao).toBe('Sesc Ceará')
      expect(t.linkEdital).toMatch(/^https:\/\/sistemas\.sesc-ce\.com\.br\/LICITASESC\/download\/licitacaoView\.seam\?licitacaoId=\d+$/)
    }
  })

  it('extrai objeto, modalidade, data e número', () => {
    const t = r.find((x) => x.fonteId === 'SESC-CE-9017')!
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.aberturaAt).toEqual(new Date(2026, 9, 2))
    expect(t.numeroControle).toBe('Proc. 120987 - Instr. 47')
    expect(t.objeto).toContain('SEGURO VEICULAR')
    expect(r.find((x) => x.fonteId === 'SESC-CE-7289')!.modalidade).toBe('CREDENCIAMENTO')
  })

  it('descarta pregão com sessão já realizada', () => {
    const passado = html.replace('13/10/2026', '13/09/2026')
    expect(sescCE.parse(passado, ctx).map((t) => t.fonteId)).not.toContain('SESC-CE-9025')
  })
})
