import { describe, expect, it } from 'vitest'
import { consultarCnpj, empresaDaBrasilApi, itensPelasAtividades, normalizarCnpj, sugerirItensDoNegocio, validarSugestoes } from '../src/services/perfilDoNegocio'

const RESPOSTA = {
  razao_social: 'TORRES TESTE LTDA',
  nome_fantasia: '',
  uf: 'MS',
  municipio: 'CAMPO GRANDE',
  cnae_fiscal: 4321500,
  cnae_fiscal_descricao: 'Instalação e manutenção elétrica',
  cnaes_secundarios: [
    { codigo: 4751201, descricao: 'Comércio varejista especializado de equipamentos e suprimentos de informática' },
    { codigo: 8020001, descricao: 'Atividades de monitoramento de sistemas de segurança eletrônico' },
    { codigo: 0, descricao: 'Não informada' },
  ],
}

describe('perfil do negócio: CNPJ', () => {
  it('normaliza o CNPJ', () => {
    expect(normalizarCnpj('12.345.678/0001-90')).toBe('12345678000190')
    expect(normalizarCnpj('123')).toBeNull()
  })

  it('lê razão social, cidade e as atividades da BrasilAPI', () => {
    const e = empresaDaBrasilApi('12345678000190', RESPOSTA)!
    expect(e.razaoSocial).toBe('TORRES TESTE LTDA')
    expect(e.municipio).toBe('Campo Grande')
    expect(e.uf).toBe('MS')
    expect(e.atividades.map((a) => a.descricao)).toEqual([
      'Instalação e manutenção elétrica',
      'Comércio varejista especializado de equipamentos e suprimentos de informática',
      'Atividades de monitoramento de sistemas de segurança eletrônico',
    ])
    expect(e.atividades[0].principal).toBe(true)
  })

  it('consulta só a BrasilAPI e trata CNPJ inexistente e queda', async () => {
    const urls: string[] = []
    const e = await consultarCnpj('12.345.678/0001-91', async (u) => (urls.push(u), RESPOSTA))
    expect(urls).toEqual(['https://brasilapi.com.br/api/cnpj/v1/12345678000191'])
    expect(e.atividades).toHaveLength(3)
    await expect(consultarCnpj('12345678000192', async () => null)).rejects.toThrow(/não encontrado/)
    await expect(consultarCnpj('12345678000193', async () => { throw new Error('timeout') })).rejects.toThrow(/não respondeu/)
  })
})

describe('perfil do negócio: sugestões', () => {
  it('sem IA, cada atividade vira um item com palavras do objeto', () => {
    const e = empresaDaBrasilApi('1', RESPOSTA)!
    const itens = itensPelasAtividades(e.atividades)
    expect(itens.map((i) => i.nome)).toEqual([
      'Instalação e manutenção elétrica',
      'Equipamentos e suprimentos de informática',
      'Monitoramento de sistemas de segurança eletrônico',
    ])
    expect(itens[1].palavrasChave).toEqual(['equipamentos', 'suprimentos de informática'])
    expect(itens[0].motivo).toMatch(/principal/)
  })

  it('valida a resposta da IA: tira termo genérico, código e repetição', () => {
    const r = validarSugestoes({
      itens: [
        { nome: 'Câmeras de segurança', palavrasChave: ['Câmeras de segurança', 'cftv', 'cftv', 'de', '123456789'], palavrasDeExclusao: ['cftv', 'drone'], motivo: 'da descrição' },
        { nome: '', palavrasChave: ['x'], palavrasDeExclusao: [], motivo: '' },
      ],
    })
    expect(r).toEqual([{ nome: 'Câmeras de segurança', palavrasChave: ['câmeras de segurança', 'cftv'], palavrasDeExclusao: ['drone'], motivo: 'da descrição' }])
  })

  it('com IA usa a resposta dela; se a IA falha, cai nas atividades do CNPJ', async () => {
    const buscar = async () => RESPOSTA
    const comIa = await sugerirItensDoNegocio({
      cnpj: '12345678000194',
      descricao: 'Vendo e instalo câmeras',
      iaHabilitada: true,
      buscar,
      consultar: async () => ({ json: { itens: [{ nome: 'CFTV', palavrasChave: ['câmeras', 'cftv'], palavrasDeExclusao: [], motivo: 'descrição' }] }, uso: { provider: 'gemini', model: 'x', inputTokens: 1, outputTokens: 1 } }),
    })
    expect(comIa.origem).toBe('ia')
    expect(comIa.sugestoes[0].palavrasChave).toEqual(['câmeras', 'cftv'])

    const semIa = await sugerirItensDoNegocio({
      cnpj: '12345678000195',
      iaHabilitada: true,
      buscar,
      consultar: async () => { throw new Error('sobrecarga') },
    })
    expect(semIa.origem).toBe('atividades')
    expect(semIa.sugestoes.length).toBe(3)
  })

  it('só descrição e sem IA: não inventa (devolve vazio)', async () => {
    const r = await sugerirItensDoNegocio({ descricao: 'Vendo uniformes', iaHabilitada: false })
    expect(r.sugestoes).toEqual([])
  })
})

describe('perfil do negócio: atividades com complemento', () => {
  it('tira "outras", "com ..." e "sem ..." do nome da atividade', () => {
    const itens = itensPelasAtividades([
      { codigo: '6422100', descricao: 'Bancos múltiplos, com carteira comercial', principal: true },
      { codigo: '6499999', descricao: 'Outras atividades de serviços financeiros não especificadas anteriormente', principal: false },
    ])
    expect(itens.map((i) => [i.nome, i.palavrasChave])).toEqual([
      ['Bancos múltiplos', ['bancos múltiplos']],
      ['Serviços financeiros', ['serviços financeiros']],
    ])
  })
})
