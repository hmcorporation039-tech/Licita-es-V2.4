import { describe, expect, it } from 'vitest'
import { montarResumoDaBela, primeiroNome, saudacaoPelaHora } from '../src/lib/resumoDaBela'

// 17/11/2026 08:00 em Brasília = 11:00 UTC
const AGORA = new Date('2026-11-17T11:00:00Z')
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('saudação da Bela', () => {
  it('usa a hora de Brasília', () => {
    expect(saudacaoPelaHora(new Date('2026-11-17T11:00:00Z'))).toBe('Bom dia')
    expect(saudacaoPelaHora(new Date('2026-11-17T16:00:00Z'))).toBe('Boa tarde')
    expect(saudacaoPelaHora(new Date('2026-11-17T23:30:00Z'))).toBe('Boa noite')
    expect(saudacaoPelaHora(new Date('2026-11-17T02:00:00Z'))).toBe('Boa noite')
  })

  it('pega o primeiro nome e ignora e-mail', () => {
    expect(primeiroNome('márcio henrique')).toBe('Márcio')
    expect(primeiroNome('fulano@empresa.com')).toBeNull()
    expect(primeiroNome(null)).toBeNull()
  })
})

describe('resumo do dia', () => {
  it('sem sessão nem documento: só a saudação e as novas', () => {
    const r = montarResumoDaBela({ agora: AGORA, nome: 'Alexandre Souza', novas: 75, sessoes: [], documentos: [] })
    expect(r.saudacao).toBe('Bom dia, Alexandre!')
    expect(r.itens).toEqual([{ tipo: 'novas', texto: 'Encontrei 75 licitações novas para a sua empresa que você ainda não viu.', href: '/matches' }])
    expect(r.fala.startsWith('Bom dia, Alexandre! Aqui é a Bela.')).toBe(true)
  })

  it('sessão hoje + certidão vencida vira aviso urgente em primeiro lugar', () => {
    const r = montarResumoDaBela({
      agora: AGORA,
      nome: 'Alexandre',
      novas: 0,
      sessoes: [{ tenderId: 't1', objeto: 'Câmeras de videomonitoramento', fonte: 'PNCP', data: new Date('2026-11-17T12:00:00Z') }],
      documentos: [{ id: 'd1', nome: 'Certidão de FGTS', dataValidade: dia('2026-11-16') }],
    })
    expect(r.itens[0]).toEqual({
      tipo: 'urgente',
      texto: 'Atenção: você tem sessão hoje às 9h e Certidão de FGTS venceu. Confira se o edital exige e renove antes da sessão.',
      href: '/empresa',
    })
    expect(r.itens[1]).toMatchObject({ tipo: 'sessao', texto: 'Hoje, às 9h, tem a sessão de: Câmeras de videomonitoramento.', href: '/tenders/t1' })
    // O vencido já entrou no aviso urgente: não repete.
    expect(r.itens.filter((i) => i.tipo === 'documento')).toHaveLength(0)
  })

  it('ignora sessão que já passou hoje e sessão depois de amanhã', () => {
    const r = montarResumoDaBela({
      agora: AGORA,
      nome: null,
      novas: 1,
      sessoes: [
        { tenderId: 'passou', objeto: 'A', fonte: 'PNCP', data: new Date('2026-11-17T10:00:00Z') },
        { tenderId: 'amanha', objeto: 'B', fonte: 'PNCP', data: new Date('2026-11-18T17:30:00Z') },
        { tenderId: 'depois', objeto: 'C', fonte: 'PNCP', data: new Date('2026-11-19T12:00:00Z') },
      ],
      documentos: [],
    })
    expect(r.saudacao).toBe('Bom dia!')
    expect(r.itens.map((i) => i.href)).toEqual(['/tenders/amanha', '/matches'])
    expect(r.itens[0].texto).toBe('Amanhã, às 14h30, tem a sessão de: B.')
    expect(r.itens[1].texto).toBe('Encontrei 1 licitação nova para a sua empresa que você ainda não viu.')
  })

  it('validade é dia de calendário: vale até o fim do dia', () => {
    const r = montarResumoDaBela({
      agora: AGORA,
      nome: null,
      novas: 0,
      sessoes: [],
      documentos: [
        { id: 'a', nome: 'CND federal', dataValidade: dia('2026-11-17') },
        { id: 'b', nome: 'Certidão trabalhista', dataValidade: dia('2026-11-22') },
        { id: 'c', nome: 'Alvará', dataValidade: dia('2027-03-01') },
        { id: 'd', nome: 'Certidão estadual', dataValidade: dia('2026-11-10') },
      ],
    })
    expect(r.itens.map((i) => i.texto)).toEqual([
      'Certidão estadual venceu. Renove para não ficar de fora da próxima licitação.',
      'CND federal vence hoje.',
      'Certidão trabalhista vence em 5 dias.',
      'Você já viu todas as licitações que encontrei. Sigo garimpando e aviso quando chegar alguma nova.',
    ])
  })
})
