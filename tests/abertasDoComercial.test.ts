import { describe, expect, it } from 'vitest'
import { chaveConfere, chaveDoComercial, linkDaLicitacao, pontosDeAtencao, rotuloDaModalidade, valorComoNumero } from '../src/lib/abertasDoComercial'

const CHAVE = 'a'.repeat(64)

describe('chave do comercial-ia', () => {
  it('fica desligada sem a variável ou com chave curta demais', () => {
    expect(chaveDoComercial({})).toBeNull()
    expect(chaveDoComercial({ COMERCIAL_IA_CHAVE: '   ' })).toBeNull()
    expect(chaveDoComercial({ COMERCIAL_IA_CHAVE: 'curta' })).toBeNull()
    expect(chaveDoComercial({ COMERCIAL_IA_CHAVE: ` ${CHAVE} ` })).toBe(CHAVE)
  })

  it('só confere a chave idêntica', () => {
    expect(chaveConfere(CHAVE, CHAVE)).toBe(true)
    expect(chaveConfere(`${CHAVE}b`, CHAVE)).toBe(false)
    expect(chaveConfere('b'.repeat(64), CHAVE)).toBe(false)
    expect(chaveConfere('', CHAVE)).toBe(false)
    expect(chaveConfere(undefined, CHAVE)).toBe(false)
  })
})

describe('campos da resposta', () => {
  it('modalidade em texto e valor como número', () => {
    expect(rotuloDaModalidade('PREGAO_ELETRONICO')).toBe('Pregão eletrônico')
    expect(rotuloDaModalidade('DISPENSA_SEM_DISPUTA')).toBe('Dispensa sem disputa')
    expect(valorComoNumero({ toNumber: () => 1234.5 })).toBe(1234.5)
    expect(valorComoNumero(null)).toBeNull()
    expect(valorComoNumero({ toNumber: () => 0 })).toBeNull()
  })

  it('link: origem válida, depois página do PNCP, depois a Licita Bela', () => {
    const env = { APP_URL: 'https://www.licitabela.com.br/' }
    const base = { id: 'abc', fonte: 'PNCP' as const, linkEdital: null, numeroControle: null }
    expect(linkDaLicitacao({ ...base, linkEdital: 'https://compras.exemplo.gov.br/edital/1' }, env)).toBe('https://compras.exemplo.gov.br/edital/1')
    expect(linkDaLicitacao({ ...base, linkEdital: 'javascript:alert(1)', numeroControle: '12345678000190-1-000045/2026' }, env)).toBe(
      'https://pncp.gov.br/app/editais/12345678000190/2026/45'
    )
    expect(linkDaLicitacao(base, env)).toBe('https://www.licitabela.com.br/tenders/abc')
  })

  it('pontos de atenção só da análise pronta, mais graves primeiro', () => {
    expect(pontosDeAtencao(null)).toEqual([])
    expect(pontosDeAtencao({ status: 'RUNNING', resultado: { riscos: [{ titulo: 'x' }] } })).toEqual([])
    expect(pontosDeAtencao({ status: 'DONE', resultado: { riscos: 'nada' } })).toEqual([])
    const resultado = {
      riscos: [
        { titulo: 'Prazo curto para amostra', severidade: 'baixa' },
        { titulo: '  Visita técnica   obrigatória ', severidade: 'alta' },
        { descricao: 'sem título' },
        { titulo: 'Atestado com quantitativo alto', severidade: 'media' },
      ],
    }
    expect(pontosDeAtencao({ status: 'DONE', resultado })).toEqual(['Visita técnica obrigatória', 'Atestado com quantitativo alto', 'Prazo curto para amostra'])
  })
})
