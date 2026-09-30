import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescPB } from '../src/services/sescRegional/pb'

// Recorte do parcial real www.sescpb.com.br/transparencia/partials/licitacoes.php (2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/pb.html'), 'utf8')
const ctx = {
  url: 'https://www.sescpb.com.br/transparencia/partials/licitacoes.php',
  agora: new Date(2026, 8, 30, 10, 0),
}

describe('sescPB', () => {
  const r = sescPB.parse(html, ctx)

  it('mantém só em andamento com abertura de hoje em diante', () => {
    const nums = r.map((t) => t.numeroControle)
    expect(nums).toEqual(['00033/2026', '00034/2026'])
    expect(nums).not.toContain('00007/2026') // em andamento, mas aberta em 16/03/2026
    expect(nums).not.toContain('00004/2025') // credenciamento com data de 31/12/2025
    expect(nums).not.toContain('00002/2026') // concurso de março
  })

  it('descarta painéis de processos concluídos', () => {
    const tardia = sescPB.parse(html, { ...ctx, agora: new Date(2026, 0, 1) })
    // Recuando o relógio voltam as em andamento, nunca a da aba "Concluida".
    expect(tardia.length).toBeGreaterThan(r.length)
    expect(tardia.every((t) => t.numeroControle !== '00001/2026')).toBe(true)
  })

  it('preenche fonte, UF, órgão e fonteId estável e único', () => {
    const ids = r.map((t) => t.fonteId)
    expect(ids).toEqual(['SESC-PB-concorrencia-00033-2026', 'SESC-PB-concorrencia-00034-2026'])
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of r) {
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('PB')
      expect(t.orgao).toBe('Sesc Paraíba')
    }
  })

  it('extrai objeto, modalidade, data de abertura e anexos absolutos', () => {
    const t = r[0]
    expect(t.modalidade).toBe('CONCORRENCIA')
    expect(t.objeto).toContain('CONSTRUCAO CIVIL')
    expect(t.aberturaAt).toEqual(new Date(2026, 9, 1, 10, 0))
    expect(t.linkEdital).toMatch(/^https:\/\/www\.sescpb\.com\.br\/transparencia\/mostrar_arquivo\.php\?id=\d+$/)
    const anexos = (t.rawJson as { anexos: { uri: string; titulo: string }[] }).anexos
    expect(anexos.length).toBeGreaterThan(0)
    for (const a of anexos) expect(a.uri).toMatch(/^https:\/\/www\.sescpb\.com\.br\/transparencia\//)
  })

  it('aponta para o parcial da lista, não para a home', () => {
    expect(sescPB.urls(ctx.agora)).toEqual(['https://www.sescpb.com.br/transparencia/partials/licitacoes.php'])
  })
})
