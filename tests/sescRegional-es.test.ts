import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescES } from '../src/services/sescRegional/es'

// Recorte do HTML real de sesc-es.com.br/licitacoes-e-editais/ (2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/es.html'), 'utf8')
const ctx = { url: 'https://sesc-es.com.br/licitacoes-e-editais/', agora: new Date(2026, 8, 30, 10, 0) }

describe('sescES', () => {
  const r = sescES.parse(html, ctx)

  it('mantém só em andamento e recentes', () => {
    const nums = r.map((t) => t.numeroControle)
    expect(nums).toEqual(['074/2026', '071/2026'])
    expect(nums).not.toContain('073/2026') // Homologada
    expect(nums).not.toContain('064/2026') // Suspensa
    expect(nums).not.toContain('007/2026') // em andamento, mas publicada em 31/07 (fora da janela)
  })

  it('preenche fonte, UF, órgão, fonteId único e estável', () => {
    const ids = r.map((t) => t.fonteId)
    expect(ids).toEqual(['SESC-ES-pg-074-2026', 'SESC-ES-pg-071-2026'])
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of r) {
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('ES')
      expect(t.orgao).toBe('Sesc Espírito Santo')
    }
  })

  it('extrai objeto, modalidade, publicação e anexos com links absolutos', () => {
    const t = r[0]
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.objeto).toContain('Aquisição de pneus')
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 17))
    expect(t.linkEdital).toBe('https://sesc-es.com.br/wp-content/uploads/2026/09/EDITAL-3.pdf')
    const anexos = (t.rawJson as { anexos: { uri: string }[] }).anexos
    expect(anexos).toHaveLength(2)
    for (const a of anexos) expect(a.uri).toMatch(/^https:\/\/sesc-es\.com\.br\//)
  })

  it('recuando o relógio, a concorrência antiga volta a ser recente', () => {
    const recuado = sescES.parse(html, { ...ctx, agora: new Date(2026, 7, 10) })
    expect(recuado.map((t) => t.numeroControle)).toContain('007/2026')
    expect(recuado.find((t) => t.numeroControle === '007/2026')!.modalidade).toBe('CONCORRENCIA')
  })

  it('só segue a paginação enquanto a última publicação é recente', () => {
    expect(sescES.proximasPaginas!(html, ctx)).toEqual([])
    const recuado = { ...ctx, agora: new Date(2026, 7, 10) }
    expect(sescES.proximasPaginas!(html, recuado)).toEqual(['https://sesc-es.com.br/licitacoes-e-editais/?paged=2'])
  })

  it('aponta para a lista real, não para a home', () => {
    expect(sescES.urls(ctx.agora)).toEqual(['https://sesc-es.com.br/licitacoes-e-editais/'])
  })
})
