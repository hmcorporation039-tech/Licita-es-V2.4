import { describe, expect, it } from 'vitest'
import { chaveDaExigencia, resumoDaVerificacao, simplificar, verificarExigencias } from '../src/lib/matrizExigencias'
import { montarTextoComPaginas } from '../src/services/pdfTextService'
import { exigencia } from './helpers/analises'

const EDITAL = [
  '[[PÁGINA 1]]',
  'PREGÃO ELETRÔNICO Nº 12/2026. Objeto: aquisição de computadores.',
  '',
  '[[PÁGINA 2]]',
  '10.3.2 A licitante deverá apresentar atestado de capacidade técnica, emitido por pessoa jurídica de direito público ou privado,',
  'comprovando o fornecimento de, no mínimo, 50% (cinquenta por cento) do quantitativo licitado.',
  '',
  '[[PÁGINA 3]]',
  'A garantia de proposta será de 1% do valor estimado da contratação.',
].join('\n')

const docs = [{ nome: 'Edital.pdf', texto: EDITAL }]
const um = (texto: string, extra = {}) => verificarExigencias([exigencia(texto, extra)], docs)[0].verificacao

describe('confirmação literal', () => {
  it('confirma o texto e diz em que página ele está', () => {
    const v = um('A licitante deverá apresentar atestado de capacidade técnica')
    expect(v.status).toBe('confirmado')
    expect(v.paginaConfirmada).toBe('2')
    expect(v.documentoConfirmado).toBe('Edital.pdf')
  })

  it('a página confirmada é a real, mesmo quando a IA errou a página', () => {
    const v = um('A garantia de proposta será de 1% do valor estimado da contratação', { pagina: '9' })
    expect(v.status).toBe('confirmado')
    expect(v.paginaConfirmada).toBe('3')
  })

  it('ignora acento, caixa, pontuação, quebra de linha e espaços', () => {
    expect(um('a LICITANTE   deverá apresentar atestado de capacidade tecnica,').status).toBe('confirmado')
    expect(um('emitido por pessoa jurídica de direito público ou privado, comprovando o fornecimento').status).toBe('confirmado')
  })

  it('texto cortado com reticências ainda confirma o que veio antes delas', () => {
    expect(um('A licitante deverá apresentar atestado de capacidade técnica, emitido por…').status).toBe('confirmado')
  })

  it('o documento indicado pela IA é procurado primeiro, mas qualquer documento vale', () => {
    const dois = [
      { nome: 'Termo de Referência.pdf', texto: '[[PÁGINA 1]]\nO prazo de garantia dos equipamentos será de 36 meses.' },
      { nome: 'Edital.pdf', texto: EDITAL },
    ]
    const r = verificarExigencias([exigencia('O prazo de garantia dos equipamentos será de 36 meses', { documento: 'Termo de Referência' })], dois)[0]
    expect(r.verificacao).toMatchObject({ status: 'confirmado', documentoConfirmado: 'Termo de Referência.pdf', paginaConfirmada: '1' })
    const r2 = verificarExigencias([exigencia('A garantia de proposta será de 1% do valor estimado', { documento: 'Termo de Referência' })], dois)[0]
    expect(r2.verificacao.documentoConfirmado).toBe('Edital.pdf')
  })
})

describe('invenção e paráfrase', () => {
  it('exigência que NÃO está no edital: não localizada', () => {
    const v = um('A licitante deverá comprovar frota própria de dez veículos refrigerados')
    expect(v.status).toBe('nao-localizado')
    expect(v.paginaConfirmada).toBeNull()
  })

  it('paráfrase próxima: parcial, não confirmada', () => {
    const v = um('A licitante deverá apresentar atestado de capacidade técnica emitido por pessoa jurídica comprovando fornecimento de pelo menos 50% do quantitativo')
    expect(v.status).toBe('parcial')
  })

  it('número trocado (1% virando 3%) não é confirmado', () => {
    const v = um('A garantia de proposta será de 3% do valor estimado da contratação')
    expect(v.status).not.toBe('confirmado')
  })
})

describe('o que não dá para conferir', () => {
  it('trecho curto demais', () => {
    expect(um('Atestado técnico').status).toBe('nao-verificavel')
  })

  it('documento escaneado (sem texto): não verificável, nunca "não localizado"', () => {
    const escaneado = [{ nome: 'Edital escaneado.pdf', texto: null }]
    expect(verificarExigencias([exigencia('A licitante deverá apresentar atestado de capacidade técnica')], escaneado)[0].verificacao.status).toBe('nao-verificavel')
  })

  it('com um documento de texto e outro escaneado, o que não achou no texto fica "não verificável"', () => {
    const misto = [{ nome: 'Edital.pdf', texto: EDITAL }, { nome: 'Anexo escaneado.pdf', texto: null }]
    const v = verificarExigencias([exigencia('Exigência que só existe no anexo escaneado de verdade')], misto)[0].verificacao
    expect(v.status).toBe('nao-verificavel')
  })

  it('texto sem marcadores de página confirma, sem página', () => {
    const v = verificarExigencias([exigencia('A licitante deverá apresentar atestado de capacidade técnica')], [{ nome: 'x.pdf', texto: 'A licitante deverá apresentar atestado de capacidade técnica e mais.' }])[0].verificacao
    expect(v.status).toBe('confirmado')
    expect(v.paginaConfirmada).toBeNull()
  })
})

describe('chaves e resumo', () => {
  it('a chave da exigência é estável sob pontuação e caixa, e diferente para textos diferentes', () => {
    expect(chaveDaExigencia('A licitante deverá apresentar atestado.')).toBe(chaveDaExigencia('a  licitante deverá, apresentar ATESTADO'))
    expect(chaveDaExigencia('texto um')).not.toBe(chaveDaExigencia('texto dois'))
    expect(chaveDaExigencia('x')).toMatch(/^[0-9a-f]{12}$/)
  })

  it('simplificar normaliza', () => {
    expect(simplificar('  Certidão — Negativa, de Débitos!  ')).toBe('certidao negativa de debitos')
  })

  it('resumo conta por status', () => {
    const r = verificarExigencias(
      [exigencia('A licitante deverá apresentar atestado de capacidade técnica'), exigencia('Frota própria de dez veículos refrigerados do licitante'), exigencia('curto')],
      docs
    )
    expect(resumoDaVerificacao(r)).toEqual({ confirmado: 1, parcial: 0, 'nao-localizado': 1, 'nao-verificavel': 1 })
  })
})

describe('marcadores de página', () => {
  it('montarTextoComPaginas põe [[PÁGINA n]] antes de cada página', () => {
    const t = montarTextoComPaginas([{ num: 1, text: ' primeira ' }, { num: 2, text: 'segunda' }])
    expect(t).toBe('[[PÁGINA 1]]\nprimeira\n\n[[PÁGINA 2]]\nsegunda')
  })
})

describe('PDFs reais perdem ligaturas na extração (ex.: "administra vo", "compa vel")', () => {
  const PDF_COM_LIGATURA_PERDIDA = [
    '[[PÁGINA 7]]',
    '3.6. A subcontratada deverá possuir capacidade técnica compa vel com a parcela subcontratada,',
    'conforme o processo administra vo e a proposta comercial do licitante vencedor.',
  ].join('\n')
  const doc = [{ nome: 'Edital.pdf', texto: PDF_COM_LIGATURA_PERDIDA }]

  it('a IA devolve a palavra correta e o sistema ainda confirma, com a página certa', () => {
    const r = verificarExigencias([exigencia('A subcontratada deverá possuir capacidade técnica compatível com a parcela subcontratada')], doc)[0]
    expect(r.verificacao).toMatchObject({ status: 'confirmado', paginaConfirmada: '7' })
    const r2 = verificarExigencias([exigencia('conforme o processo administrativo e a proposta comercial do licitante vencedor')], doc)[0]
    expect(r2.verificacao.status).toBe('confirmado')
  })

  it('o conserto não afrouxa demais: texto diferente continua não confirmado', () => {
    const r = verificarExigencias([exigencia('A subcontratada deverá possuir frota própria refrigerada em operação regular')], doc)[0]
    expect(r.verificacao.status).not.toBe('confirmado')
  })

  it('espaços extras, quebras de linha e hifenização de PDF não atrapalham', () => {
    const quebrado = [{ nome: 'x.pdf', texto: '[[PÁGINA 1]]\nA licitante   deverá\napresentar atestado\n de capacidade técnica compatível.' }]
    const r = verificarExigencias([exigencia('A licitante deverá apresentar atestado de capacidade técnica compatível')], quebrado)[0]
    expect(r.verificacao.status).toBe('confirmado')
  })

  it('exigência que atravessa a quebra de página é confirmada e fica na página onde começa', () => {
    const duas = [{ nome: 'x.pdf', texto: '[[PÁGINA 4]]\nO licitante deverá apresentar a garantia de proposta no valor de\n\n[[PÁGINA 5]]\num por cento do valor estimado da contratação.' }]
    const r = verificarExigencias([exigencia('O licitante deverá apresentar a garantia de proposta no valor de um por cento do valor estimado da contratação')], duas)[0]
    expect(r.verificacao).toMatchObject({ status: 'confirmado', paginaConfirmada: '4' })
  })
})
