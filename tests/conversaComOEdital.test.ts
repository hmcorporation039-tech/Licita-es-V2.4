import { describe, expect, it } from 'vitest'
import {
  PREPARO_TRAVADO_MS,
  ESPERA_PARA_REPREPARAR_MS,
  conferirResposta,
  montarPergunta,
  normalizarPergunta,
  paginasDoTexto,
  precisaPreparar,
  textoDosDocumentos,
  validarRespostaDaIa,
  type TextoDeDocumento,
} from '../src/lib/conversaComOEdital'

const EDITAL: TextoDeDocumento = {
  nome: 'Edital PE 12/2026',
  paginas: 3,
  escaneado: false,
  texto: [
    '[[PÁGINA 1]]\nPREGÃO ELETRÔNICO Nº 12/2026. Objeto: aquisição de esquadrias de alumínio.',
    '[[PÁGINA 2]]\n8.3. A visita técnica é facultativa e poderá ser agendada até 2 (dois) dias úteis antes da sessão pelo telefone (62) 3524-0000.',
    '[[PÁGINA 3]]\n9.1. Será exigida garantia contratual de 5% (cinco por cento) do valor do contrato, nos termos do art. 96 da Lei nº 14.133/2021.',
  ].join('\n\n'),
}
const ESCANEADO: TextoDeDocumento = { nome: 'Termo de Referência', paginas: 0, escaneado: true, texto: '' }

describe('conferência das citações da resposta', () => {
  it('confirma o trecho copiado e corrige a página que a IA errou', () => {
    const r = conferirResposta(
      {
        resposta: 'A visita técnica é facultativa.',
        encontrado: true,
        citacoes: [{ documento: 'Edital', pagina: '5', trecho: 'A visita técnica é facultativa e poderá ser agendada até 2 (dois) dias úteis antes da sessão' }],
      },
      [EDITAL]
    )
    expect(r.semComprovacao).toBe(false)
    expect(r.citacoes).toEqual([
      {
        documento: 'Edital PE 12/2026',
        pagina: '2',
        trecho: 'A visita técnica é facultativa e poderá ser agendada até 2 (dois) dias úteis antes da sessão',
        conferencia: 'confirmado',
      },
    ])
  })

  it('descarta trecho inventado e avisa que a resposta ficou sem comprovação', () => {
    const r = conferirResposta(
      {
        resposta: 'Exige patrimônio líquido de 10%.',
        encontrado: true,
        citacoes: [{ documento: 'Edital PE 12/2026', pagina: '3', trecho: 'Será exigido patrimônio líquido mínimo de 10% do valor estimado da contratação' }],
      },
      [EDITAL]
    )
    expect(r.citacoes).toEqual([])
    expect(r.semComprovacao).toBe(true)
  })

  it('paráfrase próxima fica como parcial, sem página, e não comprova sozinha', () => {
    const r = conferirResposta(
      {
        resposta: 'A garantia é de 5%.',
        encontrado: true,
        citacoes: [{ documento: 'Edital PE 12/2026', pagina: '3', trecho: 'Será exigida garantia contratual de 5% (cinco por cento) do valor total do contrato assinado' }],
      },
      [EDITAL]
    )
    expect(r.citacoes).toHaveLength(1)
    expect(r.citacoes[0]).toMatchObject({ conferencia: 'parcial', pagina: null })
    expect(r.semComprovacao).toBe(true)
  })

  it('quando não encontrou no edital, não mostra citação nem alerta de comprovação', () => {
    const r = conferirResposta({ resposta: 'Não encontrei essa informação nos documentos.', encontrado: false, citacoes: [] }, [EDITAL])
    expect(r).toEqual({ texto: 'Não encontrei essa informação nos documentos.', encontrado: false, semComprovacao: false, citacoes: [] })
  })

  it('cita a mesma passagem uma vez só', () => {
    const trecho = 'Será exigida garantia contratual de 5% (cinco por cento) do valor do contrato'
    const r = conferirResposta(
      { resposta: 'Garantia de 5%.', encontrado: true, citacoes: [{ documento: 'Edital', pagina: '3', trecho }, { documento: 'Edital', pagina: '3', trecho }] },
      [EDITAL]
    )
    expect(r.citacoes).toHaveLength(1)
  })
})

describe('formato da resposta da IA', () => {
  it('aceita a resposta no formato e corta citações demais', () => {
    const citacao = { documento: 'Edital', pagina: '1', trecho: 'abc' }
    const r = validarRespostaDaIa({ resposta: ' Sim. ', encontrado: true, citacoes: [citacao, citacao, citacao, citacao, citacao, { documento: 1 }] })
    expect(r.resposta).toBe('Sim.')
    expect(r.citacoes).toHaveLength(4)
  })

  it('recusa resposta vazia ou fora do formato', () => {
    expect(() => validarRespostaDaIa({ resposta: '', encontrado: true, citacoes: [] })).toThrow()
    expect(() => validarRespostaDaIa({ resposta: 'ok', citacoes: [] })).toThrow()
    expect(() => validarRespostaDaIa(null)).toThrow()
  })
})

describe('texto enviado para a IA', () => {
  it('leva só os documentos com texto, com o nome de cada um', () => {
    const texto = textoDosDocumentos([EDITAL, ESCANEADO])
    expect(texto.startsWith('--- Edital PE 12/2026 ---')).toBe(true)
    expect(texto).not.toContain('Termo de Referência')
    expect(textoDosDocumentos([ESCANEADO])).toBe('')
  })

  it('inclui as perguntas anteriores para entender a pergunta nova', () => {
    expect(montarPergunta('E a garantia?', [])).toBe('Pergunta nova: E a garantia?')
    expect(montarPergunta('E o prazo?', [{ pergunta: 'Tem visita?', resposta: 'Sim, facultativa.' }])).toContain(
      'Pergunta: Tem visita?\nResposta: Sim, facultativa.\n\nPergunta nova: E o prazo?'
    )
  })

  it('limpa espaços da pergunta e conta as páginas do texto', () => {
    expect(normalizarPergunta('  tem   visita\n técnica? ')).toBe('tem visita técnica?')
    expect(paginasDoTexto(EDITAL.texto)).toBe(3)
  })
})

describe('quando preparar o edital para a conversa', () => {
  const agora = new Date('2026-10-21T12:00:00Z')
  const ha = (ms: number) => new Date(agora.getTime() - ms)

  it('prepara análise pronta que ainda não tem texto guardado', () => {
    expect(precisaPreparar({ status: 'DONE', conversaStatus: null, conversaAtualizadaEm: null }, agora)).toBe(true)
    expect(precisaPreparar({ status: 'RUNNING', conversaStatus: null, conversaAtualizadaEm: null }, agora)).toBe(false)
    expect(precisaPreparar({ status: 'DONE', conversaStatus: 'PRONTA', conversaAtualizadaEm: ha(1) }, agora)).toBe(false)
    expect(precisaPreparar({ status: 'DONE', conversaStatus: 'SEM_TEXTO', conversaAtualizadaEm: ha(1) }, agora)).toBe(false)
  })

  it('tenta de novo depois de falha ou de preparo travado, mas não na hora', () => {
    expect(precisaPreparar({ status: 'DONE', conversaStatus: 'FALHOU', conversaAtualizadaEm: ha(60_000) }, agora)).toBe(false)
    expect(precisaPreparar({ status: 'DONE', conversaStatus: 'FALHOU', conversaAtualizadaEm: ha(ESPERA_PARA_REPREPARAR_MS) }, agora)).toBe(true)
    expect(precisaPreparar({ status: 'DONE', conversaStatus: 'PREPARANDO', conversaAtualizadaEm: ha(60_000) }, agora)).toBe(false)
    expect(precisaPreparar({ status: 'DONE', conversaStatus: 'PREPARANDO', conversaAtualizadaEm: ha(PREPARO_TRAVADO_MS) }, agora)).toBe(true)
  })
})
