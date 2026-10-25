import { describe, expect, it } from 'vitest'
import { recursoDeHabilitacao, type AchadoDoRecurso } from '../src/lib/documentosDaLicitacao/recurso'
import { dadosDoCertame, dadosDoProponente, type EmpresaParaDocumento, type LicitacaoParaDocumento } from '../src/lib/documentosDaLicitacao/proponente'

const empresa: EmpresaParaDocumento = {
  name: 'Minha Empresa Ltda',
  tipo: 'PESSOA_JURIDICA',
  cnpj: '11222333000181',
  cpf: null,
  email: 'a@b.com',
  telefone: '61999999999',
  responsavel: 'Fulano de Tal',
  responsavelCpf: '12345678909',
  responsavelCargo: 'Sócio',
  dadosBancarios: '',
  endereco: 'Rua X',
  enderecoNumero: '10',
  enderecoComplemento: '',
  enderecoBairro: 'Centro',
  enderecoCidade: 'Brasília',
  enderecoUf: 'DF',
  cep: '70000000',
}

const licitacao: LicitacaoParaDocumento = { orgao: 'Prefeitura', numeroControle: '123', modalidade: 'PREGAO_ELETRONICO', objeto: 'Material de limpeza', sessao: null }

const achados: AchadoDoRecurso[] = [
  { exigencia: 'Regularidade com o FGTS', categoria: 'fiscal', situacao: 'nao_atende', explicacao: 'CRF vencido.', trecho: 'Validade até 10/08/2026', gravidade: 'alta' },
  { exigencia: 'Atestado de capacidade técnica', categoria: 'tecnica', situacao: 'nao_comprovado', explicacao: 'Não enviado.', trecho: '', gravidade: 'media' },
  { exigencia: 'Habilitação jurídica', categoria: 'juridica', situacao: 'atende', explicacao: 'ok', trecho: 'contrato social', gravidade: 'baixa' },
]

const textoDoDocumento = (blocos: ReturnType<typeof recursoDeHabilitacao>['documento']['blocos']) =>
  blocos.map((b) => (b.tipo === 'titulo' || b.tipo === 'paragrafo' ? b.texto : b.tipo === 'assinatura' ? b.local : '')).join('\n')

describe('recursoDeHabilitacao', () => {
  it('monta o recurso só com os achados que sustentam a inabilitação', () => {
    const { documento } = recursoDeHabilitacao(dadosDoProponente(empresa), dadosDoCertame(licitacao), 'Concorrente X Ltda', achados, new Date('2026-10-25T12:00:00Z'))
    expect(documento.tipo).toBe('recurso')
    const texto = textoDoDocumento(documento.blocos)
    expect(texto).toContain('Concorrente X Ltda')
    expect(texto).toContain('Regularidade com o FGTS') // nao_atende entra
    expect(texto).toContain('Atestado de capacidade técnica') // nao_comprovado entra
    expect(texto).not.toContain('Habilitação jurídica') // 'atende' fica de fora
    expect(texto).toContain('INABILITAR')
    expect(texto).toContain('art. 165')
    // O trecho citado aparece; o achado sem trecho não inventa citação.
    expect(texto).toContain('Validade até 10/08/2026')
  })

  it('a maior gravidade vem primeiro', () => {
    const { documento } = recursoDeHabilitacao(dadosDoProponente(empresa), dadosDoCertame(licitacao), 'X', achados)
    const texto = textoDoDocumento(documento.blocos)
    expect(texto.indexOf('Regularidade com o FGTS')).toBeLessThan(texto.indexOf('Atestado de capacidade técnica'))
  })

  it('sem nome do concorrente, aponta a pendência', () => {
    const { pendencias } = recursoDeHabilitacao(dadosDoProponente(empresa), dadosDoCertame(licitacao), null, achados)
    expect(pendencias).toContain('nome da empresa concorrente')
  })
})
