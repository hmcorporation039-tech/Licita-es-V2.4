import { describe, expect, it } from 'vitest'
import { arquivosDaPilha, conferirArquivos, precisaDiagnosticar, validarDiagnostico, DIAGNOSTICO_TRAVADO_MS } from '../src/lib/diagnostico'

const EXISTENTES = new Set(['src/api/routes/suporte.ts', 'src/services/chamados.ts', 'web/src/app/(app)/suporte/page.tsx'])

describe('diagnóstico técnico', () => {
  it('só aceita arquivos que existem no projeto', () => {
    expect(conferirArquivos(['./src/api/routes/suporte.ts', String.raw`src\services\chamados.ts`, 'src/services/inventado.ts', 'src/api/routes/suporte.ts'], EXISTENTES)).toEqual({
      confirmados: ['src/api/routes/suporte.ts', 'src/services/chamados.ts'],
      descartados: ['src/services/inventado.ts'],
    })
  })

  it('acha o arquivo-fonte a partir da pilha compilada', () => {
    const pilha = 'at abrirChamado (/app/dist/services/chamados.js:40:11)\n    at /app/dist/api/routes/suporte.js:95:3\n    at node:internal/process'
    expect(arquivosDaPilha(pilha, EXISTENTES)).toEqual(['src/services/chamados.ts', 'src/api/routes/suporte.ts'])
    expect(arquivosDaPilha(null, EXISTENTES)).toEqual([])
  })

  it('valida o formato e cai em confiança baixa quando vem algo estranho', () => {
    const d = validarDiagnostico({ resumo: ' x ', passosParaReproduzir: ['a', 2, ''], causaProvavel: 'c', confianca: 'total', arquivosEnvolvidos: [], correcaoSugerida: 'y' })
    expect(d).toMatchObject({ resumo: 'x', passosParaReproduzir: ['a'], confianca: 'baixa', informacoesQueFaltam: '' })
    expect(() => validarDiagnostico({ resumo: '', causaProvavel: 'c', correcaoSugerida: 'y' })).toThrow()
  })

  it('diagnostica chamado de erro uma vez e refaz se travou', () => {
    const agora = new Date('2026-10-21T12:00:00Z')
    expect(precisaDiagnosticar({ tipo: 'ERRO', diagnosticoStatus: null, diagnosticoEm: null }, agora)).toBe(true)
    expect(precisaDiagnosticar({ tipo: 'DUVIDA', diagnosticoStatus: null, diagnosticoEm: null }, agora)).toBe(false)
    expect(precisaDiagnosticar({ tipo: 'ERRO', diagnosticoStatus: 'DIAGNOSTICANDO', diagnosticoEm: new Date(agora.getTime() - 60_000) }, agora)).toBe(false)
    expect(precisaDiagnosticar({ tipo: 'ERRO', diagnosticoStatus: 'DIAGNOSTICANDO', diagnosticoEm: new Date(agora.getTime() - DIAGNOSTICO_TRAVADO_MS) }, agora)).toBe(true)
  })
})
