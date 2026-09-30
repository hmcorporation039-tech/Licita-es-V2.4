import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescAP } from '../src/services/sescRegional/ap'

// Recorte do HTML real de www.sescamapa.com.br/licitacoes (2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/ap.html'), 'utf8')
const ctx = { url: 'https://www.sescamapa.com.br/licitacoes', agora: new Date(2026, 8, 30, 10, 0) }

describe('sescAP', () => {
  const r = sescAP.parse(html, ctx)

  it('mantém as recentes em aberto e descarta homologadas e antigas', () => {
    // Homologada (000006-26) e "Aguradando Abertura" publicada em 15/06 (mais de 60 dias) ficam fora
    expect(r.map((t) => t.numeroControle)).toEqual(['000011-26-PG', '000015-26-PG', '000010-26-PG'])
  })

  it('a janela de publicação acompanha o relógio', () => {
    const recuado = sescAP.parse(html, { ...ctx, agora: new Date(2026, 5, 20) })
    expect(recuado.map((t) => t.numeroControle)).toContain('000009-26-PG')
  })

  it('preenche fonte, UF, órgão, fonteId único e link absoluto', () => {
    const ids = r.map((t) => t.fonteId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of r) {
      expect(t.fonteId).toMatch(/^SESC-AP-/)
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('AP')
      expect(t.orgao).toBe('Sesc Amapá')
      expect(t.linkEdital).toMatch(/^https:\/\/www\.sescamapa\.com\.br\/licitacao\/pregao\//)
    }
  })

  it('extrai objeto, modalidade e data de publicação', () => {
    const t = r.find((x) => x.numeroControle === '000011-26-PG')!
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.objeto).toContain('EQUIPAMENTOS ODONTOLÓGICOS')
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 10))
  })
})
