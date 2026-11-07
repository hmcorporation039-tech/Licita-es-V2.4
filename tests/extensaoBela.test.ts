import { describe, expect, it } from 'vitest'
// @ts-expect-error módulo .mjs puro da extensão, sem tipos
import { extrairMelhorLance, lerValorEmReais } from '../extensao-bela/lib/valor.mjs'

describe('lerValorEmReais', () => {
  it('lê moeda brasileira com R$, pontos de milhar e vírgula decimal', () => {
    expect(lerValorEmReais('R$ 180.000,00')).toBe(180000)
    expect(lerValorEmReais('1.234.567,89')).toBe(1234567.89)
    expect(lerValorEmReais('R$1.000')).toBe(1000)
    expect(lerValorEmReais('950,50')).toBe(950.5)
  })

  it('aceita espaço comum e espaço rígido', () => {
    expect(lerValorEmReais('R$  2.500,00')).toBe(2500)
  })

  it('devolve null para vazio, zero ou lixo', () => {
    expect(lerValorEmReais(null)).toBeNull()
    expect(lerValorEmReais('')).toBeNull()
    expect(lerValorEmReais('—')).toBeNull()
    expect(lerValorEmReais('R$ 0,00')).toBeNull()
  })
})

function raizFalsa(mapa: Record<string, string | null>) {
  return {
    querySelector(seletor: string) {
      if (!(seletor in mapa)) return null
      const texto = mapa[seletor]
      return texto === null ? null : { textContent: texto }
    },
  }
}

describe('extrairMelhorLance', () => {
  it('usa o primeiro seletor que tem valor válido', () => {
    const raiz = raizFalsa({ '#novo': null, '.melhor-lance': 'R$ 179.100,00' })
    expect(extrairMelhorLance(raiz, ['#novo', '.melhor-lance'])).toEqual({
      valor: 179100,
      seletor: '.melhor-lance',
    })
  })

  it('pula seletor sem elemento ou sem número', () => {
    const raiz = raizFalsa({ '#vazio': 'aguardando', '.ok': 'R$ 1.000,00' })
    expect(extrairMelhorLance(raiz, ['#ausente', '#vazio', '.ok'])).toEqual({
      valor: 1000,
      seletor: '.ok',
    })
  })

  it('devolve null quando nenhum seletor casa', () => {
    const raiz = raizFalsa({ '.x': 'sem valor' })
    expect(extrairMelhorLance(raiz, ['.x', '.y'])).toBeNull()
  })

  it('tolera seletor inválido sem quebrar', () => {
    const raiz = {
      querySelector(s: string) {
        if (s === '::ruim') throw new Error('seletor inválido')
        return { textContent: 'R$ 500,00' }
      },
    }
    expect(extrairMelhorLance(raiz, ['::ruim', '.bom'])).toEqual({ valor: 500, seletor: '.bom' })
  })
})

// @ts-expect-error módulo .mjs puro da extensão, sem tipos
import { capturarEstrutura, mascarar } from '../extensao-bela/lib/captura.mjs'
// @ts-expect-error módulo .mjs puro da extensão, sem tipos
import { portalDoHost } from '../extensao-bela/config.mjs'

type NoFalso = { nodeType: number; textContent: string }
function el(tagName: string, opcoes: { id?: string; className?: string; attrs?: Record<string, string>; texto?: string; value?: string } = {}) {
  const attrs = opcoes.attrs ?? {}
  return {
    tagName,
    id: opcoes.id ?? '',
    className: opcoes.className ?? '',
    value: opcoes.value,
    parentElement: null as unknown,
    childNodes: (opcoes.texto ? [{ nodeType: 3, textContent: opcoes.texto }] : []) as NoFalso[],
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    getAttribute: (n: string) => attrs[n] ?? null,
  }
}

describe('captura da tela da disputa', () => {
  const sala = el('DIV', { id: 'sala-disputa', className: 'painel' })
  const elementos = [
    sala,
    el('SPAN', { className: 'melhor-lance valor', texto: 'R$ 179.100,00' }),
    el('SPAN', { id: 'tempo-restante', texto: '00:01:45' }),
    el('SPAN', { className: 'fornecedor', texto: 'Empresa X, CNPJ 12.345.678/0001-90, contato joao@empresa.com.br' }),
    el('INPUT', { attrs: { formcontrolname: 'valorLance', type: 'text' }, value: '178.000,00' }),
    el('BUTTON', { className: 'btn-enviar', texto: 'Enviar lance' }),
    el('SCRIPT', { texto: 'lance = 1' }),
    el('P', { texto: 'Rodapé institucional' }),
  ]
  for (const e of elementos.slice(1)) e.parentElement = sala
  const documento = { title: 'Sala de disputa', location: { origin: 'https://cnetmobile.estaleiro.serpro.gov.br', pathname: '/comprasnet-web/disputa' }, querySelectorAll: () => elementos }

  it('guarda os elementos da disputa (lance, tempo, campo, botão) e deixa de fora o resto', () => {
    const c = capturarEstrutura(documento)
    expect(c.pagina).toBe('https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/disputa')
    const resumo = c.elementos.map((e: { tag: string; id?: string; classes?: string[]; texto?: string }) => e.id ?? e.classes?.[0] ?? e.tag)
    expect(resumo).toEqual(['sala-disputa', 'melhor-lance', 'tempo-restante', 'fornecedor', 'input', 'btn-enviar'])
    expect(c.elementos[1].caminho).toBe('div#sala-disputa > span.melhor-lance')
  })

  it('mascara CNPJ, CPF e e-mail e nunca lê o valor digitado no campo', () => {
    const c = capturarEstrutura(documento)
    expect(c.elementos[3].texto).toBe('Empresa X, CNPJ [cnpj], contato [e-mail]')
    expect(JSON.stringify(c)).not.toContain('178.000,00')
    expect(mascarar('CPF 123.456.789-09')).toBe('CPF [cpf]')
  })

  it('também guarda o chat do pregoeiro (para o monitor do chat), mascarando CNPJ', () => {
    const chat = el('DIV', { className: 'chat-pregoeiro' })
    const msg = el('P', { className: 'texto', texto: 'Pregoeiro: convoco a empresa 12.345.678/0001-90 a enviar anexo em 2 horas' })
    msg.parentElement = chat
    const outro = el('P', { texto: 'Rodapé institucional' })
    const doc = { title: 'Sala', location: { origin: 'https://cnetmobile.estaleiro.serpro.gov.br', pathname: '/x' }, querySelectorAll: () => [chat, msg, outro] }
    const c = capturarEstrutura(doc)
    expect(c.elementos.map((e: { classes?: string[] }) => e.classes?.[0])).toEqual(['chat-pregoeiro', 'texto'])
    expect(c.elementos[1].texto).toBe('Pregoeiro: convoco a empresa [cnpj] a enviar anexo em 2 horas')
  })

  it('a sala de disputa do Comprasnet 4.0 (estaleiro.serpro.gov.br) é reconhecida como Compras.gov.br', () => {
    expect(portalDoHost('cnetmobile.estaleiro.serpro.gov.br')?.nome).toBe('Compras.gov.br')
    expect(portalDoHost('exemplo.com.br')).toBeNull()
  })
})
