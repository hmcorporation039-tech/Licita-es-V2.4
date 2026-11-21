import { describe, expect, it } from 'vitest'
import { DOCUMENT_TYPE_OPTIONS } from '../web/src/lib/documentTypes'
import { PASSOS_DO_PREPARO, linkParaCadastrarNoCofre, resumoDoPreparo, situacaoDoDocumento } from '../web/src/lib/prepararEmpresa'
import { interpretarPedidoDeNavegacao } from '../web/src/lib/pedidoDeNavegacao'

const agora = new Date('2026-11-21T12:00:00Z')

describe('Preparar a empresa', () => {
  it('todo passo que vai pro cofre usa um código que o cofre conhece', () => {
    const codigos = new Set(DOCUMENT_TYPE_OPTIONS.map((o) => o.value))
    for (const p of PASSOS_DO_PREPARO.filter((x) => x.vaiProCofre)) expect(codigos.has(p.id)).toBe(true)
  })

  it('site oficial só em https e em domínio do governo', () => {
    for (const p of PASSOS_DO_PREPARO) {
      if (!p.site) continue
      const url = new URL(p.site.url)
      expect(url.protocol).toBe('https:')
      expect(url.hostname.endsWith('.gov.br') || url.hostname.endsWith('.jus.br')).toBe(true)
    }
  })

  it('situação pela validade: falta, pronto, vencendo, vencido; sem validade não vence', () => {
    expect(situacaoDoDocumento('cndt', [], agora)).toBe('falta')
    expect(situacaoDoDocumento('cndt', [{ tipo: 'cndt', dataValidade: '2027-03-01' }], agora)).toBe('pronto')
    expect(situacaoDoDocumento('cndt', [{ tipo: 'cndt', dataValidade: '2026-11-30' }], agora)).toBe('vencendo')
    expect(situacaoDoDocumento('cndt', [{ tipo: 'cndt', dataValidade: '2026-11-21' }], agora)).toBe('vencendo')
    expect(situacaoDoDocumento('cndt', [{ tipo: 'cndt', dataValidade: '2026-11-20' }], agora)).toBe('vencido')
    expect(situacaoDoDocumento('contrato-social', [{ tipo: 'contrato-social', dataValidade: null }], agora)).toBe('pronto')
    // Vale a que vence por último.
    expect(
      situacaoDoDocumento('cndt', [{ tipo: 'cndt', dataValidade: '2026-01-01' }, { tipo: 'cndt', dataValidade: '2027-03-01' }], agora),
    ).toBe('pronto')
  })

  it('resumo conta só os documentos e aponta o próximo que falta', () => {
    const r = resumoDoPreparo([{ tipo: 'cartao-cnpj', dataValidade: null }], agora)
    expect(r.prontos).toBe(1)
    expect(r.documentos).toBe(PASSOS_DO_PREPARO.filter((p) => p.vaiProCofre).length)
    expect(r.proximo).toBe('contrato-social')
  })

  it('o link do cofre abre o formulário com o documento', () => {
    expect(linkParaCadastrarNoCofre('crf-fgts')).toBe('/empresa?documento=crf-fgts#cadastrar-documento')
  })
})

describe('Bela: "me leva para…"', () => {
  const href = (t: string) => interpretarPedidoDeNavegacao(t)?.href ?? null

  it('como tirar uma certidão leva à explicação dela', () => {
    expect(href('como eu tiro a certidão do FGTS?')).toBe('/preparar#crf-fgts')
    expect(href('onde emito a certidão trabalhista')).toBe('/preparar#cndt')
    expect(href('como tirar a certidão federal')).toBe('/preparar#cnd-federal')
    expect(href('como faço o cadastro no SICAF')).toBe('/preparar#sicaf')
    expect(href('certidão de falência')).toBe('/preparar#cnd-falencia')
  })

  it('cadastrar um documento abre o cofre já nele', () => {
    expect(href('quero cadastrar a certidão do FGTS')).toBe('/empresa?documento=crf-fgts#cadastrar-documento')
    expect(href('anexar o cartão cnpj')).toBe('/empresa?documento=cartao-cnpj#cadastrar-documento')
  })

  it('telas do sistema', () => {
    expect(href('me leva para o cofre')).toBe('/empresa#cadastrar-documento')
    expect(href('abre meus itens')).toBe('/items')
    expect(href('quero ver as minhas salvas')).toBe('/salvas')
    expect(href('mostra as que você achou pra mim')).toBe('/matches')
    expect(href('falar com uma pessoa do suporte')).toBe('/suporte')
    expect(href('suporte')).toBe('/suporte')
    expect(href('o que eu preciso para participar')).toBe('/preparar')
    expect(href('vai para o painel')).toBe('/dashboard')
  })

  it('busca de licitação continua sendo busca', () => {
    expect(href('licitação de estrutura metálica no DF')).toBeNull()
    expect(href('quero ver licitações de limpeza em Goiânia')).toBeNull()
    expect(href('material de escritório em São Paulo acima de 50 mil')).toBeNull()
    expect(href('câmeras de segurança')).toBeNull()
    expect(href('quero câmeras de segurança no plano piloto')).toBeNull()
    expect(href('obras de pavimentação em GO')).toBeNull()
    expect(href('serviço de atendimento ao cidadão')).toBeNull()
    expect(href('preciso de uniformes para a prefeitura')).toBeNull()
  })
})
