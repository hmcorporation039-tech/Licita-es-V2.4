import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescMG } from '../src/services/sescRegional/mg'

// Recorte do HTML real de sescmg.com.br/licitacoes/?situacao_licitacao=em-andamento (2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/mg.html'), 'utf8')
const ctx = {
  url: 'https://sescmg.com.br/licitacoes/?situacao_licitacao=em-andamento',
  agora: new Date(2026, 8, 30, 10, 0),
}

describe('sescMG', () => {
  const r = sescMG.parse(html, ctx)

  it('mantém só as publicadas recentemente, descartando o histórico antigo', () => {
    expect(r.map((t) => t.numeroControle)).toEqual(['PE 0079.26', 'PE 0073.26', 'PE 000074-26'])
  })

  it('preenche fonte, UF, órgão, fonteId estável e único, link absoluto', () => {
    const ids = r.map((t) => t.fonteId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('SESC-MG-pe-0079-26-limpeza-e-tratamento-de-piscinas-sesc-contagem')
    for (const t of r) {
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('MG')
      expect(t.orgao).toBe('Sesc em Minas')
      expect(t.linkEdital).toMatch(/^https:\/\/sescmg\.com\.br\/licitacao\//)
    }
  })

  it('extrai objeto, modalidade e data de publicação', () => {
    const t = r[0]
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.objeto).toContain('limpeza, tratamento, conservação e monitoramento de piscinas')
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 30))
  })

  it('a janela de publicação depende do "agora"', () => {
    expect(sescMG.parse(html, { ...ctx, agora: new Date(2026, 11, 31) })).toHaveLength(0)
  })

  it('aponta a próxima página só se a atual ainda tem itens recentes', () => {
    // a página do fixture mistura itens antigos: não segue
    expect(sescMG.proximasPaginas!(html, ctx)).toEqual([])
    const soRecentes = html.replace(/06\/02\/2024|21\/08\/2023/g, '29/09/2026')
    expect(sescMG.proximasPaginas!(soRecentes, ctx)).toEqual([
      'https://sescmg.com.br/licitacoes/page/2/?situacao_licitacao=em-andamento',
    ])
  })
})
