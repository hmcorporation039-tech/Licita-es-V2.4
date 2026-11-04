import { describe, expect, it } from 'vitest'
import { buildChecklistTemplate } from '../src/lib/checklistTemplate'
import { avaliarHabilitacao, documentoCorrespondeAoTexto, DocumentoDoCofre, tiposCitadosNoTexto } from '../src/lib/habilitacao'

const AGORA = new Date('2026-10-05T15:00:00Z')
const SESSAO = new Date('2026-10-20T13:00:00Z') // 20/10/2026
const dia = (s: string) => new Date(`${s}T00:00:00Z`)

function doc(tipo: string, validade: string | null, id = tipo): DocumentoDoCofre {
  return { id, nome: `Doc ${tipo}`, tipo, dataValidade: validade ? dia(validade) : null }
}

function avaliar(documentos: DocumentoDoCofre[], extra: { ia?: string[] | null; sessao?: Date | null } = {}) {
  return avaliarHabilitacao({
    checklist: buildChecklistTemplate(),
    documentos,
    documentosExigidosIA: extra.ia === undefined ? null : extra.ia,
    sessao: extra.sessao === undefined ? SESSAO : extra.sessao,
    agora: AGORA,
  })
}

const req = (r: ReturnType<typeof avaliar>, id: string) => r.requisitos.find((x) => x.id === id)!

describe('semáforo — validade NA DATA DA SESSÃO', () => {
  it('verde: válido e cobre a sessão', () => {
    const r = avaliar([doc('cnd-federal', '2026-12-31')])
    expect(req(r, 'cnd-federal').status).toBe('verde')
    expect(req(r, 'cnd-federal').motivo).toMatch(/cobre a data da sessão \(20\/10\/2026\)/)
  })

  it('amarelo: ainda vale hoje, mas vence ANTES da sessão', () => {
    const r = avaliar([doc('cnd-federal', '2026-10-12')])
    expect(req(r, 'cnd-federal').status).toBe('amarelo')
    expect(req(r, 'cnd-federal').motivo).toMatch(/Vence em 12\/10\/2026, antes da sessão/)
    expect(req(r, 'cnd-federal').acao).toBeTruthy()
  })

  it('vermelho: já vencido hoje', () => {
    const r = avaliar([doc('cnd-federal', '2026-09-30')])
    expect(req(r, 'cnd-federal').status).toBe('vermelho')
    expect(req(r, 'cnd-federal').motivo).toMatch(/Venceu em 30\/09\/2026/)
  })

  it('vencendo exatamente no dia da sessão ainda cobre a sessão', () => {
    const r = avaliar([doc('cnd-federal', '2026-10-20')])
    expect(req(r, 'cnd-federal').status).toBe('verde')
  })

  it('vence hoje: ainda é válido hoje (não é "vencido")', () => {
    const r = avaliar([doc('cnd-federal', '2026-10-05')], { sessao: null })
    expect(req(r, 'cnd-federal').status).toBe('verde')
  })

  it('sem validade cadastrada = verde, com aviso', () => {
    const r = avaliar([doc('contrato-social', null)])
    expect(req(r, 'contrato-social').status).toBe('verde')
    expect(req(r, 'contrato-social').motivo).toMatch(/sem data de vencimento/)
  })

  it('sem data de sessão usa hoje, e diz isso', () => {
    const r = avaliar([doc('cnd-federal', '2026-12-31')], { sessao: null })
    expect(r.referencia).toEqual({ dataSessao: null, usouHoje: true })
    expect(req(r, 'cnd-federal').motivo).toMatch(/não informa a data da sessão/)
  })

  it('vários documentos do mesmo tipo: vale o que cobre por mais tempo', () => {
    const r = avaliar([doc('cnd-federal', '2026-10-06', 'velho'), doc('cnd-federal', '2027-03-01', 'novo')])
    expect(req(r, 'cnd-federal').status).toBe('verde')
    expect(req(r, 'cnd-federal').documento?.id).toBe('novo')
  })
})

describe('o que é exigido', () => {
  it('padrão da lei sem documento: vermelho', () => {
    const r = avaliar([])
    for (const id of ['contrato-social', 'cnd-federal', 'crf-fgts', 'cndt', 'cnd-falencia', 'balanco-patrimonial']) {
      expect(req(r, id).status).toBe('vermelho')
      expect(req(r, id).origem).toBe('padrao')
    }
    expect(r.semPendenciaBloqueante).toBe(false)
  })

  it('itens condicionais sem análise do edital: cinza (não vira falso alarme)', () => {
    const r = avaliar([], { ia: null })
    expect(req(r, 'atestado-capacidade-tecnica').status).toBe('cinza')
    expect(req(r, 'atestado-capacidade-tecnica').motivo).toMatch(/Rode a análise/)
  })

  it('condicional citado pela análise e ausente do cofre: vermelho, origem "edital"', () => {
    const r = avaliar([], { ia: ['Atestado de capacidade técnica com quantitativo mínimo', 'Registro no CREA'] })
    expect(req(r, 'atestado-capacidade-tecnica')).toMatchObject({ status: 'vermelho', origem: 'edital' })
    expect(req(r, 'registro-conselho-classe')).toMatchObject({ status: 'vermelho', origem: 'edital' })
    expect(req(r, 'atestado-capacidade-tecnica').citadoNoEdital[0]).toMatch(/Atestado/)
  })

  it('condicional NÃO citado pela análise: cinza, pedindo para conferir o edital', () => {
    const r = avaliar([], { ia: ['Atestado de capacidade técnica'] })
    expect(req(r, 'art-rrt').status).toBe('cinza')
    expect(req(r, 'art-rrt').motivo).toMatch(/não cita/)
  })

  it('declarações e peças da proposta não são pendência do cofre', () => {
    const r = avaliar([], { ia: ['Garantia de proposta de 1%', 'Planilha de composição de custos'] })
    expect(req(r, 'declaracao-fato-impeditivo').status).toBe('cinza')
    expect(req(r, 'garantia-proposta').status).toBe('cinza')
    expect(req(r, 'garantia-proposta').acao).toMatch(/prepare/)
    expect(req(r, 'planilha-custos').status).toBe('cinza')
  })

  it('documento do cofre de um tipo não exigido ainda é avaliado (útil, não escondido)', () => {
    const r = avaliar([doc('art-rrt', '2026-10-10')])
    expect(req(r, 'art-rrt').status).toBe('amarelo')
  })

  it('exigência do edital sem tipo correspondente vira item "extra" para conferência manual', () => {
    const r = avaliar([], { ia: ['Comprovação de frota própria de 5 veículos'] })
    const extra = r.requisitos.find((x) => x.origem === 'extra')!
    expect(extra.status).toBe('cinza')
    expect(extra.label).toMatch(/frota/)
    expect(extra.section).toBe('Específico deste edital')
  })
})

describe('resumo', () => {
  it('conta por cor, e sem vermelho = sem pendência bloqueante', () => {
    const padrao = ['contrato-social', 'rg-cpf-socios', 'cartao-cnpj', 'cnd-federal', 'crf-fgts', 'cndt', 'regularidade-estadual', 'regularidade-municipal', 'cnd-falencia', 'balanco-patrimonial']
    const r = avaliar(padrao.map((t) => doc(t, '2027-01-01')))
    expect(r.resumo.vermelho).toBe(0)
    expect(r.semPendenciaBloqueante).toBe(true)
    expect(r.resumo.verde).toBe(10)
    expect(r.resumo.verde + r.resumo.amarelo + r.resumo.vermelho + r.resumo.cinza).toBe(r.requisitos.length)
  })
})

describe('tiposCitadosNoTexto', () => {
  it('reconhece tipos mesmo com acento e variações', () => {
    expect(tiposCitadosNoTexto('Declaração de visita técnica')).toContain('declaracao-vistoria')
    expect(tiposCitadosNoTexto('Índices de liquidez geral ≥ 1,0')).toContain('indices-contabeis')
    expect(tiposCitadosNoTexto('Certidão de falência e recuperação judicial')).toContain('cnd-falencia')
    expect(tiposCitadosNoTexto('ART ou RRT do responsável técnico')).toEqual(expect.arrayContaining(['art-rrt', 'vinculo-responsavel-tecnico']))
    expect(tiposCitadosNoTexto('Nada que case')).toEqual([])
  })
})

const PADRAO = [
  'contrato-social',
  'rg-cpf-socios',
  'cartao-cnpj',
  'cnd-federal',
  'crf-fgts',
  'cndt',
  'regularidade-estadual',
  'regularidade-municipal',
  'cnd-falencia',
  'balanco-patrimonial',
]
const avulso = (nome: string, validade: string | null, id = nome): DocumentoDoCofre => ({
  id,
  nome,
  tipo: null,
  dataValidade: validade ? dia(validade) : null,
})

describe('exigência específica × documento avulso do cofre', () => {
  it('casa pelo nome e avalia a validade', () => {
    const r = avaliar([avulso('Alvará de funcionamento', '2027-01-31')], {
      ia: ['Alvará de localização e funcionamento expedido pela prefeitura'],
    })
    const extra = r.requisitos.find((x) => x.origem === 'extra')!
    expect(extra.status).toBe('verde')
    expect(extra.documento?.nome).toBe('Alvará de funcionamento')
    expect(extra.motivo).toMatch(/Pelo nome, é o “Alvará de funcionamento” do cofre/)
  })

  it('avulso vencendo antes da sessão: amarelo', () => {
    const r = avaliar([avulso('Licença ambiental de operação', '2026-10-15')], {
      ia: ['Licença de operação ambiental válida'],
    })
    expect(r.requisitos.find((x) => x.origem === 'extra')!.status).toBe('amarelo')
  })

  it('uma palavra só em comum não basta (fica para conferir)', () => {
    expect(documentoCorrespondeAoTexto('Certificado ANATEL', 'Homologação ANATEL dos equipamentos')).toBe(false)
    expect(documentoCorrespondeAoTexto('Certidão municipal', 'Certidão de regularidade estadual')).toBe(false)
    const r = avaliar([avulso('Certificado ANATEL', '2027-01-01')], {
      ia: ['Homologação ANATEL dos equipamentos'],
    })
    expect(r.requisitos.find((x) => x.origem === 'extra')!.status).toBe('cinza')
  })

  it('documento com tipo do checklist não é usado para exigência específica', () => {
    const r = avaliar(
      [
        {
          id: 'x',
          nome: 'Alvará de funcionamento',
          tipo: 'cartao-cnpj',
          dataValidade: null,
        },
      ],
      { ia: ['Alvará de funcionamento'] }
    )
    expect(r.requisitos.find((x) => x.origem === 'extra')!.status).toBe('cinza')
  })
})

describe('parecer', () => {
  it('não habilitado: diz o que falta', () => {
    const docs = PADRAO.filter((t) => t !== 'crf-fgts' && t !== 'balanco-patrimonial').map((t) => doc(t, '2027-01-01'))
    const p = avaliar(docs, { ia: [] }).parecer
    expect(p.veredito).toBe('nao_habilitado')
    expect(p.titulo).toBe('Ainda não está habilitado: faltam Certidão de Regularidade do FGTS (CRF) e Balanço patrimonial e demonstrações contábeis.')
    expect(p.faltam).toHaveLength(2)
  })

  it('muitos faltando: nomeia 3 e conta o resto', () => {
    const p = avaliar([], { ia: [] }).parecer
    expect(p.titulo).toMatch(/^Ainda não está habilitado: faltam .+ e mais 7\.$/)
  })

  it('habilitado se renovar: diz o que vence antes da sessão e quando', () => {
    const docs = PADRAO.map((t) => doc(t, t === 'cndt' ? '2026-10-12' : '2027-01-01'))
    const p = avaliar(docs, { ia: [] }).parecer
    expect(p.veredito).toBe('habilitado_se_renovar')
    expect(p.titulo).toBe('Habilitado, desde que renove a tempo: Certidão Negativa de Débitos Trabalhistas (CNDT) (vence em 12/10/2026) vence antes da sessão.')
    expect(p.renovar).toEqual([
      {
        label: 'Certidão Negativa de Débitos Trabalhistas (CNDT)',
        vence: '2026-10-12',
      },
    ])
  })

  it('habilitado: tudo cobre a sessão; conta dias úteis e itens a conferir', () => {
    const p = avaliar(
      PADRAO.map((t) => doc(t, '2027-01-01')),
      { ia: ['Declaração de visita técnica', 'Comprovação de frota própria'] }
    ).parecer
    expect(p.veredito).toBe('habilitado')
    expect(p.diasUteisAteSessao).toBe(10) // 06/10 a 20/10, sem o feriado de 12/10
    expect(p.preparar).toEqual(['Declaração de vistoria técnica'])
    expect(p.conferir).toBeGreaterThan(0)
    expect(p.observacoes.join(' ')).toMatch(/Faltam 10 dias úteis até a sessão \(20\/10\/2026\)/)
    expect(p.observacoes.join(' ')).toMatch(/Prepare para esta proposta.+Declaração de vistoria técnica/)
  })

  it('sem análise do edital: avisa que só os documentos-padrão foram conferidos', () => {
    const p = avaliar(
      PADRAO.map((t) => doc(t, '2027-01-01')),
      { ia: null }
    ).parecer
    expect(p.observacoes.join(' ')).toMatch(/ainda não foi analisado/)
  })

  it('sessão perto e pendência: alerta do prazo curto', () => {
    const p = avaliar([], {
      ia: [],
      sessao: new Date('2026-10-07T13:00:00Z'),
    }).parecer
    expect(p.diasUteisAteSessao).toBe(2)
    expect(p.observacoes[0]).toMatch(/Faltam só 2 dias úteis/)
  })

  it('sessão que já passou', () => {
    const p = avaliar([], {
      ia: [],
      sessao: new Date('2026-10-01T13:00:00Z'),
    }).parecer
    expect(p.sessaoPassou).toBe(true)
    expect(p.diasUteisAteSessao).toBeNull()
  })
})
