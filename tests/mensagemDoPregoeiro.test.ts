import { describe, expect, it } from 'vitest'
import { chaveDaMensagem, citaAEmpresa, classificarMensagem } from '../src/lib/bela/mensagemDoPregoeiro'

const EMPRESA = { cnpj: '12.345.678/0001-90', nomes: ['TORRES TESTE LTDA', 'Torres Teste'] }

describe('mensagem do pregoeiro', () => {
  it('convocação que cita a empresa pelo CNPJ é urgente', () => {
    const m = classificarMensagem('Sr. Fornecedor 12.345.678/0001-90, você foi convocado para enviar anexo no prazo de 2 horas.', EMPRESA)
    expect(m).toEqual({ categoria: 'DOCUMENTO', citaAEmpresa: true, urgente: true })
  })

  it('negociação com a empresa pelo nome é urgente', () => {
    expect(classificarMensagem('Para TORRES TESTE LTDA: é possível negociar um melhor preço para o item 1?', EMPRESA)).toEqual({
      categoria: 'NEGOCIACAO',
      citaAEmpresa: true,
      urgente: true,
    })
  })

  it('convocação de outra empresa não é urgente para nós', () => {
    const m = classificarMensagem('Convoco a empresa 98.765.432/0001-10 a enviar a proposta atualizada.', EMPRESA)
    expect(m.citaAEmpresa).toBe(false)
    expect(m.urgente).toBe(false)
  })

  it('suspensão e retomada da sessão são urgentes para todos', () => {
    expect(classificarMensagem('A sessão será suspensa e retomada amanhã às 9h.', EMPRESA).categoria).toBe('SUSPENSAO')
    expect(classificarMensagem('A sessão será suspensa e retomada amanhã às 9h.', EMPRESA).urgente).toBe(true)
    expect(classificarMensagem('Sessão retomada. Vamos prosseguir com o item 3.', EMPRESA)).toMatchObject({ categoria: 'RETOMADA', urgente: true })
  })

  it('aviso geral não é urgente', () => {
    expect(classificarMensagem('Bom dia a todos, daremos início à fase de lances.', EMPRESA)).toEqual({ categoria: 'AVISO', citaAEmpresa: false, urgente: false })
  })

  it('nome curto ou genérico não casa por acaso', () => {
    expect(citaAEmpresa('As torres de iluminação serão analisadas', { nomes: ['Torres Ltda'] })).toBe(false)
    expect(citaAEmpresa('Empresa TORRES TESTE, aguardamos', EMPRESA)).toBe(true)
  })

  it('a chave ignora espaços extras e muda com o autor ou a hora', () => {
    expect(chaveDaMensagem('Pregoeiro', 'Bom  dia')).toBe(chaveDaMensagem('pregoeiro', 'Bom dia'))
    expect(chaveDaMensagem('Pregoeiro', 'Bom dia')).not.toBe(chaveDaMensagem('Sistema', 'Bom dia'))
    expect(chaveDaMensagem('Pregoeiro', 'Ok', '10:01')).not.toBe(chaveDaMensagem('Pregoeiro', 'Ok', '10:05'))
  })
})
