import { describe, expect, it } from 'vitest'
import {
  decodificarHtml,
  detectarModalidade,
  ehLicitacaoAtual,
  limparTexto,
  montarTender,
  urlAbsoluta,
} from '../src/services/sescRegional/tipos'

const AGORA = new Date(2026, 8, 30, 15, 0) // 30/09/2026 15:00

describe('ehLicitacaoAtual', () => {
  it('descarta situação de estado final', () => {
    for (const s of ['Encerrada', 'CANCELADO', 'Revogada', 'Homologada', 'Deserta', 'Concluído']) {
      expect(ehLicitacaoAtual({ situacao: s }, AGORA)).toBe(false)
    }
  })

  it('mantém situação aberta ou ausente', () => {
    expect(ehLicitacaoAtual({ situacao: 'Em andamento' }, AGORA)).toBe(true)
    expect(ehLicitacaoAtual({}, AGORA)).toBe(true)
  })

  it('descarta quando a data de encerramento já passou', () => {
    expect(ehLicitacaoAtual({ encerramentoAt: new Date(2026, 8, 29, 10, 0) }, AGORA)).toBe(false)
  })

  it('mantém a sessão marcada para hoje, mesmo com o horário já passado', () => {
    expect(ehLicitacaoAtual({ encerramentoAt: new Date(2026, 8, 30, 9, 0) }, AGORA)).toBe(true)
  })

  it('usa a data de abertura quando não há encerramento', () => {
    expect(ehLicitacaoAtual({ aberturaAt: new Date(2026, 9, 10) }, AGORA)).toBe(true)
    expect(ehLicitacaoAtual({ aberturaAt: new Date(2026, 7, 1) }, AGORA)).toBe(false)
  })
})

describe('detectarModalidade', () => {
  it.each([
    ['Pregão Eletrônico nº 12/2026', 'PREGAO_ELETRONICO'],
    ['PREGÃO PRESENCIAL 05/2026', 'PREGAO_PRESENCIAL'],
    ['Concorrência 01/2026', 'CONCORRENCIA'],
    ['Dispensa de Licitação', 'DISPENSA_SEM_DISPUTA'],
    ['Inexigibilidade', 'INEXIGIBILIDADE'],
    ['Credenciamento', 'CREDENCIAMENTO'],
    ['Tomada de Preços', 'TOMADA_DE_PRECOS'],
    ['Chamamento público', 'OUTROS'],
  ])('%s -> %s', (texto, esperado) => {
    expect(detectarModalidade(texto)).toBe(esperado)
  })
})

describe('urlAbsoluta', () => {
  it('resolve link relativo contra a página', () => {
    expect(urlAbsoluta('/docs/edital.pdf', 'https://exemplo.com.br/licitacoes/')).toBe(
      'https://exemplo.com.br/docs/edital.pdf'
    )
  })

  it('rejeita javascript:, mailto:, âncora e vazio', () => {
    for (const h of ['javascript:void(0)', 'mailto:a@b.com', '#', '', undefined]) {
      expect(urlAbsoluta(h, 'https://exemplo.com.br/')).toBeUndefined()
    }
  })
})

describe('montarTender', () => {
  const unidade = { uf: 'AM', nome: 'Sesc Amazonas' }

  it('monta o tender padrão com fonteId estável', () => {
    const t = montarTender(unidade, {
      idLocal: 'PP 12/2026',
      objeto: '  Aquisição   de\n material  ',
      modalidadeTexto: 'Pregão Presencial',
      anexos: [{ uri: 'https://x.com.br/edital.pdf', titulo: 'Edital' }],
    })
    expect(t.fonte).toBe('SESC_REGIONAL')
    expect(t.fonteId).toBe('SESC-AM-PP-12-2026')
    expect(t.objeto).toBe('Aquisição de material')
    expect(t.modalidade).toBe('PREGAO_PRESENCIAL')
    expect(t.uf).toBe('AM')
    expect(t.orgao).toBe('Sesc Amazonas')
    expect(t.linkEdital).toBe('https://x.com.br/edital.pdf')
  })

  it('gera o mesmo fonteId em coletas repetidas', () => {
    const a = montarTender(unidade, { idLocal: '7/2026', objeto: 'x' })
    const b = montarTender(unidade, { idLocal: '7/2026', objeto: 'y' })
    expect(a.fonteId).toBe(b.fonteId)
  })
})

describe('limparTexto', () => {
  it('colapsa espaços e quebras', () => {
    expect(limparTexto('  a \n\t b  ')).toBe('a b')
    expect(limparTexto(null)).toBe('')
  })
})

describe('decodificarHtml', () => {
  it('respeita o charset do cabeçalho (ISO-8859-1)', () => {
    const buf = Buffer.from('Licitação', 'latin1')
    expect(decodificarHtml(buf, 'text/html; charset=ISO-8859-1')).toBe('Licitação')
  })

  it('respeita o charset do <meta> quando o cabeçalho não diz', () => {
    const buf = Buffer.from('<meta charset="iso-8859-1"><p>Concorrência</p>', 'latin1')
    expect(decodificarHtml(buf)).toContain('Concorrência')
  })

  it('assume UTF-8 por padrão', () => {
    expect(decodificarHtml(Buffer.from('Licitação', 'utf8'))).toBe('Licitação')
  })
})
