import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescAM } from '../src/services/sescRegional/am'

// Recorte do HTML real de www.sesc-am.com.br/licitacao/ (2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/am.html'), 'utf8')
const ctx = { url: 'https://www.sesc-am.com.br/licitacao/', agora: new Date(2026, 8, 30, 10, 0) }

describe('sescAM', () => {
  const r = sescAM.parse(html, ctx)

  it('mantém só as atuais (abertura hoje ou futura) e descarta as passadas', () => {
    const nums = r.map((t) => t.numeroControle)
    expect(nums).toContain('26/065PGE')
    expect(nums).toContain('26/056PGE')
    expect(nums).toContain('26/002-CP')
    expect(nums).not.toContain('26/004PGE') // "Aberto" no portal, mas abertura 25/02/2026
    expect(r).toHaveLength(3)
  })

  it('preenche identificação, fonte e UF com fonteId único', () => {
    const ids = r.map((t) => t.fonteId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('SESC-AM-26-065PGE')
    for (const t of r) {
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('AM')
      expect(t.orgao).toBe('Sesc Amazonas')
    }
  })

  it('extrai objeto, modalidade e datas', () => {
    const t = r.find((x) => x.numeroControle === '26/065PGE')!
    expect(t.objeto).toMatch(/^CONTRATAÇÃO DE SERVIÇO DE RECEPTIVO TURISTICO/)
    expect(t.modalidade).toBe('PREGAO_PRESENCIAL')
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 23))
    expect(t.aberturaAt).toEqual(new Date(2026, 9, 8))
    const cred = r.find((x) => x.numeroControle === '26/002-CP')!
    expect(cred.modalidade).toBe('CREDENCIAMENTO') // coluna Modalidade vazia -> objeto
  })

  it('devolve anexos com links absolutos e prefere o edital', () => {
    const t = r.find((x) => x.numeroControle === '26/065PGE')!
    const anexos = (t.rawJson as { anexos: { uri: string; titulo: string }[] }).anexos
    expect(anexos).toHaveLength(2)
    for (const a of anexos) expect(a.uri).toMatch(/^https:\/\/www\.sesc-am\.com\.br\/licitacao\/ARQUIVOS\//)
    expect(t.linkEdital).toContain('EDITAL_E_ANEXOS')
  })
})
