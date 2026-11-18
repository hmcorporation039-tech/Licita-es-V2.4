import { describe, expect, it } from 'vitest'
import {
  ehAvisoDeFaseFinal,
  faseFinalPeloChat,
  INTERVALO_FASE_FINAL_MS,
  INTERVALO_NORMAL_MS,
  limparQuemEstaNaFrente,
  proximoAviso,
  type InstrucaoParaVigia,
} from '../web/src/lib/vigiaDoLance'

const dar = (valor: number, alvo = 'global'): InstrucaoParaVigia => ({ alvo, rotulo: alvo === 'global' ? '' : `Item ${alvo}`, acao: 'dar', valor, motivo: null, texto: `Dar lance de ${valor}` })
const naFrente = (alvo = 'global'): InstrucaoParaVigia => ({ alvo, rotulo: '', acao: 'aguardar', valor: null, motivo: 'Você já está na frente; não precisa cobrir.', texto: 'Você já está na frente; não precisa cobrir.' })
const travar = (alvo = 'global'): InstrucaoParaVigia => ({ alvo, rotulo: '', acao: 'travar', valor: null, motivo: 'O melhor lance já está no seu piso ou abaixo; cobrir daria prejuízo.', texto: 'Travar.' })

describe('vigia do lance', () => {
  it('avisa na hora quando cobrem o lance, com a sugestão', () => {
    const a = proximoAviso({ instrucoes: [dar(1000)], ultimos: {}, agora: 0, faseFinal: false })
    expect(a).toMatchObject({ tipo: 'cobriram', valor: 1000 })
    expect(a?.fala).toContain('Sugiro')
  })

  it('não repete antes de 1 minuto; repete depois, enquanto você continua atrás', () => {
    const ultimos = { global: { chave: 'dar:1000', em: 0 } }
    expect(proximoAviso({ instrucoes: [dar(1000)], ultimos, agora: INTERVALO_NORMAL_MS - 1, faseFinal: false })).toBeNull()
    expect(proximoAviso({ instrucoes: [dar(1000)], ultimos, agora: INTERVALO_NORMAL_MS, faseFinal: false })).toMatchObject({ tipo: 'lembrete' })
  })

  it('na fase final repete a cada 15 segundos', () => {
    const ultimos = { global: { chave: 'dar:1000', em: 0 } }
    const a = proximoAviso({ instrucoes: [dar(1000)], ultimos, agora: INTERVALO_FASE_FINAL_MS, faseFinal: true })
    expect(a).toMatchObject({ tipo: 'lembrete' })
    expect(a?.titulo).toContain('Fase final')
  })

  it('sugestão nova (cobriram de novo) avisa na hora, sem esperar o minuto', () => {
    const ultimos = { global: { chave: 'dar:1000', em: 0 } }
    expect(proximoAviso({ instrucoes: [dar(950)], ultimos, agora: 1000, faseFinal: false })).toMatchObject({ tipo: 'cobriram', valor: 950 })
  })

  it('quem está na frente não recebe aviso e, se cobrirem de novo, avisa na hora', () => {
    expect(proximoAviso({ instrucoes: [naFrente()], ultimos: {}, agora: 0, faseFinal: false })).toBeNull()
    const limpos = limparQuemEstaNaFrente([naFrente()], { global: { chave: 'dar:1000', em: 0 } })
    expect(limpos.global).toBeUndefined()
    expect(proximoAviso({ instrucoes: [dar(1000)], ultimos: limpos, agora: 10, faseFinal: false })).toMatchObject({ tipo: 'cobriram' })
  })

  it('no piso avisa uma vez para parar, sem sugerir valor', () => {
    const a = proximoAviso({ instrucoes: [travar()], ultimos: {}, agora: 0, faseFinal: false })
    expect(a).toMatchObject({ tipo: 'travou', valor: null })
    expect(proximoAviso({ instrucoes: [travar()], ultimos: { global: { chave: a!.chave, em: 0 } }, agora: 10 * INTERVALO_NORMAL_MS, faseFinal: false })).toBeNull()
  })

  it('vários itens: diz qual item foi coberto', () => {
    const a = proximoAviso({ instrucoes: [naFrente('1'), dar(500, '2')], ultimos: {}, agora: 0, faseFinal: false })
    expect(a?.titulo).toContain('Item 2')
  })

  it('reconhece no chat o aviso de que a etapa de lances vai fechar', () => {
    expect(ehAvisoDeFaseFinal('Aviso de iminência de encerramento da etapa de lances')).toBe(true)
    expect(ehAvisoDeFaseFinal('A etapa será encerrada em tempo aleatório de até 10 minutos')).toBe(true)
    expect(ehAvisoDeFaseFinal('Bom dia a todos, vamos iniciar a sessão')).toBe(false)
    const agora = Date.parse('2026-11-18T15:00:00Z')
    expect(faseFinalPeloChat([{ texto: 'Iminência de encerramento', createdAt: '2026-11-18T14:55:00Z' }], agora)).toBe(true)
    // Aviso de mais de 20 minutos atrás não vale mais.
    expect(faseFinalPeloChat([{ texto: 'Iminência de encerramento', createdAt: '2026-11-18T14:30:00Z' }], agora)).toBe(false)
  })
})
