import { describe, expect, it } from 'vitest'
import { campoAusente, decidirRevisao, modoDeRevisao, valorAltoDeRevisao, valorEmReais } from '../src/lib/politicaDeRevisao'
import { executarPipeline } from '../src/services/analiseEmDupla'
import type { EditalAnalyzer } from '../src/services/llm/types'
import type { EditalReviewer } from '../src/services/llm/revisao'
import { analiseBase } from './helpers/analises'

const ok = [{ status: 'confirmado' }, { status: 'confirmado' }, { status: 'confirmado' }]
const boa = { ...analiseBase(), valorEstimado: 'R$ 50.000,00', dataSessao: '10/11/2026', criterioJulgamento: 'menor preço' }
const comMatriz = { ...boa, matrizExigencias: [{}, {}, {}] as never }

describe('decidirRevisao', () => {
  it('modo sempre revisa tudo', () => {
    expect(decidirRevisao(comMatriz, ok, 'sempre').revisar).toBe(true)
  })
  it('seletiva: análise limpa dispensa a revisão', () => {
    expect(decidirRevisao(comMatriz, ok, 'seletiva')).toEqual({ revisar: false, motivos: [] })
  })
  it('seletiva: sinais de risco exigem revisão', () => {
    expect(decidirRevisao({ ...boa, matrizExigencias: [] }, [], 'seletiva').motivos[0]).toMatch(/nenhuma exigência/)
    expect(decidirRevisao(comMatriz, [...ok, { status: 'nao-localizado' }, { status: 'nao-localizado' }, { status: 'nao-localizado' }], 'seletiva').revisar).toBe(true)
    expect(decidirRevisao(comMatriz, [...ok, { status: 'nao-verificavel' }], 'seletiva').motivos[0]).toMatch(/escaneado/)
    expect(decidirRevisao({ ...comMatriz, valorEstimado: 'Não informado', dataSessao: '' }, ok, 'seletiva').revisar).toBe(true)
  })
  it('um único campo ausente ou uma exigência não localizada não bastam', () => {
    expect(decidirRevisao({ ...comMatriz, dataSessao: '' }, ok, 'seletiva').revisar).toBe(false)
    const muitas = Array.from({ length: 30 }, () => ({ status: 'confirmado' }))
    expect(decidirRevisao(comMatriz, [...muitas, { status: 'nao-localizado' }], 'seletiva').revisar).toBe(false)
  })
  it('valor alto obriga a revisão quando o limite está configurado', () => {
    const cara = { ...comMatriz, valorEstimado: 'R$ 2.500.000,00' }
    expect(decidirRevisao(cara, ok, 'seletiva', 1_000_000).revisar).toBe(true)
    expect(decidirRevisao(cara, ok, 'seletiva', null).revisar).toBe(false)
    expect(decidirRevisao(comMatriz, ok, 'seletiva', 1_000_000).revisar).toBe(false)
  })
})

describe('auxiliares', () => {
  it('modo e limite vêm do ambiente, com padrão seguro', () => {
    expect(modoDeRevisao({})).toBe('sempre')
    expect(modoDeRevisao({ CLAUDE_REVIEW_MODE: ' Seletiva ' })).toBe('seletiva')
    expect(modoDeRevisao({ CLAUDE_REVIEW_MODE: 'xyz' })).toBe('sempre')
    expect(valorAltoDeRevisao({})).toBeNull()
    expect(valorAltoDeRevisao({ CLAUDE_REVIEW_VALOR_ALTO: '500000' })).toBe(500000)
    expect(valorAltoDeRevisao({ CLAUDE_REVIEW_VALOR_ALTO: 'abc' })).toBeNull()
  })
  it('valorEmReais e campoAusente', () => {
    expect(valorEmReais('R$ 1.234.567,89')).toBe(1234567.89)
    expect(valorEmReais('R$ 1500')).toBe(1500)
    expect(valorEmReais('sigiloso')).toBeNull()
    expect(campoAusente('Não informado no edital')).toBe(true)
    expect(campoAusente('')).toBe(true)
    expect(campoAusente('menor preço')).toBe(false)
  })
})

describe('executarPipeline em modo seletivo', () => {
  const uso = { provider: 'gemini', model: 'g', inputTokens: 1, outputTokens: 1 }
  const docs = [{ nome: 'E.pdf', tipo: 'texto' as const, texto: 'A licitante deverá apresentar atestado de capacidade técnica compatível com o objeto.' }]
  let revisou = false
  const revisor: EditalReviewer = async (_o, _d, r) => {
    revisou = true
    return { resultado: r, relatorio: { veredito: 'aprovada', resumo: '', justificativas: [] }, uso: { ...uso, provider: 'claude' } }
  }
  const analista: EditalAnalyzer = async () => ({ resultado: { ...boa, matrizExigencias: analiseBase().matrizExigencias }, uso })

  it('sem sinais de risco, pula a Claude e diz por quê', async () => {
    revisou = false
    const r = await executarPipeline({ objeto: 'x', documentos: docs, analista, revisor, env: { CLAUDE_REVIEW_MODE: 'seletiva' } })
    expect(revisou).toBe(false)
    expect(r.revisao.status).toBe('NAO_EXECUTADA')
    expect(r.revisao.motivo).toMatch(/dispensada/)
    expect(r.usos).toHaveLength(1)
  })
  it('com sinal de risco (sem exigências), revisa normalmente', async () => {
    revisou = false
    const semMatriz: EditalAnalyzer = async () => ({ resultado: { ...boa, matrizExigencias: [] }, uso })
    const r = await executarPipeline({ objeto: 'x', documentos: docs, analista: semMatriz, revisor, env: { CLAUDE_REVIEW_MODE: 'seletiva' } })
    expect(revisou).toBe(true)
    expect(r.revisao.status).toBe('OK')
  })
  it('no modo padrão revisa sempre', async () => {
    revisou = false
    await executarPipeline({ objeto: 'x', documentos: docs, analista, revisor, env: {} })
    expect(revisou).toBe(true)
  })
})
