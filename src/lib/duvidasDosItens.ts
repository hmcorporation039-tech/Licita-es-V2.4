// ============================================================
// lib/duvidasDosItens.ts — Dúvidas que valem um pedido de esclarecimento,
// achadas na lista de itens: material vendido a metro (cabo, eletroduto,
// mangueira…) cadastrado como "Unidade". Sem saber se a unidade é 1 metro ou
// 1 rolo, ninguém consegue cotar, e preço acima do estimado desclassifica.
// Sem rede e sem banco: só regras sobre o texto do item.
// ============================================================

export interface ItemParaDuvida {
  numero: number | null
  descricao: string
  unidade: string | null
  valorUnitario: number | null
}

export interface DuvidaDoItem {
  numero: number | null
  motivo: string
  pergunta: string
}

export const MAX_DUVIDAS_SUGERIDAS = 8

// Unidade que não diz a medida: "Unidade", "UN", "Und", "Peça"…
const UNIDADE_GENERICA = /^\s*(un|und|unid|unidade|unidades|pe[cç]a|pe[cç]as|p[cç]|pc|item)\.?\s*$/i
// Unidade que já diz a medida: aí não há dúvida.
const UNIDADE_COM_MEDIDA = /\b(m|mt|mts|metro|metros|rolo|rolos|bobina|bobinas|kg|caixa|cx|pacote|pct|barra|br|lance)\b/i

// Material que costuma ser vendido por metro ou em rolo/bobina.
const MATERIAL_LINEAR = /\b(cabo|cabos|fio|fios|cordoalha|eletroduto|kanaduto|duto|mangueira|tubo|tubos|corda|cordas|tela|lona|corrente)\b/i
// Cabo e fio sem nenhum comprimento na descrição: rolo de 100 m? metro?
const CABO_OU_FIO = /\b(cabo|cabos|fio|fios|cordoalha|mangueira)\b/i
// "comprimento: 100", "comprimento nominal 50 m", "rolo com 100 m", "bobina de 500m"
// Acessório de cabo/duto (terminal, conector, caixa…): a unidade é a peça.
const ACESSORIO = /\b(terminal|terminais|conector|conectores|prensa|abra[cç]adeira|emenda|luva|adaptador|curva|suporte|base|caixa|tampa|capa|ponteira|isolador|chave|disjuntor|rel[eé]|fita|alicate|ferramenta)\b/i
const COMPRIMENTO = /\b(?:comprimento(?:\s+nominal)?|rolo|bobina)\s*(?:[:=]|com|de)?\s*(\d{1,5}(?:[.,]\d+)?)\s*(m|metros?|mm)?\b/i

// Nome do item: no catálogo do governo vem "Cabo Elétrico Flexível seção nominal: 6",
// com o nome em Maiúsculas e os atributos em minúsculas. Fica com o nome.
const resumo = (descricao: string) => {
  const t = descricao.replace(/\s+/g, ' ').trim()
  const antesDosAtributos = t.split(':')[0]
  const palavras = antesDosAtributos.split(' ')
  const nome: string[] = []
  for (const p of palavras) {
    if (nome.length > 0 && /^\p{Ll}/u.test(p)) break
    nome.push(p)
  }
  let curto = t.includes(':') && nome.length < palavras.length ? nome.join(' ') : t.split(/\s+(?:\S+:\s)/)[0] || t
  curto = curto.length > 70 ? `${curto.slice(0, 70).trim()}…` : curto
  return curto.replace(/[,;:.]\s*$/, '')
}

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function rotuloDoItem(item: ItemParaDuvida): string {
  return `${item.numero !== null ? `Item ${item.numero}` : 'Item'} (${resumo(item.descricao)})`
}

function valorDoItem(item: ItemParaDuvida): string {
  return item.valorUnitario !== null && item.valorUnitario > 0 ? `, e a qual delas corresponde o valor unitário estimado de ${reais(item.valorUnitario)}` : ''
}

export function duvidaDoItem(item: ItemParaDuvida): DuvidaDoItem | null {
  const unidade = (item.unidade ?? '').trim()
  if (unidade && !UNIDADE_GENERICA.test(unidade)) return null
  if (unidade && UNIDADE_COM_MEDIDA.test(unidade)) return null
  const descricao = item.descricao.replace(/\s+/g, ' ')
  const nome = resumo(descricao)
  if (!MATERIAL_LINEAR.test(nome) || ACESSORIO.test(nome)) return null
  const unidadeNoTexto = unidade ? `"${unidade}"` : 'não informada'

  const comprimento = descricao.match(COMPRIMENTO)
  if (comprimento) {
    const valor = Number(comprimento[1].replace(',', '.'))
    const emMm = (comprimento[2] ?? '').toLowerCase() === 'mm'
    const metros = emMm ? valor / 1000 : valor
    if (!(metros >= 2)) return null // barra curta ou peça: a unidade é a peça mesmo
    const medida = `${comprimento[1]}${comprimento[2] ? ` ${comprimento[2]}` : ''}`
    return {
      numero: item.numero,
      motivo: `Unidade ${unidadeNoTexto}, mas a descrição fala em comprimento de ${medida}.`,
      pergunta: `${rotuloDoItem(item)}: a unidade de fornecimento está como ${unidadeNoTexto}, mas a descrição indica comprimento de ${medida}. Solicita-se esclarecer se cada unidade corresponde a 1 (um) metro ou a 1 (uma) peça/rolo de ${medida}${valorDoItem(item)}.`,
    }
  }

  if (CABO_OU_FIO.test(nome)) {
    return {
      numero: item.numero,
      motivo: `Cabo/fio com unidade ${unidadeNoTexto}, sem dizer se é metro ou rolo.`,
      pergunta: `${rotuloDoItem(item)}: a unidade de fornecimento está como ${unidadeNoTexto}, sem indicação de comprimento. Solicita-se esclarecer se cada unidade corresponde a 1 (um) metro ou a 1 (um) rolo, e de quantos metros${valorDoItem(item)}.`,
    }
  }
  return null
}

export function duvidasDosItens(itens: ItemParaDuvida[]): DuvidaDoItem[] {
  const duvidas: DuvidaDoItem[] = []
  for (const item of itens) {
    const d = duvidaDoItem(item)
    if (d) duvidas.push(d)
    if (duvidas.length >= MAX_DUVIDAS_SUGERIDAS) break
  }
  return duvidas
}
