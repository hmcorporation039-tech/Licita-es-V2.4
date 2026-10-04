import { describe, expect, it } from 'vitest'
import { diagnosticarChave, diagnosticoDoAmbienteDeIa, pareceErroDeChave, textoDoDiagnostico } from '../src/lib/diagnosticoDeChave'
import { executarPipeline } from '../src/services/analiseEmDupla'
import { ErroComUso } from '../src/services/llm/types'
import { analiseBase } from './helpers/analises'

const CHAVE_BOA = 'sk-ant-api03-' + 'a'.repeat(80)
const CHAVE_SECRETA = 'sk-ant-api03-SEGREDO' + 'z'.repeat(60)

describe('diagnosticarChave', () => {
  it('chave bem formada: sem problemas', () => {
    expect(diagnosticarChave(CHAVE_BOA, 'sk-ant-', 40)).toMatchObject({ definida: true, prefixoEsperadoOk: true, problemas: [] })
  })

  it('ausente ou vazia', () => {
    expect(diagnosticarChave(undefined, 'sk-ant-', 40).problemas[0]).toMatch(/ausente/)
    expect(diagnosticarChave('', 'sk-ant-', 40).definida).toBe(false)
  })

  it('espaço ou quebra de linha no fim (o erro mais comum ao colar)', () => {
    expect(diagnosticarChave(CHAVE_BOA + '\n', 'sk-ant-', 40).problemas.join()).toMatch(/começo ou no fim/)
    expect(diagnosticarChave(' ' + CHAVE_BOA, 'sk-ant-', 40).problemas.join()).toMatch(/começo ou no fim/)
  })

  it('valor entre aspas', () => {
    expect(diagnosticarChave(`"${CHAVE_BOA}"`, 'sk-ant-', 40).problemas.join()).toMatch(/aspas/)
  })

  it('espaço no meio (colou duas vezes ou quebrou a linha)', () => {
    expect(diagnosticarChave('sk-ant-api03-abc def' + 'x'.repeat(50), 'sk-ant-', 40).problemas.join()).toMatch(/no meio/)
  })

  it('prefixo errado (valor de exemplo ou chave de outro serviço)', () => {
    const d = diagnosticarChave('AIzaSyAlgumaChaveDoGemini' + 'x'.repeat(20), 'sk-ant-', 40)
    expect(d.prefixoEsperadoOk).toBe(false)
    expect(d.problemas.join()).toMatch(/não começa com "sk-ant-"/)
  })

  it('curta demais (cortada ao colar)', () => {
    expect(diagnosticarChave('sk-ant-api03-curta', 'sk-ant-', 40).problemas.join()).toMatch(/curto demais/)
  })

  it('NUNCA devolve a chave nem pedaço dela', () => {
    const d = diagnosticarChave(CHAVE_SECRETA, 'sk-ant-', 40)
    expect(JSON.stringify(d)).not.toContain('SEGREDO')
    expect(JSON.stringify(d)).not.toContain('zzzz')
    const t = textoDoDiagnostico({ ANTHROPIC_API_KEY: CHAVE_SECRETA, GEMINI_API_KEY: 'AIza' + 'q'.repeat(35) })
    expect(t).not.toContain('SEGREDO')
    expect(t).not.toContain('zzzz')
    expect(t).not.toContain('qqqq')
    expect(t).toMatch(/ANTHROPIC_API_KEY: \d+ caracteres, formato aparentemente correto/)
  })
})

describe('diagnóstico do ambiente', () => {
  it('avisa de ANTHROPIC_BASE_URL e ANTHROPIC_AUTH_TOKEN, que mudam para onde a chamada vai e como se autentica', () => {
    const d = diagnosticoDoAmbienteDeIa({ ANTHROPIC_API_KEY: CHAVE_BOA, ANTHROPIC_BASE_URL: 'https://proxy.exemplo', ANTHROPIC_AUTH_TOKEN: 'x' })
    expect(d).toMatchObject({ claudeBaseUrlDefinida: true, claudeAuthTokenDefinido: true })
    const t = textoDoDiagnostico({ ANTHROPIC_API_KEY: CHAVE_BOA, ANTHROPIC_BASE_URL: 'https://proxy.exemplo' })
    expect(t).toMatch(/ANTHROPIC_BASE_URL está definida/)
    expect(t).not.toContain('proxy.exemplo')
  })
})

describe('pareceErroDeChave', () => {
  it('reconhece erros de autenticação e ignora o resto', () => {
    expect(pareceErroDeChave('401 {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."}}')).toBe(true)
    expect(pareceErroDeChave('403 permission_error')).toBe(true)
    expect(pareceErroDeChave('429 rate_limit_error')).toBe(false)
    expect(pareceErroDeChave('A resposta do revisor foi cortada antes de terminar.')).toBe(false)
  })
})

describe('no pipeline: revisão que falha por chave inválida', () => {
  const usoGemini = { provider: 'gemini', model: 'g', inputTokens: 1, outputTokens: 1 }
  const analista = async () => ({ resultado: analiseBase(), uso: usoGemini })

  it('o detalhe técnico traz o diagnóstico do formato da chave, e o motivo público continua genérico', async () => {
    const revisor = async () => {
      throw new Error('401 {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."}}')
    }
    const r = await executarPipeline({
      objeto: 'x',
      documentos: [{ nome: 'E.pdf', tipo: 'texto', texto: 'texto do edital' }],
      analista,
      revisor,
      env: { ANTHROPIC_API_KEY: CHAVE_BOA + '\n', GEMINI_API_KEY: 'AIza' + 'k'.repeat(35) },
    })
    expect(r.revisao.status).toBe('FALHOU')
    expect(r.revisao.detalheTecnico).toMatch(/API key is invalid/)
    expect(r.revisao.detalheTecnico).toMatch(/Diagnóstico das chaves/)
    expect(r.revisao.detalheTecnico).toMatch(/espaço ou quebra de linha no começo ou no fim/)
    expect(r.revisao.detalheTecnico).not.toContain('aaaaaaaa') // nunca a chave
    expect(r.revisao.motivo).not.toMatch(/401|chave|key/i)
  })

  it('erro que não é de chave não leva diagnóstico', async () => {
    const revisor = async () => {
      throw new ErroComUso(new Error('A resposta do revisor foi cortada antes de terminar.'), { provider: 'claude', model: 'm', inputTokens: 1, outputTokens: 1 })
    }
    const r = await executarPipeline({ objeto: 'x', documentos: [], analista, revisor, env: {} })
    expect(r.revisao.detalheTecnico).not.toMatch(/Diagnóstico/)
  })

  it('toda revisão registra QUANDO foi tentada (para distinguir análise nova de antiga)', async () => {
    const t = Date.parse('2026-10-04T15:00:00Z')
    const ok = await executarPipeline({ objeto: 'x', documentos: [], analista, revisor: null, agora: () => t })
    expect(ok.revisao.em).toBe('2026-10-04T15:00:00.000Z')
    const falha = await executarPipeline({ objeto: 'x', documentos: [], analista, revisor: async () => { throw new Error('x') }, agora: () => t })
    expect(falha.revisao.em).toBe('2026-10-04T15:00:00.000Z')
  })
})
