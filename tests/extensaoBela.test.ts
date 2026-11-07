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

// @ts-expect-error módulo .mjs puro da extensão, sem tipos
import { chaveLocal, extrairMensagens, lerMensagem } from '../extensao-bela/lib/chat.mjs'

function no(texto: string, filhos: Record<string, string> = {}) {
  return {
    textContent: texto,
    querySelector(s: string) {
      return s in filhos ? { textContent: filhos[s] } : null
    },
  }
}

describe('leitura do chat do pregoeiro', () => {
  it('separa autor e hora quando estão em elementos próprios', () => {
    const el = no('Pregoeiro 10:12 Envie a proposta ajustada', { '.autor': 'Pregoeiro', '.hora': '10:12', '.texto': 'Envie a proposta ajustada' })
    expect(lerMensagem(el, { autor: ['.autor'], hora: ['.hora'], texto: ['.texto'] })).toEqual({ autor: 'Pregoeiro', texto: 'Envie a proposta ajustada', horaNoPortal: '10:12' })
  })

  it('tira o autor do começo do texto ("Pregoeiro: ...") quando não há elemento próprio', () => {
    expect(lerMensagem(no('Pregoeiro: A sessão será suspensa às 12:00'), {})).toEqual({ autor: 'Pregoeiro', texto: 'A sessão será suspensa às 12:00', horaNoPortal: '12:00' })
  })

  it('usa o primeiro seletor de lista que acha mensagens e ignora seletor inválido', () => {
    const raiz = {
      querySelectorAll(s: string) {
        if (s === '::ruim') throw new Error('inválido')
        if (s === '.chat li') return [no('Sistema - Item 1 encerrado'), no('   ')]
        return []
      },
    }
    const ms = extrairMensagens(raiz, { mensagem: ['::ruim', '.vazio', '.chat li'] })
    expect(ms).toEqual([{ autor: 'Sistema', texto: 'Item 1 encerrado', horaNoPortal: null }])
    expect(chaveLocal(ms[0])).toBe('Sistema||Item 1 encerrado')
  })
})

// @ts-expect-error módulo .mjs puro da extensão, sem tipos
import { acharCampoDeLance, formatarValor, preencherLance } from '../extensao-bela/lib/preencher.mjs'

class EventoFalso {
  constructor(public type: string) {}
}

function campoFalso(atributos: { disabled?: boolean } = {}) {
  const eventos: string[] = []
  return {
    tagName: 'INPUT',
    disabled: atributos.disabled ?? false,
    readOnly: false,
    value: '',
    style: {} as Record<string, string>,
    eventos,
    focus() {},
    getClientRects: () => [1],
    dispatchEvent(e: EventoFalso) {
      eventos.push(e.type)
      return true
    },
  }
}

describe('robô etapa 2: preencher o lance (nunca envia)', () => {
  it('formata o valor do jeito que o campo espera', () => {
    expect(formatarValor(179100, 'br')).toBe('179.100,00')
    expect(formatarValor(1234.5, 'digitos')).toBe('123450')
    expect(formatarValor(1234.5, 'ponto')).toBe('1234.50')
    expect(formatarValor(0)).toBeNull()
    expect(formatarValor(Number.NaN)).toBeNull()
  })

  it('escreve no único campo visível e dispara input/change, sem clicar em nada', () => {
    const campo = campoFalso()
    const raiz = { querySelectorAll: (s: string) => (s === 'input.lance' ? [campo] : []) }
    const r = preencherLance(raiz, { valor: 179100, seletores: ['input.x', 'input.lance'], formato: 'br' }, { Event: EventoFalso })
    expect(r).toEqual({ ok: true, texto: '179.100,00', seletor: 'input.lance' })
    expect(campo.value).toBe('179.100,00')
    expect(campo.eventos).toEqual(['input', 'change'])
    expect(campo.eventos).not.toContain('click')
    expect(campo.eventos).not.toContain('submit')
  })

  it('não adivinha quando há vários campos e ignora campo desabilitado', () => {
    const raiz = { querySelectorAll: () => [campoFalso(), campoFalso()] }
    expect(preencherLance(raiz, { valor: 10, seletores: ['input'] }, { Event: EventoFalso })).toEqual({ ok: false, motivo: 'Há 2 campos de lance na tela. Abra só o item da disputa e tente de novo.' })
    const soDesabilitado = { querySelectorAll: () => [campoFalso({ disabled: true })] }
    expect(acharCampoDeLance(soDesabilitado, ['input'])).toBeNull()
    expect(preencherLance(soDesabilitado, { valor: 10, seletores: ['input'] }, { Event: EventoFalso }).ok).toBe(false)
  })
})

// @ts-expect-error módulo .mjs puro da extensão, sem tipos
import { numeroDaLinha, preencherProposta } from '../extensao-bela/lib/proposta.mjs'

function linhaFalsa(texto: string, campo: ReturnType<typeof campoFalso> | null) {
  return {
    textContent: texto,
    querySelector: (s: string) => (s === 'input.preco' ? campo : null),
  }
}

describe('proposta no portal (nunca envia)', () => {
  it('lê o número do item da linha', () => {
    expect(numeroDaLinha(linhaFalsa('Item 3 - Gravador NVR', null), {})).toBe(3)
    expect(numeroDaLinha(linhaFalsa('12 Câmera IP', null), {})).toBe(12)
    expect(numeroDaLinha(linhaFalsa('7', null), {})).toBe(7)
    expect(numeroDaLinha(linhaFalsa('Câmera IP sem número', null), {})).toBeNull()
    expect(numeroDaLinha(linhaFalsa('2026 unidades', null), {})).toBe(2026)
  })

  it('escreve o preço de cada item na linha certa e avisa o que não achou', () => {
    const c1 = campoFalso()
    const c2 = campoFalso()
    const linhas = [linhaFalsa('Item 1 Câmera', c1), linhaFalsa('Item 2 NVR', c2), linhaFalsa('Item 9 Outro', campoFalso())]
    const raiz = { querySelectorAll: (s: string) => (s === 'tr.item' ? linhas : []) }
    const r = preencherProposta(
      raiz,
      { itens: [{ numero: 1, precoUnitario: 850.56 }, { numero: 2, precoUnitario: 2900 }, { numero: 4, precoUnitario: 10 }], seletores: { linha: ['tr.item'], campoDoPreco: ['input.preco'] }, formato: 'br' },
      { Event: EventoFalso }
    )
    expect(r).toEqual({ ok: true, preenchidos: [1, 2], semCampo: [], naoEncontrados: [4], motivo: null })
    expect(c1.value).toBe('850,56')
    expect(c2.value).toBe('2.900,00')
    expect([...c1.eventos, ...c2.eventos]).not.toContain('submit')
  })

  it('sem lista de itens na tela, não faz nada', () => {
    expect(preencherProposta({ querySelectorAll: () => [] }, { itens: [{ numero: 1, precoUnitario: 1 }], seletores: { linha: ['tr'] } }).ok).toBe(false)
  })
})
