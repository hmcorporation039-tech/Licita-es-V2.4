import { describe, expect, it } from 'vitest'
import { acharRegraDeSubcontratacao, explicacaoDaSubcontratacao, limiteDoTexto, normalizarComMapa, ordenarParaProcurarARegra, vereditoDaFrase } from '../src/lib/subcontratacao'
import { normalize } from '../src/lib/geoService'

const v = (frase: string) => vereditoDaFrase(normalize(frase).replace(/\s+/g, ' '))
const regra = (texto: string) => acharRegraDeSubcontratacao([{ nome: 'Edital', texto }])

describe('vereditoDaFrase', () => {
  it('proibições diretas', () => {
    expect(v('É vedada a subcontratação.')).toBe('proibe')
    expect(v('Não será admitida a subcontratação do objeto contratual.')).toBe('proibe')
    expect(v('Não será admitida subcontratação')).toBe('proibe')
    expect(v('A subcontratação do objeto é expressamente vedada.')).toBe('proibe')
    expect(v('Fica proibida a subcontratação, cessão ou transferência do objeto.')).toBe('proibe')
    expect(v('É vedada a cessão, transferência ou subcontratação do objeto deste contrato.')).toBe('proibe')
    expect(v('A CONTRATADA não poderá subcontratar o objeto deste contrato.')).toBe('proibe')
    expect(v('A subcontratação não será permitida.')).toBe('proibe')
    expect(v('Não se admite a subcontratação.')).toBe('proibe')
    expect(v('A contratada não poderá subcontratar, total ou parcialmente, o objeto.')).toBe('proibe')
  })

  it('permissões diretas', () => {
    expect(v('Será admitida a subcontratação parcial até 30% do valor do contrato.')).toBe('permite')
    expect(v('É permitida a subcontratação parcial do objeto, nas seguintes condições:')).toBe('permite')
    expect(v('A subcontratação parcial do objeto poderá ser autorizada pela fiscalização.')).toBe('permite')
    expect(v('A Contratada poderá subcontratar os serviços de terraplenagem.')).toBe('permite')
    expect(v('Poderão ser subcontratadas as seguintes parcelas do objeto: pintura e esquadrias.')).toBe('permite')
    expect(v('Admite-se a subcontratação de até 25% do objeto.')).toBe('permite')
    expect(v('Sendo que as subcontratações parciais possíveis só poderão ser realizadas mediante avaliação e autorização prévia do contratante.')).toBe('permite')
    expect(v('A subcontratação não poderá ser realizada.')).toBe('proibe')
  })

  it('negação não vira permissão', () => {
    expect(v('Não é permitida a subcontratação.')).toBe('proibe')
    expect(v('Não será permitida a subcontratação total ou parcial do objeto.')).toBe('proibe')
    expect(v('A empresa não poderá ser subcontratada.')).toBe('proibe')
  })

  it('proibição só do todo ou da parcela principal não fecha a porta', () => {
    expect(v('A Contratada não poderá subcontratar, ceder ou transferir, no todo, o objeto do contrato, a terceiros.')).toBeNull()
    expect(v('É vedada a subcontratação completa ou da parcela principal da obrigação.')).toBeNull()
    expect(v('É vedada a subcontratação total do objeto.')).toBeNull()
    expect(v('É vedada a subcontratação de pessoa física ou jurídica que mantenha vínculo com dirigente do órgão.')).toBeNull()
  })

  it('proibição com exceção permite', () => {
    expect(v('Não será admitida a subcontratação, salvo para os serviços de sondagem, até 20% do valor.')).toBe('permite')
    expect(v('É vedada a subcontratação sem prévia autorização da Contratante.')).toBe('permite')
    expect(v('f - Não ceder, transferir ou subcontratar, no todo ou em parte, o objeto deste instrumento, sem o conhecimento e a devida autorização expressa do Contratante;')).toBe('permite')
  })

  it('lista de obrigações no infinitivo', () => {
    expect(v('Não ceder, transferir ou subcontratar o objeto deste contrato;')).toBe('proibe')
    expect(v('As condições de subcontratação, quando permitida pela CONTRATANTE, estarão previstas no Projeto Básico.')).toBeNull()
  })

  it('frases que só citam a palavra não decidem', () => {
    expect(v('responsável técnico ou subcontratado, quando a licitação versar sobre obra')).toBeNull()
    expect(v('o que deve ser observado pelos seus prepostos e eventuais subcontratados, caso permitida a subcontratação.')).toBeNull()
    expect(v('Em qualquer hipótese de subcontratação, permanece a responsabilidade integral do Contratado.')).toBeNull()
    expect(v('As exigências abrangem fornecedores, subfornecedores e subcontratados, sem exceções.')).toBeNull()
    expect(v('Prazo de execução de 180 dias.')).toBeNull()
  })

  it('cessão vedada mas subcontratação parcial permitida', () => {
    expect(v('Não é admitida a cessão ou transferência, total ou parcial, do objeto contratual, mas é permitida a subcontratação parcial do objeto, até o limite de 30%.')).toBe('permite')
  })
})

describe('limiteDoTexto', () => {
  it('lê o percentual', () => {
    expect(limiteDoTexto('ate o limite de 30% (trinta por cento) do valor total do contrato')).toBe('até 30% do valor do contrato')
    expect(limiteDoTexto('ate o limite maximo de 30% (trinta por cento) do objeto')).toBe('até 30% do objeto')
    expect(limiteDoTexto('limitada a 25 (vinte e cinco) por cento')).toBe('até 25%')
    expect(limiteDoTexto('sem percentual')).toBeNull()
  })
})

describe('normalizarComMapa', () => {
  it('junta palavra quebrada no fim da linha e mapeia para o original', () => {
    const original = 'É vedada a subcon-\ntratação   do objeto.'
    const m = normalizarComMapa(original)
    expect(m.texto).toBe('e vedada a subcontratacao do objeto.')
    expect(original[m.mapa[m.texto.indexOf('objeto')]]).toBe('o')
  })
})

describe('acharRegraDeSubcontratacao', () => {
  it('edital real (Leme/SP): "no todo" vedado, parcial até 30% permitida', () => {
    const texto = `15.17. A Contratada não poderá subcontratar, ceder ou transferir, no todo, o objeto do contrato, a
terceiros, sob pena de rescisão.
15.17.1. A subcontratação parcial do objeto, poderá ser autorizada pela fiscalização do
contrato, quando devidamente motivada pela contratada, até o limite máximo de 30% (trinta
por cento) do objeto, sendo vedada a subcontratação das parcelas de maior relevância e valor
significativo submetidas a prova de capacidade técnica, assim definidas no instrumento
convocatório.
15.17.2. A subcontratação que trata o subitem anterior deverá observar as normas previstas
no art. 122 da Lei Federal nº 14.133/2.021.`
    const r = regra(texto)
    expect(r.situacao).toBe('permite')
    expect(r.limite).toBe('até 30% do objeto')
    expect(r.trecho).toMatch(/^A subcontratação parcial do objeto, poderá ser autorizada/)
    expect(r.trecho!.length).toBeLessThanOrEqual(400)
    expect(r.documento).toBe('Edital')
  })

  it('minuta de contrato (modelo AGU) com lista de parcelas', () => {
    const texto = `responsável técnico ou subcontratado, quando a licitação versar sobre obra.
CLÁUSULA QUINTA – SUBCONTRATAÇÃO
5.1. Não é admitida a cessão ou transferência, total ou parcial, do objeto
contratual, mas é permitida a subcontratação parcial do objeto, até o limite de 30%
(trinta por cento) do valor total do contrato.
5.2. É vedada a subcontratação completa ou da parcela principal da obrigação.
5.3. Poderão ser subcontratadas as seguintes parcelas do objeto: acabamentos,
serviços gerais, estrutura, transporte e aluguel de equipamentos.
5.4. Em qualquer hipótese de subcontratação, permanece a responsabilidade integral do Contratado.`
    const r = regra(texto)
    expect(r.situacao).toBe('permite')
    expect(r.limite).toBe('até 30% do valor do contrato')
    expect(r.parcelas).toBe('acabamentos, serviços gerais, estrutura, transporte e aluguel de equipamentos')
    expect(r.trecho).toContain('é permitida a subcontratação parcial')
  })

  it('proibição, com o trecho original', () => {
    const r = regra('12. DA SUBCONTRATAÇÃO\n12.1. Não será admitida a subcontratação do objeto contratual.\n13. DO REAJUSTE')
    expect(r).toMatchObject({ situacao: 'proibe', trecho: 'Não será admitida a subcontratação do objeto contratual.', limite: null })
  })

  it('nada decisivo: não encontrei', () => {
    expect(regra('Os subcontratados, caso permitida a subcontratação, seguem as mesmas regras.').situacao).toBe('nao_encontrei')
    expect(acharRegraDeSubcontratacao([]).situacao).toBe('nao_encontrei')
  })

  it('o primeiro documento que decide vale', () => {
    const r = acharRegraDeSubcontratacao([
      { nome: 'Aviso', texto: 'Aviso de licitação. Sem menção.' },
      { nome: 'Termo de referência', texto: 'É vedada a subcontratação.' },
      { nome: 'Minuta', texto: 'É permitida a subcontratação parcial.' },
    ])
    expect(r).toMatchObject({ situacao: 'proibe', documento: 'Termo de referência' })
  })

  it('tira a numeração do próximo item que ficou no fim do trecho', () => {
    const r = regra('4.1. É permitida a subcontratação parcial do objeto, até o limite de 30% do valor total do contrato, nas seguintes condições: 4.2. A subcontratação depende de autorização.')
    expect(r.trecho).toBe('É permitida a subcontratação parcial do objeto, até o limite de 30% do valor total do contrato, nas seguintes condições:')
  })

  it('trecho longo é cortado em 400 caracteres', () => {
    const longo = `É permitida a subcontratação parcial ${'dos serviços acessórios de apoio '.repeat(30)}conforme o termo de referência.`
    const r = regra(longo)
    expect(r.situacao).toBe('permite')
    expect(r.trecho!.length).toBeLessThanOrEqual(400)
    expect(r.trecho!.endsWith('…')).toBe(true)
  })
})

describe('explicacaoDaSubcontratacao', () => {
  it('fala a consequência', () => {
    expect(explicacaoDaSubcontratacao({ situacao: 'proibe', limite: null })).toBe('O contrato não permite subcontratar a execução. Ainda dá para oferecer material ou aluguel de equipamento.')
    expect(explicacaoDaSubcontratacao({ situacao: 'permite', limite: 'até 30% do objeto' })).toBe('O contrato permite subcontratar parte do serviço (limite: até 30% do objeto).')
    expect(explicacaoDaSubcontratacao({ situacao: 'nao_encontrei', limite: null })).toBe('Não achei a regra no edital. Pergunte à empresa ou veja os arquivos no PNCP.')
  })
})

describe('ordenarParaProcurarARegra', () => {
  it('edital, termo de referência e minuta antes de planilha, riscos e ata', () => {
    const titulos = [
      'EDITAL E MEMORIAL CONCORRENCIA 132026 QUADRA JACUI.pdf',
      'ANEXO I ETP e Analise de Riscos CO 132026.pdf',
      'ANEXO IV Planilha Orcamentaria de Custos CO 132026 comprimida.xlsx',
      'ANEXO XIII Minuta de Contrato CO 132026.pdf',
      'Ata Sessao Julgamento CO 132026.pdf',
      'ANEXO_VIII__IMPRENSA_OFICIAL_32712023',
      'CE_01626__EDITAL',
    ]
    expect(ordenarParaProcurarARegra(titulos.map((titulo) => ({ titulo }))).map((a) => a.titulo)).toEqual([
      'EDITAL E MEMORIAL CONCORRENCIA 132026 QUADRA JACUI.pdf',
      'CE_01626__EDITAL',
      'ANEXO XIII Minuta de Contrato CO 132026.pdf',
      'ANEXO_VIII__IMPRENSA_OFICIAL_32712023',
      'ANEXO I ETP e Analise de Riscos CO 132026.pdf',
      'ANEXO IV Planilha Orcamentaria de Custos CO 132026 comprimida.xlsx',
      'Ata Sessao Julgamento CO 132026.pdf',
    ])
  })
})
