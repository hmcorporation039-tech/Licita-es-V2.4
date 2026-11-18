// O que a pessoa pede à Bela quando está na página de uma licitação ("me resume esse
// edital", "que documentos pede?", "abre o pregão"). Regra pura, sem tela: o
// componente da Bela busca os dados (análise já pronta, datas, valor) e monta a
// resposta com as funções daqui. Nada aqui gera análise nova de IA.

/** A página da licitação ouve este evento para trocar de aba sem recarregar. */
export const EVENTO_ABRIR_ABA = 'bela:abrir-aba'

export type DestinoNoEdital =
  | { tipo: 'aba'; aba: 'informacoes' | 'itens' | 'analise' | 'habilitacao' | 'exigencias' | 'checklist' | 'plano' | 'documentos' | 'resultado'; rotulo: string }
  | { tipo: 'pagina'; caminho: 'pregao' | 'estudo'; rotulo: string }

export type PedidoDoEdital =
  | { tipo: 'resumo' }
  | { tipo: 'documentos' }
  | { tipo: 'riscos' }
  | { tipo: 'prazo' }
  | { tipo: 'valor' }
  | { tipo: 'abrir'; destino: DestinoNoEdital }

export function normalizarPedido(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const VERBO_DE_ABRIR = /\b(abr[ae]|abrir|abre|vai|vamos|va|leva|levar|ir|entra|entrar|mostra|mostrar|quero ver|me mostra|ver)\b/

// A ordem importa: o primeiro destino que casar vale.
const DESTINOS: [RegExp, DestinoNoEdital][] = [
  [/\b(pregao|disputa|sala de disputa|lances?)\b/, { tipo: 'pagina', caminho: 'pregao', rotulo: 'Pregão com a Bela' }],
  [/\b(estudo|custos?|planilha de custo)\b/, { tipo: 'pagina', caminho: 'estudo', rotulo: 'Estudo de custos' }],
  [/\bitens?\b/, { tipo: 'aba', aba: 'itens', rotulo: 'Itens' }],
  [/\bchecklist\b/, { tipo: 'aba', aba: 'checklist', rotulo: 'Checklist' }],
  [/\bhabilitacao\b/, { tipo: 'aba', aba: 'habilitacao', rotulo: 'Habilitação' }],
  [/\bexigencias?\b/, { tipo: 'aba', aba: 'exigencias', rotulo: 'Exigências' }],
  [/\bplano( de participacao)?\b/, { tipo: 'aba', aba: 'plano', rotulo: 'Plano de participação' }],
  [/\bresultado\b/, { tipo: 'aba', aba: 'resultado', rotulo: 'Resultado' }],
  [/\banalise\b/, { tipo: 'aba', aba: 'analise', rotulo: 'Análise' }],
  [/\b(aba de )?documentos\b/, { tipo: 'aba', aba: 'documentos', rotulo: 'Documentos' }],
]

const RISCOS = /\b(riscos?|pegadinhas?|cuidados?|clausulas?|perig\w*|armadilhas?|problemas?|atencao|restritiv\w*|ilega\w*)\b/
const DOCUMENTOS = /\b(documentos?|documentacao|habilitacao|certid\w*|atestados?|papel|papeis|o que (eu )?(preciso|precisa) (ter|apresentar|mandar|enviar))\b/
const PRAZO = /\b(quando|prazos?|datas?|que dia|qual dia|que horas|horario|abre|abertura|encerra\w*|fecha|falta|faltam|sessao)\b/
const VALOR = /\b(valor|valores|quanto (vale|e|paga|custa)|estimad\w*|orcamento|preco)\b/
const RESUMO = /\b(resum\w*|explica\w*|do que se trata|sobre o que|o que (e|eh) (esse|essa|isso|ele)|o que (estao|ta|esta|vao) (comprando|contratando|pedindo)|me fala (desse|dessa|sobre|do edital|da licitacao)|me conta|entender (esse|essa|o edital|a licitacao)|edital|licitacao)\b/

/** null = não é um pedido sobre este edital (a Bela segue com a busca normal). */
export function interpretarPedidoDoEdital(texto: string): PedidoDoEdital | null {
  const t = normalizarPedido(texto)
  if (!t) return null
  if (VERBO_DE_ABRIR.test(t) && !/\b(quando|que horas|que dia)\b/.test(t)) {
    const destino = DESTINOS.find(([re]) => re.test(t))?.[1]
    if (destino) return { tipo: 'abrir', destino }
  }
  if (RISCOS.test(t)) return { tipo: 'riscos' }
  if (DOCUMENTOS.test(t)) return { tipo: 'documentos' }
  if (PRAZO.test(t)) return { tipo: 'prazo' }
  if (VALOR.test(t)) return { tipo: 'valor' }
  // "licitação de móveis no DF" é busca, não pergunta sobre este edital.
  if (/\b(licitac\w*|pregoes|editais) (de|do|da|para|pra|sobre)\b/.test(t) && !/\b(esse|essa|este|esta|desse|dessa|deste|desta)\b/.test(t)) return null
  if (RESUMO.test(t)) return { tipo: 'resumo' }
  return null
}

// ---------- respostas ----------

export interface RiscoParaResposta {
  titulo: string
  descricao: string
  severidade: 'alta' | 'media' | 'baixa'
}

export interface AnaliseParaResposta {
  resumo: string
  valorEstimado: string
  dataSessao: string
  prazoEntrega: string
  documentosExigidos: string[]
  riscos: RiscoParaResposta[]
}

export interface Resposta {
  /** Texto mostrado na tela. */
  texto: string
  /** Lista mostrada abaixo do texto (documentos, riscos). */
  lista: string[]
  /** O que a Bela fala (mais curto que o texto). */
  fala: string
  /** Aba sugerida para ver tudo. */
  verMais: DestinoNoEdital | null
}

const MAXIMO_NA_LISTA = 8
const VAZIO = /^\s*(-|—|n\/?a|nao informado|não informado|nao consta|não consta|)\s*$/i

function util(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim()
  return t && !VAZIO.test(t) ? t : null
}

function primeiraFrase(texto: string, limite = 320): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  if (t.length <= limite) return t
  const corte = t.slice(0, limite)
  const ponto = corte.lastIndexOf('. ')
  return ponto > 80 ? corte.slice(0, ponto + 1) : `${corte.trimEnd()}…`
}

const ABA_ANALISE: DestinoNoEdital = { tipo: 'aba', aba: 'analise', rotulo: 'Análise' }
const ABA_HABILITACAO: DestinoNoEdital = { tipo: 'aba', aba: 'habilitacao', rotulo: 'Habilitação' }

export function respostaSemAnalise(pedido: 'resumo' | 'documentos' | 'riscos'): Resposta {
  const oque = pedido === 'resumo' ? 'o resumo' : pedido === 'documentos' ? 'a lista de documentos' : 'os riscos'
  const texto = `Este edital ainda não tem análise pronta, então ainda não tenho ${oque}. Abra a aba Análise para pedir a leitura do edital.`
  return { texto, lista: [], fala: texto, verMais: ABA_ANALISE }
}

export function respostaDoResumo(a: AnaliseParaResposta, objeto: string): Resposta {
  const resumo = util(a.resumo) ?? objeto
  const partes = [primeiraFrase(resumo, 600)]
  const valor = util(a.valorEstimado)
  const sessao = util(a.dataSessao)
  const entrega = util(a.prazoEntrega)
  const detalhes: string[] = []
  if (valor) detalhes.push(`Valor estimado: ${valor}`)
  if (sessao) detalhes.push(`Sessão: ${sessao}`)
  if (entrega) detalhes.push(`Prazo de entrega: ${entrega}`)
  const altos = a.riscos.filter((r) => r.severidade === 'alta')
  const lista = [...detalhes]
  if (altos.length) lista.push(`${altos.length} ${altos.length === 1 ? 'ponto de atenção alto' : 'pontos de atenção altos'}: ${altos.map((r) => r.titulo).slice(0, 3).join('; ')}`)
  const falaDosRiscos = altos.length ? ` Atenção: ${altos.length === 1 ? 'tem um ponto de risco alto' : `tem ${altos.length} pontos de risco altos`}. Pergunte "tem alguma pegadinha?" para ouvir.` : ''
  return {
    texto: partes.join(' '),
    lista,
    fala: `${primeiraFrase(resumo)}${valor ? ` Valor estimado: ${valor}.` : ''}${falaDosRiscos}`,
    verMais: ABA_ANALISE,
  }
}

export function respostaDosDocumentos(a: AnaliseParaResposta): Resposta {
  const docs = a.documentosExigidos.map((d) => d.trim()).filter(Boolean)
  if (docs.length === 0) {
    const texto = 'A análise não listou documentos de habilitação. Confira na aba Habilitação.'
    return { texto, lista: [], fala: texto, verMais: ABA_HABILITACAO }
  }
  const lista = docs.slice(0, MAXIMO_NA_LISTA)
  const resto = docs.length - lista.length
  const texto = `O edital pede ${docs.length} ${docs.length === 1 ? 'documento' : 'documentos'}${resto > 0 ? ` (mostrando ${lista.length})` : ''}. Na aba Habilitação a Bela confere com os documentos que você já tem.`
  const fala = `O edital pede ${docs.length} ${docs.length === 1 ? 'documento' : 'documentos'}. Os primeiros são: ${lista.slice(0, 3).join('; ')}.`
  return { texto, lista, fala, verMais: ABA_HABILITACAO }
}

const ORDEM_DA_SEVERIDADE = { alta: 0, media: 1, baixa: 2 } as const
const ROTULO_DA_SEVERIDADE = { alta: 'Alto', media: 'Médio', baixa: 'Baixo' } as const

export function respostaDosRiscos(a: AnaliseParaResposta): Resposta {
  if (a.riscos.length === 0) {
    const texto = 'A análise não apontou pontos de risco neste edital. Mesmo assim, leia as exigências antes de participar.'
    return { texto, lista: [], fala: texto, verMais: ABA_ANALISE }
  }
  const ordenados = [...a.riscos].sort((x, y) => ORDEM_DA_SEVERIDADE[x.severidade] - ORDEM_DA_SEVERIDADE[y.severidade])
  const altos = ordenados.filter((r) => r.severidade === 'alta')
  const lista = ordenados.slice(0, MAXIMO_NA_LISTA).map((r) => `${ROTULO_DA_SEVERIDADE[r.severidade]} — ${r.titulo}: ${r.descricao}`)
  const texto = `Encontrei ${a.riscos.length} ${a.riscos.length === 1 ? 'ponto de atenção' : 'pontos de atenção'}${altos.length ? `, ${altos.length} de risco alto` : ''}.`
  const principal = altos[0] ?? ordenados[0]
  const fala = `${texto} O principal: ${principal.titulo}. ${primeiraFrase(principal.descricao, 200)}`
  return { texto, lista, fala, verMais: ABA_ANALISE }
}

const DIA_MS = 86_400_000

function quantoFalta(alvo: Date, agora: Date): string | null {
  const ms = alvo.getTime() - agora.getTime()
  if (ms <= 0) return null
  const dias = Math.floor(ms / DIA_MS)
  if (dias >= 1) return `faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}`
  const horas = Math.floor(ms / 3_600_000)
  if (horas >= 1) return `faltam ${horas} ${horas === 1 ? 'hora' : 'horas'}`
  const minutos = Math.max(1, Math.floor(ms / 60_000))
  return `faltam ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`
}

export interface DatasParaResposta {
  /** Fim do envio de propostas (ou abertura, quando o portal não informa o fim). */
  fim: Date | null
  fimTexto: string | null
  abertura: Date | null
  aberturaTexto: string | null
  sessaoDaAnalise: string | null
}

export function respostaDoPrazo(d: DatasParaResposta, agora: Date): Resposta {
  const lista: string[] = []
  let fala = ''
  if (d.fim && d.fimTexto) {
    const falta = quantoFalta(d.fim, agora)
    lista.push(`Fim do envio de propostas: ${d.fimTexto}${falta ? ` (${falta})` : ' (já passou)'}`)
    fala = falta ? `O envio de propostas vai até ${d.fimTexto}. ${falta.charAt(0).toUpperCase()}${falta.slice(1)}.` : `O envio de propostas terminou em ${d.fimTexto}.`
  }
  if (d.abertura && d.aberturaTexto && d.aberturaTexto !== d.fimTexto) {
    const falta = quantoFalta(d.abertura, agora)
    lista.push(`Abertura: ${d.aberturaTexto}${falta ? ` (${falta})` : ''}`)
    if (!fala) fala = falta ? `A abertura é em ${d.aberturaTexto}. ${falta.charAt(0).toUpperCase()}${falta.slice(1)}.` : `A abertura foi em ${d.aberturaTexto}.`
  }
  const sessao = util(d.sessaoDaAnalise)
  if (sessao) lista.push(`Sessão, segundo o edital: ${sessao}`)
  if (!fala) fala = sessao ? `Segundo o edital, a sessão é ${sessao}.` : 'O portal não informou as datas desta licitação. Confira no edital original.'
  return { texto: fala, lista, fala, verMais: null }
}

export function respostaDoValor(valorDoPortal: number | null, valorDaAnalise: string | null): Resposta {
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const daAnalise = util(valorDaAnalise)
  if (valorDoPortal !== null && valorDoPortal > 0) {
    const texto = `O valor estimado é ${brl(valorDoPortal)}.`
    return { texto, lista: daAnalise && !daAnalise.includes(brl(valorDoPortal)) ? [`No edital: ${daAnalise}`] : [], fala: texto, verMais: { tipo: 'aba', aba: 'itens', rotulo: 'Itens' } }
  }
  if (daAnalise) {
    const texto = `Segundo o edital, o valor estimado é ${daAnalise}.`
    return { texto, lista: [], fala: texto, verMais: { tipo: 'aba', aba: 'itens', rotulo: 'Itens' } }
  }
  const texto = 'O valor estimado não foi divulgado (pode ser sigiloso). Veja os itens para ter uma ideia.'
  return { texto, lista: [], fala: texto, verMais: { tipo: 'aba', aba: 'itens', rotulo: 'Itens' } }
}

/** Página da licitação: /tenders/<id> (com ou sem aba). Pregão e documentos têm tela própria. */
export function licitacaoDaPagina(caminho: string | null | undefined): string | null {
  const m = /^\/tenders\/([^/?#]+)\/?$/.exec(caminho ?? '')
  return m ? decodeURIComponent(m[1]) : null
}
