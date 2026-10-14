import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { montarPacoteDeHabilitacao } from '../src/lib/pacoteDeHabilitacao'
import type { RequisitoAvaliado } from '../src/lib/habilitacao'

const requisito = (o: Partial<RequisitoAvaliado>): RequisitoAvaliado => ({
  id: 'x',
  label: 'Certidão',
  section: 'Regularidade Fiscal',
  origem: 'padrao',
  status: 'verde',
  motivo: '',
  acao: null,
  documento: null,
  citadoNoEdital: [],
  ...o,
})

describe('montarPacoteDeHabilitacao', () => {
  const pdf = new Uint8Array([37, 80, 68, 70])
  const cnd = requisito({ id: 'cnd', label: 'CND Federal', documento: { id: 'd1', nome: 'CND', dataValidade: null } })
  const fgts = requisito({ id: 'fgts', label: 'CRF do FGTS', documento: { id: 'd2', nome: 'FGTS', dataValidade: null } })
  const cndt = requisito({ id: 'cndt', label: 'CNDT', status: 'vermelho' })

  it('inclui o dossiê, os arquivos por seção e um LEIA-ME com o que falta', () => {
    const zip = unzipSync(montarPacoteDeHabilitacao(pdf, [cnd, fgts, cndt], [{ documentId: 'd1', nomeArquivo: 'cnd.pdf', conteudo: new Uint8Array([1, 2, 3]) }]))
    const nomes = Object.keys(zip)
    expect(nomes).toContain('dossie-da-licitacao.pdf')
    expect(nomes).toContain('documentos/Regularidade Fiscal/01 - CND Federal - cnd.pdf')
    const leiaMe = strFromU8(zip['LEIA-ME.txt'])
    expect(leiaMe).toContain('[incluído] CND Federal')
    expect(leiaMe).toContain('[sem arquivo] CRF do FGTS')
    expect(leiaMe).toContain('[falta] CNDT')
  })

  it('não repete o mesmo arquivo usado em duas exigências', () => {
    const outro = requisito({ id: 'outro', label: 'Outra exigência', documento: { id: 'd1', nome: 'CND', dataValidade: null } })
    const zip = unzipSync(montarPacoteDeHabilitacao(pdf, [cnd, outro], [{ documentId: 'd1', nomeArquivo: 'cnd.pdf', conteudo: new Uint8Array([1]) }]))
    expect(Object.keys(zip).filter((n) => n.startsWith('documentos/'))).toHaveLength(1)
  })
})
