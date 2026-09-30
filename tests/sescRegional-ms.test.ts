import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescMS } from '../src/services/sescRegional/ms'

const html = readFileSync(join(__dirname, 'fixtures/sesc/ms.html'), 'utf8')
const ctx = { url: 'https://sesc.ms/licitacao-lista', agora: new Date(2026, 8, 28, 10, 0) }

describe('sescMS.parse', () => {
  const tenders = sescMS.parse(html, ctx)

  it('mantém só as atuais; descarta suspensa, concluída e cancelada', () => {
    expect(tenders.map((t) => t.numeroControle)).toEqual(['26/PE-083', '26/PG-054'])
  })

  it('preenche os campos padrão', () => {
    const [t] = tenders
    expect(t.fonte).toBe('SESC_REGIONAL')
    expect(t.uf).toBe('MS')
    expect(t.orgao).toBe('Sesc Mato Grosso do Sul')
    expect(t.fonteId).toBe('SESC-MS-26-PE-083')
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.objeto).toContain('vigilância desarmada')
    expect(t.aberturaAt).toEqual(new Date(2026, 9, 6))
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 29))
    expect(t.linkEdital).toBe('https://sesc.ms/sites/default/files/licita%C3%A7%C3%B5es/EDITAL_pe_83.pdf')
  })

  it('sessão marcada para hoje ainda é atual; presencial detectado', () => {
    expect(tenders[1].modalidade).toBe('PREGAO_PRESENCIAL')
    expect(tenders[1].encerramentoAt).toEqual(new Date(2026, 8, 28))
  })

  it('fonteId único e links absolutos', () => {
    expect(new Set(tenders.map((t) => t.fonteId)).size).toBe(tenders.length)
    for (const t of tenders) {
      const { anexos } = t.rawJson as { anexos: { uri: string }[] }
      for (const a of anexos) expect(a.uri).toMatch(/^https:\/\//)
    }
  })

  it('paginação por links do pager', () => {
    const p = sescMS.proximasPaginas?.(html, ctx) ?? []
    expect(p[0]).toBe('https://sesc.ms/licitacao-lista?page=1')
  })
})
