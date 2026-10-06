// ============================================================
// Dossiê em PDF (papel timbrado do Monitor de Licitações + habilitação + exigências) e CEP.
// Se DOSSIE_PDF_AMOSTRA apontar para um arquivo, grava o PDF gerado ali para conferência visual.
// ============================================================

import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { gerarPdfDoEstudo, EntradaDoPdf } from '../src/services/estudoPdf'
import { avaliarHabilitacao } from '../src/lib/habilitacao'
import { buildChecklistTemplate } from '../src/lib/checklistTemplate'
import { dadosIniciais, calcularEstudo } from '../src/lib/estudoDeCustos'
import { CepIndisponivelError, CepNaoEncontradoError, consultarCep, limparCacheDeCep, montarEndereco, normalizarCep } from '../src/lib/cep'

describe('CEP', () => {
  it('normaliza e valida o CEP', () => {
    expect(normalizarCep('74.000-000')).toBe('74000000')
    expect(normalizarCep('7400')).toBeNull()
    expect(normalizarCep('74000-0000')).toBeNull()
  })

  it('usa o ViaCEP e guarda em cache', async () => {
    limparCacheDeCep()
    let chamadas = 0
    const buscar = async (url: string) => {
      chamadas++
      expect(url).toBe('https://viacep.com.br/ws/74000000/json/')
      return { logradouro: 'Rua das Flores', bairro: 'Centro', localidade: 'Goiânia', uf: 'GO', complemento: '' }
    }
    const e = await consultarCep('74000-000', buscar)
    expect(e).toEqual({ cep: '74000000', logradouro: 'Rua das Flores', complemento: '', bairro: 'Centro', cidade: 'Goiânia', uf: 'GO' })
    await consultarCep('74000000', buscar)
    expect(chamadas).toBe(1)
  })

  it('se o ViaCEP cair, usa a BrasilAPI', async () => {
    limparCacheDeCep()
    const buscar = async (url: string) => {
      if (url.includes('viacep')) throw new Error('fora do ar')
      return { street: 'Av. Brasil', neighborhood: 'Jardim', city: 'Anápolis', state: 'go' }
    }
    expect((await consultarCep('75000000', buscar)).cidade).toBe('Anápolis')
  })

  it('CEP inexistente e serviços fora do ar têm erros diferentes', async () => {
    limparCacheDeCep()
    await expect(consultarCep('99999999', async () => ({ erro: true }))).rejects.toBeInstanceOf(CepNaoEncontradoError)
    await expect(consultarCep('99999998', async () => null)).rejects.toBeInstanceOf(CepNaoEncontradoError)
    await expect(
      consultarCep('99999997', async () => {
        throw new Error('timeout')
      })
    ).rejects.toBeInstanceOf(CepIndisponivelError)
    await expect(consultarCep('123', async () => ({}))).rejects.toBeInstanceOf(CepNaoEncontradoError)
  })

  it('monta o endereço em uma linha só com o que estiver preenchido', () => {
    expect(
      montarEndereco({ endereco: 'Rua das Flores', enderecoNumero: '120', enderecoComplemento: 'Sala 2', enderecoBairro: 'Centro', enderecoCidade: 'Goiânia', enderecoUf: 'GO', cep: '74000000' })
    ).toBe('Rua das Flores, 120 - Sala 2 - Centro - Goiânia/GO - CEP 74000-000')
    expect(montarEndereco({ endereco: null, enderecoCidade: 'Goiânia', enderecoUf: 'GO' })).toBe('Goiânia/GO')
    expect(montarEndereco({})).toBeNull()
  })
})

describe('PDF do dossiê', () => {
  function entrada(comDossie: boolean): EntradaDoPdf {
    const itens = [{ id: 'i1', numero: 1, descricao: 'Cadeira de escritório giratória', unidade: 'UN', quantidade: 20, valorEstimadoUnit: 400, codigoCatalogo: '150227' }]
    const dados = dadosIniciais()
    dados.itens = { i1: { custoUnit: 250, precoVendaUnit: 380 } }
    const resultado = calcularEstudo(itens, dados, { distanciaLinhaRetaKm: 200, valorEstimadoTotal: 8000 })
    const habilitacao = avaliarHabilitacao({
      checklist: buildChecklistTemplate(),
      documentos: [
        { id: 'd1', nome: 'Contrato social consolidado', tipo: 'contrato-social', dataValidade: null },
        { id: 'd2', nome: 'CND federal', tipo: 'cnd-federal', dataValidade: new Date('2026-10-30T12:00:00Z') },
        { id: 'd3', nome: 'CRF FGTS', tipo: 'crf-fgts', dataValidade: new Date('2026-12-30T12:00:00Z') },
      ],
      documentosExigidosIA: ['Atestado de capacidade técnica', 'Certidão negativa de falência'],
      sessao: new Date('2026-11-10T13:00:00Z'),
      agora: new Date('2026-10-05T12:00:00Z'),
    })
    return {
      empresa: { nome: 'Construtora São João Ltda', documento: '12.345.678/0001-90', base: 'Goiânia/GO' },
      dossie: comDossie
        ? {
            analisada: true,
            condicoes: [
              { rotulo: 'Resumo', valor: 'Aquisição de cadeiras ≥ 20 unidades • entrega parcelada' },
              { rotulo: 'Garantia da proposta', valor: '1% do valor estimado' },
            ],
            habilitacao,
            exigencias: [
              { texto: 'Apresentar atestado de capacidade técnica', categoria: 'tecnica', responsavel: 'fiscal', documento: 'Edital', pagina: '12', atendida: false, nota: null, verificacao: 'confirmado' },
              { texto: 'Declaração de que não emprega menores', categoria: 'juridica', responsavel: 'redator', documento: 'Anexo II', pagina: '30', atendida: true, nota: 'assinada', verificacao: 'confirmado' },
            ],
            exigenciasTecnicas: ['Cadeira com certificação NR-17'],
            riscos: [{ titulo: 'Prazo curto', descricao: 'Entrega em 10 dias.', severidade: 'alta' }],
            alertas: [],
          }
        : null,
      licitacao: { objeto: 'Aquisição de cadeiras', orgao: 'Prefeitura de Anápolis', local: 'Anápolis/GO', modalidade: 'PREGAO_ELETRONICO', fonte: 'PNCP', numeroControle: '1-2026', valorEstimado: 8000, sessaoEm: new Date('2026-11-10T13:00:00Z'), linkEdital: null },
      itens,
      dados,
      resultado,
      geradoEm: new Date('2026-10-05T15:00:00Z'),
      geradoPor: 'Márcio',
    }
  }

  it('gera o PDF com o papel timbrado do Monitor, habilitação e exigências, sem quebrar com caracteres fora do Latin-1', async () => {
    const pdf = await gerarPdfDoEstudo(entrada(true))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    if (process.env.DOSSIE_PDF_AMOSTRA) writeFileSync(process.env.DOSSIE_PDF_AMOSTRA, pdf)
    expect(pdf.length).toBeGreaterThan(5000)
  })

  it('funciona sem dossiê (só o estudo de custos)', async () => {
    const pdf = await gerarPdfDoEstudo(entrada(false))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
