import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  artigosCitadosNaPergunta,
  artigosDaLei,
  artigosRelacionados,
  conferirCitacoesDaLei,
  decidirChamado,
  indexarLei,
  montarConversa,
  textoDosDadosDaConta,
  validarRespostaDoAtendimento,
  validarRespostaDoEspecialista,
} from '../src/lib/atendimento'

const LEI = artigosDaLei(readFileSync(resolve(__dirname, '..', 'docs', 'suporte', 'lei-14133.txt'), 'utf8'))
const INDICE = indexarLei(LEI)
const artigo = (n: string) => LEI.find((a) => a.numero === n)!

describe('texto da Lei 14.133 guardado no sistema', () => {
  it('tem todos os artigos de 1 a 194, sem trecho revogado de vigência encerrada', () => {
    const numeros = new Set(LEI.map((a) => a.numero))
    for (let n = 1; n <= 194; n++) expect(numeros.has(String(n))).toBe(true)
    expect(numeros.has('44-A')).toBe(true)
    expect(LEI.some((a) => /encerrada encerrada/.test(a.texto))).toBe(false)
    expect(artigo('165').texto).toContain('3 (três) dias úteis')
  })

  it('acha os artigos certos para perguntas comuns', () => {
    const numeros = (p: string) => artigosRelacionados(p, INDICE).map((a) => a.numero)
    expect(numeros('Qual o prazo para entrar com recurso?')).toContain('165')
    expect(numeros('Até que valor a licitação é dispensável?')).toContain('75')
    expect(numeros('Qual o prazo para impugnar o edital?')).toContain('164')
    expect(numeros('o que diz o art. 62 sobre habilitação?')[0]).toBe('62')
  })

  it('reconhece artigo citado na pergunta', () => {
    expect(artigosCitadosNaPergunta('e o art. 75 e o artigo 44-a?')).toEqual(['75', '44-A'])
  })
})

describe('conferência das citações da lei', () => {
  const artigos = [artigo('165'), artigo('164')]

  it('confirma trecho literal e corrige o artigo que a IA trocou', () => {
    const r = conferirCitacoesDaLei(
      { resposta: 'Cabe recurso em 3 dias úteis.', encontrado: true, citacoes: [{ artigo: '164', trecho: 'recurso, no prazo de 3 (três) dias úteis, contado da data de intimação ou de lavratura da ata' }] },
      artigos
    )
    expect(r.semComprovacao).toBe(false)
    expect(r.citacoes).toEqual([{ artigo: '165', trecho: 'recurso, no prazo de 3 (três) dias úteis, contado da data de intimação ou de lavratura da ata', conferencia: 'confirmado' }])
  })

  it('descarta artigo inventado e avisa que ficou sem comprovação', () => {
    const r = conferirCitacoesDaLei({ resposta: 'O prazo é de 10 dias.', encontrado: true, citacoes: [{ artigo: '165', trecho: 'o prazo para recurso será de 10 (dez) dias corridos contados da publicação' }] }, artigos)
    expect(r.citacoes).toEqual([])
    expect(r.semComprovacao).toBe(true)
  })
})

describe('respostas da IA', () => {
  it('valida o atendimento e cai em OUTRO quando o tipo vem errado', () => {
    const r = validarRespostaDoAtendimento({ intencao: 'ERRO', resposta: ' Vou verificar. ', sabeResponder: true, abrirChamado: true, tipoDoChamado: 'XYZ', assuntoDoChamado: 'Análise travada' })
    expect(r).toMatchObject({ resposta: 'Vou verificar.', tipoDoChamado: 'OUTRO' })
    expect(() => validarRespostaDoAtendimento({ intencao: 'QUALQUER', resposta: 'oi', sabeResponder: true, abrirChamado: false })).toThrow()
  })

  it('valida o especialista e corta citações demais', () => {
    const c = { artigo: '75', trecho: 'abc' }
    expect(validarRespostaDoEspecialista({ resposta: 'ok', encontrado: true, citacoes: [c, c, c, c, c, c] }).citacoes).toHaveLength(4)
    expect(() => validarRespostaDoEspecialista({ resposta: '', encontrado: true, citacoes: [] })).toThrow()
  })

  it('abre chamado para erro, cobrança e dúvida que o atendimento não sabe', () => {
    const base = { resposta: 'x', sabeResponder: true, abrirChamado: false, tipoDoChamado: 'DUVIDA' as const, assuntoDoChamado: '' }
    expect(decidirChamado({ ...base, intencao: 'ERRO' })).toEqual({ abrir: true, tipo: 'ERRO' })
    expect(decidirChamado({ ...base, intencao: 'COBRANCA' })).toEqual({ abrir: true, tipo: 'COBRANCA' })
    expect(decidirChamado({ ...base, intencao: 'SISTEMA', sabeResponder: false }).abrir).toBe(true)
    expect(decidirChamado({ ...base, intencao: 'SISTEMA' }).abrir).toBe(false)
    expect(decidirChamado({ ...base, intencao: 'LICITACAO', abrirChamado: true }).abrir).toBe(false)
    expect(decidirChamado({ ...base, intencao: 'FORA_DO_ASSUNTO' }).abrir).toBe(false)
  })
})

describe('contexto enviado ao atendimento', () => {
  it('leva os limites e o uso da conta, com ilimitado escrito por extenso', () => {
    const texto = textoDosDadosDaConta({
      plano: 'Essencial',
      emTeste: false,
      acessoAte: null,
      papel: 'OWNER',
      limites: { itensMonitorados: 30, usuarios: 1, analisesIaMes: 35, perguntasAoEditalMes: null, mensagensDeSuporteMes: 100 },
      uso: { itensMonitorados: 4, usuarios: 1, analisesIaMes: 2, perguntasAoEditalMes: 0, mensagensDeSuporteMes: 3 },
      chamadosAbertos: [],
      tela: '/items',
    })
    expect(texto).toContain('Itens monitorados: 4 usados de 30')
    expect(texto).toContain('Perguntas ao edital no mês: 0 usados de ilimitado')
    expect(texto).toContain('dono da empresa')
  })

  it('monta a conversa com o histórico antes da mensagem nova', () => {
    expect(montarConversa([{ papel: 'USUARIO', texto: 'oi' }, { papel: 'ATENDIMENTO', texto: 'olá' }], 'e agora?')).toBe('Conversa até aqui:\nCliente: oi\nAtendimento: olá\n\nMensagem nova do cliente: e agora?')
  })
})
