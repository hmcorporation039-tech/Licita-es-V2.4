import { describe, expect, it } from 'vitest'
import { REVISAO_MAX_EM_ANDAMENTO_MS, analiseParaResposta } from '../src/lib/analiseParaResposta'
import { executarPipeline } from '../src/services/analiseEmDupla'
import { esforcoDoRevisor } from '../src/services/llm/claudeReviewer'
import { concorrenciaDaAnalise } from '../src/workers/analise'
import type { EditalAnalyzer } from '../src/services/llm/types'
import type { EditalReviewer } from '../src/services/llm/revisao'
import { analiseBase } from './helpers/analises'

const AGORA = Date.parse('2026-10-04T15:00:00Z')
const iso = (msAtras: number) => new Date(AGORA - msAtras).toISOString()

describe('analiseParaResposta', () => {
  const linha = (revisao: unknown) => ({ id: 'a', rascunho: { garantiaProposta: 'x' }, revisao })

  it('usuário comum não recebe o rascunho nem o detalhe técnico', () => {
    const r = analiseParaResposta(linha({ status: 'FALHOU', motivo: 'm', detalheTecnico: 'segredo interno' }), false, AGORA)
    expect(r).not.toHaveProperty('rascunho')
    expect(JSON.stringify(r)).not.toContain('segredo interno')
    expect((r.revisao as { status: string }).status).toBe('FALHOU')
  })

  it('o admin recebe tudo', () => {
    const r = analiseParaResposta(linha({ status: 'FALHOU', detalheTecnico: 'detalhe' }), true, AGORA)
    expect(r).toHaveProperty('rascunho')
    expect((r.revisao as { detalheTecnico: string }).detalheTecnico).toBe('detalhe')
  })

  it('revisão em andamento recente continua em andamento', () => {
    const r = analiseParaResposta(linha({ status: 'EM_ANDAMENTO', em: iso(3 * 60_000) }), false, AGORA)
    expect((r.revisao as { status: string }).status).toBe('EM_ANDAMENTO')
  })

  it('em andamento por tempo demais vira NÃO revisada, em vez de ficar girando para sempre', () => {
    const r = analiseParaResposta(linha({ status: 'EM_ANDAMENTO', em: iso(REVISAO_MAX_EM_ANDAMENTO_MS + 60_000) }), false, AGORA)
    const rev = r.revisao as { status: string; motivo: string }
    expect(rev.status).toBe('FALHOU')
    expect(rev.motivo).toMatch(/interrompida/)
    expect(rev.motivo).toMatch(/NÃO foi revisada/)
  })

  it('"em andamento" sem data válida também é tratado como interrompido', () => {
    expect((analiseParaResposta(linha({ status: 'EM_ANDAMENTO' }), false, AGORA).revisao as { status: string }).status).toBe('FALHOU')
  })

  it('análise sem revisão (campo ausente) não quebra', () => {
    expect(analiseParaResposta({ id: 'a', rascunho: null, revisao: null }, false, AGORA).revisao).toBeNull()
    expect(analiseParaResposta({ id: 'a' } as { rascunho?: unknown; revisao?: unknown }, false, AGORA)).toBeTruthy()
  })

  it('o admin também vê a revisão presa como interrompida (e com o detalhe do porquê)', () => {
    const r = analiseParaResposta(linha({ status: 'EM_ANDAMENTO', em: iso(40 * 60_000) }), true, AGORA)
    expect((r.revisao as { status: string }).status).toBe('FALHOU')
    expect((r.revisao as { detalheTecnico: string }).detalheTecnico).toMatch(/sem concluir/)
  })
})

describe('executarPipeline: prévia antes da revisão', () => {
  const uso = { provider: 'gemini', model: 'g', inputTokens: 1, outputTokens: 1 }
  const analista: EditalAnalyzer = async () => ({ resultado: analiseBase({ resumo: 'do analista' }), uso })
  const docs = [{ nome: 'E.pdf', tipo: 'texto' as const, texto: 'A licitante deverá apresentar atestado de capacidade técnica compatível com o objeto.' }]
  const usoClaude = { provider: 'claude', model: 'm', inputTokens: 1, outputTokens: 1 }

  it('entrega a análise do analista ANTES de o revisor começar, marcada como em andamento', async () => {
    const ordem: string[] = []
    const revisor: EditalReviewer = async (_o, _d, r) => {
      ordem.push('revisor')
      return { resultado: r, relatorio: { veredito: 'aprovada', resumo: '', justificativas: [] }, uso: usoClaude }
    }
    let previa: unknown
    await executarPipeline({
      objeto: 'x',
      documentos: docs,
      analista,
      revisor,
      aoConcluirAnalista: async (p) => {
        ordem.push('previa')
        previa = p
      },
    })
    expect(ordem).toEqual(['previa', 'revisor'])
    const p = previa as {
      resultado: { resumo: string; matrizExigencias: { verificacao: { status: string } }[] }
      revisao: { status: string; motivo: string }
      usoDoAnalista: { etapa: string }
    }
    expect(p.resultado.resumo).toBe('do analista')
    expect(p.revisao.status).toBe('EM_ANDAMENTO')
    expect(p.revisao.motivo).toMatch(/preliminar/)
    expect(p.usoDoAnalista.etapa).toBe('analise')
    expect(p.resultado.matrizExigencias[0].verificacao.status).toBe('confirmado') // a conferência já vem na prévia
  })

  it('falha ao gravar a prévia não impede a revisão', async () => {
    const revisor: EditalReviewer = async (_o, _d, r) => ({
      resultado: r,
      relatorio: { veredito: 'aprovada', resumo: 'ok', justificativas: [] },
      uso: usoClaude,
    })
    const r = await executarPipeline({
      objeto: 'x',
      documentos: docs,
      analista,
      revisor,
      aoConcluirAnalista: async () => {
        throw new Error('banco caiu')
      },
    })
    expect(r.revisao.status).toBe('OK')
  })

  it('sem revisor não há prévia (não há o que esperar)', async () => {
    let chamou = false
    await executarPipeline({
      objeto: 'x',
      documentos: docs,
      analista,
      revisor: null,
      aoConcluirAnalista: async () => {
        chamou = true
      },
    })
    expect(chamou).toBe(false)
  })

  it('se o analista falha, a prévia não é chamada', async () => {
    let chamou = false
    await expect(
      executarPipeline({
        objeto: 'x',
        documentos: docs,
        analista: async () => {
          throw new Error('falhou')
        },
        revisor: async () => {
          throw new Error('nunca')
        },
        aoConcluirAnalista: async () => {
          chamou = true
        },
      })
    ).rejects.toThrow('falhou')
    expect(chamou).toBe(false)
  })
})

describe('alavancas de tempo', () => {
  it('esforço do revisor: padrão high; aceita low a max; valor inválido volta ao padrão', () => {
    expect(esforcoDoRevisor({})).toBe('high')
    expect(esforcoDoRevisor({ CLAUDE_REVIEW_EFFORT: 'medium' })).toBe('medium')
    expect(esforcoDoRevisor({ CLAUDE_REVIEW_EFFORT: ' MEDIUM ' })).toBe('medium')
    expect(esforcoDoRevisor({ CLAUDE_REVIEW_EFFORT: 'xhigh' })).toBe('xhigh')
    expect(esforcoDoRevisor({ CLAUDE_REVIEW_EFFORT: 'rapido' })).toBe('high')
  })

  it('concorrência da fila de análise: padrão 2, limitada de 1 a 4', () => {
    expect(concorrenciaDaAnalise({})).toBe(2)
    expect(concorrenciaDaAnalise({ ANALISE_CONCURRENCY: '1' })).toBe(1)
    expect(concorrenciaDaAnalise({ ANALISE_CONCURRENCY: '4' })).toBe(4)
    expect(concorrenciaDaAnalise({ ANALISE_CONCURRENCY: '9' })).toBe(2)
    expect(concorrenciaDaAnalise({ ANALISE_CONCURRENCY: 'abc' })).toBe(2)
  })
})
