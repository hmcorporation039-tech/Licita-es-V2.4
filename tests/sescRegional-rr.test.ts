import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescRR } from '../src/services/sescRegional/rr'

// Recorte da resposta real de GET /licitacao?etapa=1 do portal do Sesc RR em
// 30/09/2026: 26/027 (abre 02/10) e 26/023 (abriu em 26/08) e 24/0037 (2024,
// ainda marcada PUBLICADA). Os testes com "SINTÉTICO" montam casos que o portal
// não tinha no dia da coleta (republicada, credenciamento, etapa encerrada).
const json = readFileSync(join(__dirname, 'fixtures/sesc/rr.json'), 'utf8')
const URL1 = 'https://licitacao.sescrr.com.br/licitacao?etapa=1&offset=0&limit=50'
const ctx = { url: URL1, agora: new Date(2026, 8, 30, 12, 0) }

const item = (over: Record<string, unknown>) => ({
  id: 900,
  modalidade: { titulo: 'PREGÃO PRESENCIAL' },
  numProcesso: '26/999',
  ano: '2026',
  dataAbertura: '2026-11-10',
  dataPublicacao: '2026-09-20',
  objeto: 'OBJETO SINTÉTICO',
  etapa: { titulo: 'PUBLICADA' },
  ...over,
})

describe('sescRR', () => {
  const r = sescRR.parse(json, ctx)

  it('mantém só a licitação com abertura de hoje em diante', () => {
    expect(r.map((t) => t.numeroControle)).toEqual(['26/027'])
    // 26/023 abriu em 26/08 e 24/0037 é de 2024: o portal as deixa como PUBLICADA.
  })

  it('preenche fonte, UF, órgão e fonteId estável a partir do id da API', () => {
    const t = r[0]
    expect(t.fonte).toBe('SESC_REGIONAL')
    expect(t.fonteId).toBe('SESC-RR-503')
    expect(t.uf).toBe('RR')
    expect(t.orgao).toBe('Sesc Roraima')
    expect(t.modalidade).toBe('PREGAO_PRESENCIAL') // "PREGÃO PRESENCIAL - SRP"
    expect(t.objeto).toContain('MATERIAIS DE ILUMINAÇÃO')
    expect(t.aberturaAt).toEqual(new Date(2026, 9, 2))
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 25))
    expect(t.linkEdital).toBe('https://licitacao.sescrr.com.br/') // arquivos exigem login
  })

  it('pede só as etapas publicada e republicada, já filtradas no servidor', () => {
    expect(sescRR.urls(ctx.agora)).toEqual([
      'https://licitacao.sescrr.com.br/licitacao?etapa=1&offset=0&limit=50',
      'https://licitacao.sescrr.com.br/licitacao?etapa=2&offset=0&limit=50',
    ])
  })

  it('SINTÉTICO: descarta etapa encerrada mesmo com abertura futura', () => {
    // O coletor só pede as etapas 1 e 2 ao servidor; isto é uma segunda barreira.
    for (const etapa of ['CANCELADA', 'DESERTA', 'FRACASSADA', 'FINALIZADA']) {
      const out = sescRR.parse(JSON.stringify({ data: [item({ etapa: { titulo: etapa } })] }), ctx)
      expect(out).toHaveLength(0)
    }
  })

  it('SINTÉTICO: mantém a republicada com abertura futura', () => {
    const out = sescRR.parse(JSON.stringify({ data: [item({ etapa: { titulo: 'REPUBLICADA' } })] }), ctx)
    expect(out).toHaveLength(1)
  })

  it('SINTÉTICO: credenciamento vale pela etapa, mesmo com a abertura já passada', () => {
    const cred = item({ modalidade: { titulo: 'CREDENCIAMENTO' }, dataAbertura: '2026-03-01' })
    const out = sescRR.parse(JSON.stringify({ data: [cred] }), ctx)
    expect(out).toHaveLength(1)
    expect(out[0].modalidade).toBe('CREDENCIAMENTO')
  })

  it('reconhece as modalidades do portal', () => {
    const mod = (titulo: string) =>
      sescRR.parse(JSON.stringify({ data: [item({ modalidade: { titulo } })] }), ctx)[0].modalidade
    expect(mod('CONCORRÊNCIA')).toBe('CONCORRENCIA')
    expect(mod('CARTA CONVITE')).toBe('CONVITE')
    expect(mod('LEILÃO')).toBe('OUTROS')
    expect(mod('DOAÇÃO')).toBe('OUTROS')
  })

  it('pede a próxima página só quando há mais itens que o limite, mantendo a etapa', () => {
    expect(sescRR.proximasPaginas!(json, ctx)).toEqual([])
    const grande = JSON.stringify({ data: [], count: 120 })
    expect(sescRR.proximasPaginas!(grande, ctx)).toEqual([
      'https://licitacao.sescrr.com.br/licitacao?etapa=1&offset=50&limit=50',
    ])
    expect(
      sescRR.proximasPaginas!(grande, { ...ctx, url: 'https://licitacao.sescrr.com.br/licitacao?etapa=2&offset=50&limit=50' })
    ).toEqual(['https://licitacao.sescrr.com.br/licitacao?etapa=2&offset=100&limit=50'])
    expect(
      sescRR.proximasPaginas!(grande, { ...ctx, url: 'https://licitacao.sescrr.com.br/licitacao?etapa=1&offset=100&limit=50' })
    ).toEqual([])
  })

  it('falha com mensagem clara se a resposta não for JSON', () => {
    expect(() => sescRR.parse('<html>Erro</html>', ctx)).toThrow(/não é JSON/)
  })
})
