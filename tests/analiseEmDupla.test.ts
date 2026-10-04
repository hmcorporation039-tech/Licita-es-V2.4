import { describe, expect, it } from 'vitest'
import { configuracaoDeIa, executarPipeline } from '../src/services/analiseEmDupla'
import { AnalysisRefusedError, EditalAnalyzer, ErroComUso, UsoDeIa } from '../src/services/llm/types'
import type { EditalReviewer } from '../src/services/llm/revisao'
import { estimarCustoUsd } from '../src/services/aiUsageService'
import { analiseBase, exigencia } from './helpers/analises'

const usoGemini: UsoDeIa = { provider: 'gemini', model: 'gemini-x', inputTokens: 1000, outputTokens: 200 }
const usoClaude: UsoDeIa = { provider: 'claude', model: 'claude-opus-5-5', inputTokens: 3000, outputTokens: 900 }

describe('configuracaoDeIa', () => {
  const ambas = { GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }

  it('com as duas chaves: Gemini analisa e Claude revisa', () => {
    expect(configuracaoDeIa(ambas)).toMatchObject({ modo: 'dupla', analista: 'gemini', revisor: 'claude' })
  })

  it('só uma chave: análise simples com ela, sem revisor', () => {
    expect(configuracaoDeIa({ GEMINI_API_KEY: 'g' })).toMatchObject({ modo: 'gemini', analista: 'gemini', revisor: null })
    expect(configuracaoDeIa({ ANTHROPIC_API_KEY: 'a' })).toMatchObject({ modo: 'claude', analista: 'claude', revisor: null })
  })

  it('nenhuma chave: não configurada, com aviso', () => {
    const c = configuracaoDeIa({})
    expect(c.modo).toBeNull()
    expect(c.avisos.join(' ')).toMatch(/Nenhuma chave/)
  })

  it('chave vazia ou só espaços não conta', () => {
    expect(configuracaoDeIa({ GEMINI_API_KEY: '  ', ANTHROPIC_API_KEY: '' }).modo).toBeNull()
  })

  it('AI_PIPELINE=dupla sem as duas chaves degrada e avisa', () => {
    const c = configuracaoDeIa({ AI_PIPELINE: 'dupla', GEMINI_API_KEY: 'g' })
    expect(c).toMatchObject({ modo: 'gemini', revisor: null })
    expect(c.avisos.join(' ')).toMatch(/ANTHROPIC_API_KEY/)
  })

  it('AI_PIPELINE força um modo mesmo com as duas chaves', () => {
    expect(configuracaoDeIa({ ...ambas, AI_PIPELINE: 'claude' })).toMatchObject({ modo: 'claude', revisor: null })
    expect(configuracaoDeIa({ ...ambas, AI_PIPELINE: 'gemini' })).toMatchObject({ modo: 'gemini', revisor: null })
  })

  it('AI_PIPELINE pedindo um provedor sem chave: não configurada', () => {
    expect(configuracaoDeIa({ AI_PIPELINE: 'claude', GEMINI_API_KEY: 'g' }).modo).toBeNull()
  })

  it('valor inválido de AI_PIPELINE é avisado e ignorado', () => {
    const c = configuracaoDeIa({ ...ambas, AI_PIPELINE: 'tripla' })
    expect(c.modo).toBe('dupla')
    expect(c.avisos.join(' ')).toMatch(/inválido/)
  })
})

const EDITAL = [
  { nome: 'Edital.pdf', tipo: 'texto' as const, texto: '[[PÁGINA 1]]\nA licitante deverá apresentar atestado de capacidade técnica compatível com o objeto.\n\n[[PÁGINA 2]]\nA garantia de proposta será de 1% do valor estimado da contratação.' },
]

const analista = (resultado = analiseBase()): EditalAnalyzer => async () => ({ resultado, uso: usoGemini })

describe('executarPipeline — com revisão', () => {
  it('a versão final é a do revisor; o rascunho do analista fica guardado; as alterações vêm da comparação', async () => {
    const rascunho = analiseBase({ garantiaProposta: 'não exigida' })
    const final = analiseBase({ garantiaProposta: 'A garantia de proposta será de 1% do valor estimado da contratação' })
    const revisor: EditalReviewer = async () => ({
      resultado: final,
      relatorio: { veredito: 'corrigida', resumo: 'Corrigi a garantia.', justificativas: [{ campo: 'garantiaProposta', motivo: 'Está na página 2.' }] },
      uso: usoClaude,
    })

    const r = await executarPipeline({ objeto: 'x', documentos: EDITAL, analista: analista(rascunho), revisor })

    expect(r.pipeline).toBe('dupla')
    expect(r.resultado.garantiaProposta).toMatch(/1%/)
    expect(r.rascunho?.garantiaProposta).toBe('não exigida')
    expect(r.revisao).toMatchObject({ status: 'OK', veredito: 'corrigida', totalDeAlteracoes: 1 })
    expect(r.revisao.alteracoes[0]).toMatchObject({ campo: 'garantiaProposta', motivo: 'Está na página 2.' })
    expect(r.revisao.analista).toEqual({ provider: 'gemini', model: 'gemini-x' })
    expect(r.revisao.revisor).toEqual({ provider: 'claude', model: 'claude-opus-5-5' })
  })

  it('registra o consumo das DUAS etapas', async () => {
    const revisor: EditalReviewer = async () => ({ resultado: analiseBase(), relatorio: { veredito: 'aprovada', resumo: 'ok', justificativas: [] }, uso: usoClaude })
    const r = await executarPipeline({ objeto: 'x', documentos: EDITAL, analista: analista(), revisor })
    expect(r.usos.map((u) => [u.etapa, u.uso.provider, u.status])).toEqual([
      ['analise', 'gemini', 'OK'],
      ['revisao', 'claude', 'OK'],
    ])
  })

  it('aprovada sem mudanças: zero alterações', async () => {
    const revisor: EditalReviewer = async (_o, _d, rascunho) => ({ resultado: rascunho, relatorio: { veredito: 'aprovada', resumo: 'Nada a corrigir.', justificativas: [] }, uso: usoClaude })
    const r = await executarPipeline({ objeto: 'x', documentos: EDITAL, analista: analista(), revisor })
    expect(r.revisao.veredito).toBe('aprovada')
    expect(r.revisao.alteracoes).toEqual([])
  })

  it('o revisor recebe exatamente o rascunho do analista', async () => {
    let recebido: unknown
    const rascunho = analiseBase({ resumo: 'resumo do analista' })
    const revisor: EditalReviewer = async (_o, _d, r) => {
      recebido = r
      return { resultado: r, relatorio: { veredito: 'aprovada', resumo: '', justificativas: [] }, uso: usoClaude }
    }
    await executarPipeline({ objeto: 'x', documentos: EDITAL, analista: analista(rascunho), revisor })
    expect(recebido).toEqual(rascunho)
  })

  it('a conferência de literalidade roda sobre a versão FINAL: exigência inventada pelo revisor é sinalizada', async () => {
    const final = analiseBase({
      matrizExigencias: [
        exigencia('A licitante deverá apresentar atestado de capacidade técnica compatível com o objeto'),
        exigencia('A licitante deverá possuir frota própria de dez veículos refrigerados'),
      ],
    })
    const revisor: EditalReviewer = async () => ({ resultado: final, relatorio: { veredito: 'corrigida', resumo: '', justificativas: [] }, uso: usoClaude })
    const r = await executarPipeline({ objeto: 'x', documentos: EDITAL, analista: analista(), revisor })
    expect(r.resultado.matrizExigencias.map((e) => e.verificacao.status)).toEqual(['confirmado', 'nao-localizado'])
    expect(r.resultado.matrizExigencias[0].verificacao.paginaConfirmada).toBe('1')
  })
})

describe('executarPipeline — quando a revisão não acontece ou falha', () => {
  it('revisor falha com erro comum: vale o analista, marcado como não revisado, e o detalhe técnico fica separado', async () => {
    const revisor: EditalReviewer = async () => {
      throw new Error('429 rate limit host=interno.exemplo request_id=abc')
    }
    const r = await executarPipeline({ objeto: 'x', documentos: EDITAL, analista: analista(analiseBase({ resumo: 'do analista' })), revisor })
    expect(r.resultado.resumo).toBe('do analista')
    expect(r.rascunho).toBeNull()
    expect(r.revisao.status).toBe('FALHOU')
    expect(r.revisao.motivo).toMatch(/NÃO foi revisada/)
    expect(r.revisao.motivo).not.toMatch(/interno\.exemplo|request_id/) // nada técnico para o usuário
    expect(r.revisao.detalheTecnico).toMatch(/rate limit/)
    expect(r.usos).toHaveLength(1)
  })

  it('revisor falha DEPOIS de gastar tokens (recusa/corte): o consumo da revisão é registrado como ERRO', async () => {
    const revisor: EditalReviewer = async () => {
      throw new ErroComUso(new AnalysisRefusedError(), usoClaude)
    }
    const r = await executarPipeline({ objeto: 'x', documentos: EDITAL, analista: analista(), revisor })
    expect(r.revisao.status).toBe('FALHOU')
    expect(r.revisao.revisor).toEqual({ provider: 'claude', model: 'claude-opus-5-5' })
    expect(r.usos.map((u) => [u.etapa, u.status])).toEqual([
      ['analise', 'OK'],
      ['revisao', 'ERRO'],
    ])
  })

  it('sem revisor: análise simples, dita como não revisada', async () => {
    const r = await executarPipeline({ objeto: 'x', documentos: EDITAL, analista: analista(), revisor: null })
    expect(r.pipeline).toBe('gemini')
    expect(r.revisao.status).toBe('NAO_EXECUTADA')
    expect(r.revisao.revisor).toBeNull()
    expect(r.usos).toHaveLength(1)
  })

  it('analista falha: a análise inteira falha (o erro sobe) e o revisor nem é chamado', async () => {
    let revisorChamado = false
    const analistaQuebrado: EditalAnalyzer = async () => {
      throw new Error('falha do analista')
    }
    const revisor: EditalReviewer = async () => {
      revisorChamado = true
      throw new Error('não deveria')
    }
    await expect(executarPipeline({ objeto: 'x', documentos: EDITAL, analista: analistaQuebrado, revisor })).rejects.toThrow('falha do analista')
    expect(revisorChamado).toBe(false)
  })

  it('documento escaneado: a matriz fica "não verificável", não "não localizada"', async () => {
    const r = await executarPipeline({
      objeto: 'x',
      documentos: [{ nome: 'Scan.pdf', tipo: 'pdf', data: Buffer.from('%PDF') }],
      analista: analista(),
      revisor: null,
    })
    expect(r.resultado.matrizExigencias[0].verificacao.status).toBe('nao-verificavel')
  })
})

describe('custo estimado por provedor', () => {
  const env = {
    AI_PRICE_GEMINI_INPUT_PER_MTOK: '0.5',
    AI_PRICE_GEMINI_OUTPUT_PER_MTOK: '2',
    AI_PRICE_CLAUDE_INPUT_PER_MTOK: '4',
    AI_PRICE_CLAUDE_OUTPUT_PER_MTOK: '20',
  }

  it('cada provedor usa o seu preço', () => {
    expect(estimarCustoUsd(1_000_000, 1_000_000, env, 'gemini')).toBe(2.5)
    expect(estimarCustoUsd(1_000_000, 1_000_000, env, 'claude')).toBe(24)
  })

  it('sem preço próprio, cai no par genérico; sem nenhum, não estima', () => {
    expect(estimarCustoUsd(1_000_000, 0, { AI_PRICE_INPUT_PER_MTOK: '3', AI_PRICE_OUTPUT_PER_MTOK: '9' }, 'claude')).toBe(3)
    expect(estimarCustoUsd(1_000_000, 1_000_000, {}, 'claude')).toBeNull()
  })

  it('preço pela metade (só entrada) ou inválido não estima, em vez de chutar', () => {
    expect(estimarCustoUsd(1, 1, { AI_PRICE_CLAUDE_INPUT_PER_MTOK: '4' }, 'claude')).toBeNull()
    expect(estimarCustoUsd(1, 1, { AI_PRICE_CLAUDE_INPUT_PER_MTOK: 'abc', AI_PRICE_CLAUDE_OUTPUT_PER_MTOK: '2' }, 'claude')).toBeNull()
  })
})
