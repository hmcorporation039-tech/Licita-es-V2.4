// ============================================================
// lib/subcontratacao.ts — O contrato deixa o ganhador subcontratar?
// Lei 14.133/2021, art. 122: o contratado só pode subcontratar partes da obra,
// do serviço ou do fornecimento até o limite autorizado no edital ou no contrato.
// Aqui procuramos essa regra no texto do edital / termo de referência / minuta,
// sem IA: frases com "subcontrat…" classificadas por expressões simples, com
// cuidado com negação ("não será admitida"), com proibição só do TODO ("não poderá
// subcontratar, no todo, o objeto" — a parcial continua possível) e com frases que só
// citam a palavra (impedimentos, "caso permitida a subcontratação", responsabilidade).
// Sem rede e sem banco.
// ============================================================

export type SituacaoDaSubcontratacao = 'permite' | 'proibe' | 'nao_encontrei'

export interface RegraDeSubcontratacao {
  situacao: SituacaoDaSubcontratacao
  /** Trecho do documento que decidiu (≤ 400 caracteres), como está no arquivo. */
  trecho: string | null
  /** Limite da parte subcontratável, quando o texto diz ("até 30%"). */
  limite: string | null
  /** Partes que o edital lista como subcontratáveis, quando lista. */
  parcelas: string | null
  /** Nome do documento onde estava a regra. */
  documento: string | null
}

export interface TextoDeDocumento {
  nome: string
  texto: string
}

export const MAX_TRECHO = 400
const MAX_PARCELAS = 300

// ---------- Texto normalizado com mapa para o original ----------

interface TextoMapeado {
  /** minúsculo, sem acento, espaços colapsados */
  texto: string
  /** posição no original de cada caractere de `texto` */
  mapa: number[]
}

/** Normaliza (minúsculas, sem acento, espaço único) guardando onde cada caractere estava no original. */
export function normalizarComMapa(original: string): TextoMapeado {
  let texto = ''
  const mapa: number[] = []
  let emEspaco = false
  for (let i = 0; i < original.length; i++) {
    const c = original[i]
    // Palavra quebrada no fim da linha do PDF: "subcon-\ntratação".
    if (c === '-' && /[A-Za-zÀ-ÿ]/.test(original[i - 1] ?? '') && /^-[ \t]*\r?\n[ \t]*[a-zà-ÿ]/.test(original.slice(i, i + 8))) {
      const pulo = original.slice(i).match(/^-[ \t]*\r?\n[ \t]*/)
      i += (pulo?.[0].length ?? 1) - 1
      continue
    }
    if (/\s/.test(c)) {
      if (!emEspaco && texto.length > 0) {
        texto += ' '
        mapa.push(i)
      }
      emEspaco = true
      continue
    }
    emEspaco = false
    const n = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    for (const ch of n) {
      texto += ch
      mapa.push(i)
    }
  }
  return { texto, mapa }
}

// ---------- Frases ----------

// Fim de frase: ponto/ponto e vírgula seguido de espaço, exceto em abreviações ("art. 122", "nº. 5").
const ABREVIACAO = /\b(art|arts|inc|incs|n|no|nº|al|par|cf|ex|pag|pags|fls|sr|sra|dr|dra|obs|aprox|max|min)$/

interface Frase {
  inicio: number
  fim: number
}

function frases(texto: string): Frase[] {
  const lista: Frase[] = []
  let inicio = 0
  const fim = /[.;!?](?= |$)/g
  let m: RegExpExecArray | null
  while ((m = fim.exec(texto))) {
    const antes = texto.slice(Math.max(0, m.index - 8), m.index)
    if (m[0] === '.' && ABREVIACAO.test(antes)) continue
    lista.push({ inicio, fim: m.index + 1 })
    inicio = m.index + 1
  }
  if (inicio < texto.length) lista.push({ inicio, fim: texto.length })
  return lista
}

// ---------- Expressões ----------

// Entre o verbo e "subcontratação" pode vir "cessão, transferência ou" — mas não uma virada de sentido.
const LACUNA = String.raw`(?:(?!\bmas\b|\bporem\b|\bsalvo\b|\bexceto\b|\bsendo\b|permitid|admitid|autorizad)[^.;]){0,80}?`
const AUX = String.raw`(?:e|sera|fica|esta|estara|ficara)`

const PROIBICOES: RegExp[] = [
  new RegExp(String.raw`\b${AUX} (?:expressamente |terminantemente )?(?:vedad[ao]s?|proibid[ao]s?|defes[ao]s?)\b${LACUNA}\bsubcontrat`),
  new RegExp(String.raw`\bnao (?:sera|e|esta|fica|serao|sao) (?:permitid[ao]s?|admitid[ao]s?|autorizad[ao]s?|aceit[ao]s?|possivel)\b${LACUNA}\bsubcontrat`),
  new RegExp(String.raw`\bnao (?:se )?(?:admite|admitira|permite|permitira|aceita|aceitara)(?:-se)?\b${LACUNA}\bsubcontrat`),
  /\bnao (?:podera|poderao|pode|podem|devera|deverao)(?: (?:a contratada|o contratado|a empresa|o fornecedor))?(?: \w+){0,2}? (?:subcontratar|ser(?:em)? subcontratad)/,
  /\bsubcontratac(?:ao|oes)\b[^.;]{0,80}?\b(?:e|sera|fica|esta|sao|serao) (?:expressamente )?(?:vedad|proibid|nao permitid|nao admitid|nao autorizad|nao aceit)/,
  /\bsubcontratac(?:ao|oes)\b[^.;]{0,40}?\bnao (?:sera|e|esta|fica|sao|serao) (?:permitid|admitid|autorizad|aceit)/,
  /\bsubcontratac(?:ao|oes)\b[^.;]{0,40}?\bnao (?:podera|poderao|pode|podem) (?:\w+ )?(?:ser (?:realizad|efetuad|feit|admitid|autorizad|permitid|aceit)|ocorrer)/,
  /\b(?:vedad[ao]s?|proibid[ao]s?|vedacao) (?:a|de|da) subcontrat/,
  // Lista de obrigações no infinitivo: "Não ceder, transferir ou subcontratar, no todo ou em parte, …".
  /\bnao (?:[a-z]+r,? ){0,4}(?:ou |e )?subcontratar\b/,
  /\bnao havera subcontrat|\bsem possibilidade de subcontrat|\bnao e possivel (?:a )?subcontrat/,
]

const PERMISSOES: RegExp[] = [
  new RegExp(String.raw`\b${AUX} (?:\w+ )?(?:permitid[ao]s?|admitid[ao]s?|autorizad[ao]s?|facultad[ao]s?|aceit[ao]s?|possivel) a subcontrat`),
  /\bsubcontratac(?:ao|oes)\b(?:(?!\bnao\b)[^.;]){0,80}?\b(?:e|sera|fica|esta|sao|serao|podera ser|poderao ser|podera|poderao) (?:\w+ )?(?:permitid|admitid|autorizad|aceit|facultad)/,
  // "as subcontratações parciais possíveis só poderão ser realizadas mediante autorização"
  /\bsubcontratac(?:ao|oes)\b(?:(?!\bnao\b)[^.;]){0,60}?\bpoder(?:a|ao) (?:\w+ )?(?:ser (?:realizad|efetuad|feit|admitid|autorizad|permitid|aceit)|ocorrer)/,
  /\b(?:admite|permite|aceita|faculta)-se\b[^.;]{0,40}?\bsubcontrat|\badmitir-se-a\b[^.;]{0,40}?\bsubcontrat/,
  /\b(?:podera|poderao|pode|podem)(?: (?:a contratada|o contratado|a empresa|o fornecedor))? (?:\w+ ){0,2}?(?:subcontratar|ser(?:em)? subcontratad)/,
  /\bsendo (?:permitid|admitid|autorizad|facultad)[ao]s? a subcontrat/,
]

// "não será admitida a subcontratação" não pode virar permissão.
const NEGACAO_ANTES = /\bnao (?:se )?$|\bnao (?:\w+ )?$/
// "caso permitida a subcontratação", "se admitida a subcontratação": condição, não regra.
const CONDICAO_ANTES = /\b(?:caso|se|quando|hipotese|eventual(?:mente)?|desde que)\b[^.;]{0,30}$/

// Proíbe só uma parte: o todo, a parcela principal, quem tem vínculo… — a parcial continua aberta.
const SO_O_TODO =
  /\b(?:no todo|em sua totalidade|na totalidade|totalidade|total|totalmente|integral|integralmente|complet[ao]|parcelas? principa(?:l|is)|parcelas? de maior relevancia|maior relevancia|de pessoa|de empresa|de microempresa|de servidor|que mantenha|que tenha participado)\b/
// …mas "total ou parcial" é a proibição inteira.
const TODO_E_PARTE = /\b(?:total ou parcial(?:mente)?|parcial ou total(?:mente)?|totalmente ou parcialmente|parcialmente ou totalmente|no todo ou em parte|em parte ou no todo|todo ou em parte|parcial ou integral(?:mente)?|integral ou parcial(?:mente)?)\b/
// "vedada a subcontratação, salvo…" abre uma exceção: na prática, permite.
// "…sem prévia autorização do contratante" também: com autorização, pode.
const EXCECAO = /\b(?:salvo|exceto|excecao|ressalvad[ao]s?|a nao ser|senao|mediante (?:a )?(?:previa |expressa )?(?:autorizacao|anuencia|aprovacao|concordancia)|sem [^.;]{0,40}?(?:autorizacao|anuencia|aprovacao|concordancia))\b/

type Veredito = 'permite' | 'proibe' | null

interface Achado {
  veredito: Exclude<Veredito, null>
  posicao: number
}

function primeiraPermissao(frase: string): number | null {
  let melhor: number | null = null
  for (const re of PERMISSOES) {
    const g = new RegExp(re.source, 'g')
    let m: RegExpExecArray | null
    while ((m = g.exec(frase))) {
      const antes = frase.slice(Math.max(0, m.index - 40), m.index)
      if (!NEGACAO_ANTES.test(antes) && !CONDICAO_ANTES.test(antes) && !/\bnao\b/.test(m[0].slice(0, 30))) {
        if (melhor === null || m.index < melhor) melhor = m.index
        break
      }
    }
  }
  return melhor
}

function primeiraProibicao(frase: string): { posicao: number; parcial: boolean; excecao: boolean } | null {
  let melhor: number | null = null
  for (const re of PROIBICOES) {
    const m = re.exec(frase)
    if (!m) continue
    const antes = frase.slice(Math.max(0, m.index - 40), m.index)
    if (CONDICAO_ANTES.test(antes)) continue
    if (melhor === null || m.index < melhor) melhor = m.index
  }
  if (melhor === null) return null
  const resto = frase.slice(melhor).replace(/\bvalor total\b|\bpreco total\b/g, ' ')
  const parcial = !TODO_E_PARTE.test(resto) && SO_O_TODO.test(resto)
  return { posicao: melhor, parcial, excecao: EXCECAO.test(frase) }
}

/** Classifica uma frase já normalizada. Exportada para os testes. */
export function vereditoDaFrase(frase: string): Veredito {
  if (!frase.includes('subcontrat')) return null
  const permissao = primeiraPermissao(frase)
  const proibicao = primeiraProibicao(frase)
  const proibicaoInteira = proibicao && !proibicao.parcial && !proibicao.excecao ? proibicao : null
  if (permissao !== null && proibicaoInteira) return permissao < proibicaoInteira.posicao ? 'permite' : 'proibe'
  if (permissao !== null) return 'permite'
  if (proibicaoInteira) return 'proibe'
  if (proibicao?.excecao && !proibicao.parcial) return 'permite'
  return null
}

function achar(frase: string): Achado | null {
  const v = vereditoDaFrase(frase)
  return v ? { veredito: v, posicao: frase.indexOf('subcontrat') } : null
}

// ---------- Limite e parcelas ----------

const PERCENTUAL = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:%|(?:\([^)]{0,40}\)\s*)?por\s*cento)/

/** "até o limite de 30% (trinta por cento) do valor" -> "até 30% do valor do contrato". */
export function limiteDoTexto(textoNormalizado: string): string | null {
  const m = PERCENTUAL.exec(textoNormalizado)
  if (!m) return null
  const numero = Number(m[1].replace(',', '.'))
  if (!(numero > 0 && numero <= 100)) return null
  const depois = textoNormalizado.slice(m.index + m[0].length, m.index + m[0].length + 60)
  const sobre = /^\s*(?:\([^)]*\)\s*)?d[oa] (valor|objeto|montante|preco)/.exec(depois)
  const base = sobre ? (sobre[1] === 'objeto' ? ' do objeto' : ' do valor do contrato') : ''
  return `até ${String(numero).replace('.', ',')}%${base}`
}

const LISTA_DE_PARCELAS = /\bpoder(?:a|ao) ser subcontratad[ao]s?\b[^:.;]{0,80}:\s*/

// ---------- Recorte do original ----------

function recorte(original: string, mapeado: TextoMapeado, inicio: number, fim: number, foco: number, max = MAX_TRECHO): string {
  let a = inicio
  let b = fim
  if (b - a > max) {
    a = Math.max(inicio, foco - Math.floor(max / 3))
    b = Math.min(fim, a + max)
  }
  const ini = mapeado.mapa[a] ?? 0
  const ultimo = mapeado.mapa[Math.max(a, b - 1)] ?? original.length - 1
  let t = original.slice(ini, ultimo + 1).replace(/\s+/g, ' ').trim()
  // Tira numeração solta no começo ("15.17.1." ) só se sobrar texto.
  t = t.replace(/^[\d.]+\s+(?=\S)/, '').replace(/(?<=\S)\s+\d{1,2}(?:\.\d{1,2})+\.?$/, '')
  const cortadoNoFim = b < fim
  const cortadoNoInicio = a > inicio
  if (t.length > max) t = t.slice(0, max - 1).trimEnd() + '…'
  else if (cortadoNoFim) t = t.slice(0, max - 1).trimEnd() + '…'
  if (cortadoNoInicio) t = '…' + t.replace(/^\S*\s/, '')
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

// ---------- Procura nos documentos ----------

/**
 * Procura a regra de subcontratação nos documentos, na ordem dada (do mais importante
 * para o menos). A primeira frase que decide ("permite" ou "proíbe") vale.
 */
export function acharRegraDeSubcontratacao(documentos: TextoDeDocumento[]): RegraDeSubcontratacao {
  for (const doc of documentos) {
    if (!doc.texto) continue
    const mapeado = normalizarComMapa(doc.texto)
    const lista = frases(mapeado.texto)
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i]
      const frase = mapeado.texto.slice(f.inicio, f.fim)
      const achado = achar(frase)
      if (!achado) continue
      const trecho = recorte(doc.texto, mapeado, f.inicio, f.fim, f.inicio + achado.posicao)
      if (achado.veredito === 'proibe') return { situacao: 'proibe', trecho, limite: null, parcelas: null, documento: doc.nome }
      // Limite: na própria frase ou logo depois, se o assunto ainda é subcontratação.
      const seguinte = lista
        .slice(i + 1, i + 3)
        .map((s) => mapeado.texto.slice(s.inicio, s.fim))
        .filter((s) => /subcontrat|limite|percentual/.test(s))
        .join(' ')
      const limite = limiteDoTexto(frase) ?? (seguinte ? limiteDoTexto(seguinte) : null)
      return { situacao: 'permite', trecho, limite, parcelas: parcelasDoTexto(doc.texto, mapeado), documento: doc.nome }
    }
  }
  return { situacao: 'nao_encontrei', trecho: null, limite: null, parcelas: null, documento: null }
}

function parcelasDoTexto(original: string, mapeado: TextoMapeado): string | null {
  const m = LISTA_DE_PARCELAS.exec(mapeado.texto)
  if (!m) return null
  const inicio = m.index + m[0].length
  const fimDaFrase = mapeado.texto.slice(inicio).search(/[.;](?= |$)/)
  const fim = fimDaFrase < 0 ? Math.min(mapeado.texto.length, inicio + MAX_PARCELAS) : inicio + fimDaFrase
  if (fim - inicio < 4) return null
  return recorte(original, mapeado, inicio, fim, inicio, MAX_PARCELAS)
}

/** A consequência em português simples, para a tela. */
export function explicacaoDaSubcontratacao(regra: Pick<RegraDeSubcontratacao, 'situacao' | 'limite'>): string {
  if (regra.situacao === 'proibe') return 'O contrato não permite subcontratar a execução. Ainda dá para oferecer material ou aluguel de equipamento.'
  if (regra.situacao === 'permite') {
    return `O contrato permite subcontratar parte do serviço (limite: ${regra.limite ?? 'o edital não fixa um percentual; depende de autorização do órgão'}).`
  }
  return 'Não achei a regra no edital. Pergunte à empresa ou veja os arquivos no PNCP.'
}

// ---------- Que arquivos ler primeiro ----------

// A regra fica no edital, no termo de referência / projeto básico ou na minuta do contrato.
// Planilha, cronograma, BDI, fotos, projetos, ETP, matriz de riscos, ata e termos de
// homologação quase nunca falam disso — e costumam ser os arquivos mais pesados.
const ONDE_FICA_A_REGRA: { peso: number; re: RegExp }[] = [
  { peso: 5, re: /\bedital\b/i },
  { peso: 4, re: /termo\s*de\s*refer|projeto\s*b[aá]sico|\btr\b|minuta|\bcontrato\b/i },
  { peso: 0, re: /planilha|cronograma|\bbdi\b|fotogr|composic|\bprojetos\b|riscos|\betp\b|estudo t[eé]cnico|estudo preliminar|\bata\b|adjudica|homologa|parecer|memorial|or[cç]ament|\bart\b|\brrt\b|aviso|publica[cç]|extrato|declara[cç]|modelo de proposta|\bmapa\b|sondagem|\.xlsx?$/i },
]

/** Peso do arquivo na procura da regra (maior = lê antes; 0 = só se sobrar tempo). */
export function pesoParaProcurarARegra(titulo: string): number {
  const t = titulo.replace(/_+/g, ' ')
  for (const { peso, re } of ONDE_FICA_A_REGRA) if (re.test(t)) return peso
  return 2
}

/** Ordena os arquivos da compra para procurar a regra, mantendo a ordem do PNCP no empate. */
export function ordenarParaProcurarARegra<T extends { titulo: string }>(arquivos: T[]): T[] {
  return arquivos
    .map((a, ordem) => ({ a, ordem, peso: pesoParaProcurarARegra(a.titulo) }))
    .sort((x, y) => y.peso - x.peso || x.ordem - y.ordem)
    .map(({ a }) => a)
}
