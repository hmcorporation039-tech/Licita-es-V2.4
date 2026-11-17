import { describe, expect, it } from 'vitest'
import { aptidaoParaObra, type EmpresaParaAptidao } from '../src/lib/aptidaoParaObra'

const hoje = new Date('2026-11-17T12:00:00Z')
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)

const empresa = (mudar: Partial<EmpresaParaAptidao> = {}): EmpresaParaAptidao => ({
  pessoaFisica: false,
  cnaes: ['4321500', '4120400'],
  documentos: [
    { nome: 'CND Federal', tipo: 'cnd-federal', dataValidade: dia('2027-03-01') },
    { nome: 'Registro no CREA', tipo: 'registro-conselho-classe', dataValidade: dia('2027-12-31') },
  ],
  raioKm: 150,
  ...mudar,
})

const eletrica = { nichos: ['Instalações elétricas'], distanciaKm: 12, vigenciaFim: dia('2027-06-30') }

describe('aptidaoParaObra', () => {
  it('tudo em ordem: boa chance, com os motivos', () => {
    const a = aptidaoParaObra(eletrica, empresa(), hoje)
    expect(a.veredito).toBe('boa')
    expect(a.titulo).toBe('Boa chance')
    expect(a.itens.every((i) => i.tom === 'ok')).toBe(true)
    expect(a.itens.map((i) => i.texto)).toEqual([
      'CNAE compatível com instalações elétricas (4321-5/00).',
      'A 12 km da sua base.',
      'Seus 2 documentos cadastrados estão em dia.',
      'Serviço de engenharia: seu registro no conselho (CREA/CAU) está cadastrado.',
      'Em vigência até 30/06/2027.',
    ])
  })

  it('CNAE de construção, mas não do nicho: confira antes', () => {
    const a = aptidaoParaObra(eletrica, empresa({ cnaes: ['4120400'] }), hoje)
    expect(a.veredito).toBe('confira')
    expect(a.itens[0]).toEqual({ tom: 'atencao', texto: expect.stringMatching(/Não achei CNAE de instalações elétricas/) })
  })

  it('nenhum CNAE do ramo: fora do perfil', () => {
    const a = aptidaoParaObra(eletrica, empresa({ cnaes: ['4751201'] }), hoje)
    expect(a.veredito).toBe('fora')
    expect(a.titulo).toBe('Fora do seu perfil')
    expect(a.itens[0].tom).toBe('problema')
  })

  it('sem CNAE disponível ou pessoa física: avisa, sem afirmar nada', () => {
    expect(aptidaoParaObra(eletrica, empresa({ cnaes: null }), hoje).itens[0]).toEqual({ tom: 'atencao', texto: 'Não consegui conferir seus CNAEs na Receita agora.' })
    const pf = aptidaoParaObra(eletrica, empresa({ pessoaFisica: true, cnaes: null }), hoje)
    expect(pf.veredito).toBe('confira')
    expect(pf.itens[0].texto).toMatch(/pessoa física/)
  })

  it('nicho próprio (fora do catálogo) não confere CNAE nem conselho', () => {
    const a = aptidaoParaObra({ nichos: ['Marmoraria'], distanciaKm: 5, vigenciaFim: null }, empresa(), hoje)
    expect(a.itens.map((i) => i.texto)).toEqual(['A 5 km da sua base.', 'Seus 2 documentos cadastrados estão em dia.'])
    expect(a.veredito).toBe('boa')
  })

  it('documentos vencidos e vencendo', () => {
    const vencidos = aptidaoParaObra(
      eletrica,
      empresa({
        documentos: [
          { nome: 'CND Federal', tipo: 'cnd-federal', dataValidade: dia('2026-10-01') },
          { nome: 'CRF FGTS', tipo: 'crf-fgts', dataValidade: dia('2026-11-01') },
          { nome: 'Contrato social', tipo: 'contrato-social', dataValidade: null },
        ],
      }),
      hoje
    )
    expect(vencidos.itens).toContainEqual({ tom: 'problema', texto: '2 documentos vencidos: CND Federal, CRF FGTS.' })
    expect(vencidos.veredito).toBe('confira')

    // Renovado: o novo do mesmo tipo cobre o vencido.
    const renovado = aptidaoParaObra(
      eletrica,
      empresa({
        documentos: [
          { nome: 'CND Federal (antiga)', tipo: 'cnd-federal', dataValidade: dia('2026-10-01') },
          { nome: 'CND Federal', tipo: 'cnd-federal', dataValidade: dia('2027-04-01') },
          { nome: 'Registro no CREA', tipo: 'registro-conselho-classe', dataValidade: null },
        ],
      }),
      hoje
    )
    expect(renovado.veredito).toBe('boa')

    const vencendo = aptidaoParaObra(eletrica, empresa({ documentos: [{ nome: 'CNDT', tipo: 'cndt', dataValidade: dia('2026-11-25') }] }), hoje)
    expect(vencendo.itens).toContainEqual({ tom: 'atencao', texto: 'Vence em até 15 dias: CNDT.' })

    expect(aptidaoParaObra(eletrica, empresa({ documentos: [] }), hoje).itens).toContainEqual({ tom: 'atencao', texto: 'Nenhum documento cadastrado em Empresa e documentos.' })
  })

  it('serviço de engenharia sem registro no conselho: só um aviso', () => {
    const a = aptidaoParaObra(eletrica, empresa({ documentos: [{ nome: 'CND Federal', tipo: 'cnd-federal', dataValidade: dia('2027-03-01') }] }), hoje)
    expect(a.itens).toContainEqual({ tom: 'atencao', texto: 'Serviço de engenharia: costuma exigir registro no CREA/CAU (não achei no seu cadastro).' })
    expect(a.veredito).toBe('confira')
  })

  it('distância além do raio e vigência', () => {
    expect(aptidaoParaObra({ ...eletrica, distanciaKm: 480 }, empresa(), hoje).itens).toContainEqual({
      tom: 'atencao',
      texto: 'A 480 km da sua base, além do seu raio de 150 km: conte o deslocamento.',
    })
    expect(aptidaoParaObra({ ...eletrica, distanciaKm: 0 }, empresa(), hoje).itens).toContainEqual({ tom: 'ok', texto: 'Na cidade da sua base.' })
    const acabando = aptidaoParaObra({ ...eletrica, vigenciaFim: dia('2026-12-01') }, empresa(), hoje)
    expect(acabando.veredito).toBe('confira')
    expect(acabando.itens.at(-1)?.texto).toMatch(/^Termina em 14 dias \(01\/12\/2026\)/)
    const terminou = aptidaoParaObra({ ...eletrica, vigenciaFim: dia('2026-11-01') }, empresa(), hoje)
    expect(terminou.veredito).toBe('fora')
    expect(terminou.itens.at(-1)).toEqual({ tom: 'problema', texto: 'Contrato já terminou em 01/11/2026.' })
  })
})
