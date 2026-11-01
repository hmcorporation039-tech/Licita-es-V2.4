import { describe, expect, it } from 'vitest'
import {
  contratacaoDoEdital,
  lerDiasDeMobilizacao,
  lerQuantidadeDeLocais,
  lerServicoContinuo,
  lerSubcontratacao,
  lerVigenciaEmMeses,
  lerVisitasPorAno,
  lerVistoria,
  propostaPorItemJulgamentoPorGrupo,
} from '../src/lib/contratacaoDoEdital'
import { ANALYSIS_SCHEMA, CAMPOS_DA_CONTRATACAO, validarResultadoAnalise } from '../src/services/llm/types'

describe('leitura dos campos de contratação', () => {
  it('vigência em meses, pela primeira menção', () => {
    expect(lerVigenciaEmMeses('5 (cinco) anos, prorrogável até o limite de 10 anos')).toBe(60)
    expect(lerVigenciaEmMeses('12 (doze) meses')).toBe(12)
    expect(lerVigenciaEmMeses('1 ano')).toBe(12)
    expect(lerVigenciaEmMeses('não especificado no edital')).toBeNull()
    expect(lerVigenciaEmMeses('até o fim do exercício')).toBeNull()
  })

  it('serviço contínuo pelo Sim/Não do começo', () => {
    expect(lerServicoContinuo('Sim — locação de torres por 5 anos')).toBe(true)
    expect(lerServicoContinuo('Não — fornecimento único')).toBe(false)
    expect(lerServicoContinuo('talvez')).toBeNull()
  })

  it('mobilização: um prazo, meses em dias, e etapas encadeadas a partir da OS', () => {
    expect(lerDiasDeMobilizacao('em até 30 (trinta) dias após a assinatura')).toBe(30)
    expect(lerDiasDeMobilizacao('2 meses')).toBe(60)
    expect(
      lerDiasDeMobilizacao('Ordem de Serviço emitida em até 75 (setenta e cinco) dias da assinatura; disponibilização em 120 (cento e vinte) dias corridos contados da data da emissão da Ordem de Serviço'),
    ).toBe(195)
    expect(lerDiasDeMobilizacao('10 dias para o lote 1 e 20 dias para o lote 2')).toBeNull()
  })

  it('visitas por ano somam as periodicidades ou leem o número explícito', () => {
    expect(lerVisitasPorAno('zeladoria quadrimestral e manutenção preventiva anual')).toEqual({ visitas: 4, partes: ['quadrimestral', 'anual'] })
    expect(lerVisitasPorAno('Manutenções mensais')).toEqual({ visitas: 12, partes: ['mensal'] })
    expect(lerVisitasPorAno('6 (seis) visitas por ano')).toEqual({ visitas: 6, partes: ['6 por ano'] })
    expect(lerVisitasPorAno('não se aplica')).toBeNull()
  })

  it('quantidade de locais', () => {
    expect(lerQuantidadeDeLocais('22 sítios (itens 1 a 22)')).toBe(22)
    expect(lerQuantidadeDeLocais('3 unidades: sede, anexo e almoxarifado')).toBe(3)
    expect(lerQuantidadeDeLocais('1 local')).toBe(1)
    expect(lerQuantidadeDeLocais('na sede do órgão')).toBeNull()
  })

  it('julgamento por grupo com proposta por item, subcontratação e vistoria', () => {
    expect(propostaPorItemJulgamentoPorGrupo('propostas por item no Comprasnet; julgamento pelo menor preço por grupo')).toBe(true)
    expect(propostaPorItemJulgamentoPorGrupo('menor preço por item')).toBe(false)
    expect(lerSubcontratacao('É vedada a subcontratação do objeto.')).toBe('vedada')
    expect(lerSubcontratacao('Vedada a subcontratação da parcela principal; admitida até 30% dos serviços acessórios')).toBe('parcial')
    expect(lerSubcontratacao('não mencionada')).toBeNull()
    expect(lerVistoria('Vistoria obrigatória, agendada com 2 dias de antecedência')).toBe('obrigatoria')
    expect(lerVistoria('Facultativa; pode ser substituída por declaração')).toBe('facultativa')
  })
})

describe('contratacaoDoEdital: sugestão para o estudo', () => {
  const analise = {
    vigenciaContrato: '5 (cinco) anos',
    servicoContinuo: 'Sim — locação de espaço em torres',
    inicioDaExecucao: 'em até 75 dias da assinatura',
    formaDeJulgamento: 'propostas por item; menor preço por grupo',
    metodoDoPrecoEstimado: 'mediana de contratações similares e pesquisa com fornecedores',
    subcontratacao: 'É vedada a subcontratação.',
    periodicidadeDeManutencao: 'zeladoria quadrimestral e preventiva anual',
    locaisDeExecucao: '22 sítios',
    visitaTecnica: 'não exigida',
  }

  it('serviço contínuo de 60 meses, 3 sem faturar, e as viagens de manutenção', () => {
    const c = contratacaoDoEdital(analise)!
    expect(c.sugestao.contrato).toEqual({ tipo: 'continuo', vigenciaMeses: 60, mesesSemFaturar: 3 }) // 75 dias ≈ 2,5 → 3 meses
    // 4 visitas/ano × 57 meses faturados = 19 por sítio × 22 sítios.
    expect(c.sugestao.viagens).toBe(418)
    expect(c.sugestao.explicacao.join(' ')).toContain('quadrimestral + anual = até 4 por ano × 57 meses × 22 locais = 418 viagens')
    expect(c.julgamentoPorGrupo).toBe(true)
    expect(c.subcontratacao).toBe('vedada')
    expect(c.textos.map((t) => t.rotulo)).toContain('Como o preço foi estimado')
  })

  it('compra única não sugere viagens de manutenção', () => {
    const c = contratacaoDoEdital({ ...analise, servicoContinuo: 'Não — aquisição de equipamentos' })!
    expect(c.sugestao.contrato?.tipo).toBe('unico')
    expect(c.sugestao.viagens).toBeNull()
  })

  it('análise antiga, sem os campos, não sugere nada', () => {
    expect(contratacaoDoEdital({})).toBeNull()
    expect(contratacaoDoEdital(null)).toBeNull()
  })
})

describe('esquema da análise', () => {
  it('os campos de contratação estão no esquema, obrigatórios, e passam pela validação', () => {
    for (const c of CAMPOS_DA_CONTRATACAO) {
      expect(ANALYSIS_SCHEMA.properties).toHaveProperty(c)
      expect(ANALYSIS_SCHEMA.required).toContain(c)
    }
    const r = validarResultadoAnalise({ vigenciaContrato: '12 meses', subcontratacao: 42 })
    expect(r.vigenciaContrato).toBe('12 meses')
    expect(r.subcontratacao).toBe('')
  })
})
