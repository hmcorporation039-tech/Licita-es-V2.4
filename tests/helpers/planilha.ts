import { strFromU8, unzipSync } from 'fflate'

export interface CelulaLida {
  tipo: 'texto' | 'numero'
  valor: string
  estilo: number
}

export interface PlanilhaLida {
  partes: string[]
  xml: Record<string, string>
  celulas: Map<string, CelulaLida>
  linhas: Map<number, Map<string, CelulaLida>>
}

function desfazerEscape(texto: string): string {
  return texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

const CELULA = /<c r="([A-Z]+)(\d+)"( t="inlineStr")?(?: s="(\d+)")?>(?:<is><t xml:space="preserve">([\s\S]*?)<\/t><\/is>|<v>([^<]*)<\/v>)<\/c>/g

export function lerPlanilha(conteudo: Uint8Array): PlanilhaLida {
  const arquivos = unzipSync(conteudo)
  const xml = Object.fromEntries(Object.entries(arquivos).map(([nome, bytes]) => [nome, strFromU8(bytes)]))
  const celulas = new Map<string, CelulaLida>()
  const linhas = new Map<number, Map<string, CelulaLida>>()
  for (const m of (xml['xl/worksheets/sheet1.xml'] ?? '').matchAll(CELULA)) {
    const [, coluna, linha, ehTexto, estilo, texto, numero] = m
    const celula: CelulaLida = ehTexto
      ? { tipo: 'texto', valor: desfazerEscape(texto ?? ''), estilo: Number(estilo ?? 0) }
      : { tipo: 'numero', valor: numero ?? '', estilo: Number(estilo ?? 0) }
    celulas.set(`${coluna}${linha}`, celula)
    const daLinha = linhas.get(Number(linha)) ?? new Map<string, CelulaLida>()
    daLinha.set(coluna, celula)
    linhas.set(Number(linha), daLinha)
  }
  return { partes: Object.keys(arquivos), xml, celulas, linhas }
}

export function textoDaColuna(planilha: PlanilhaLida, titulo: string): Map<number, string> {
  const cabecalho = planilha.linhas.get(1) ?? new Map<string, CelulaLida>()
  const coluna = [...cabecalho.entries()].find(([, c]) => c.valor === titulo)?.[0]
  const resultado = new Map<number, string>()
  if (!coluna) return resultado
  for (const [numero, linha] of planilha.linhas) {
    if (numero === 1) continue
    const celula = linha.get(coluna)
    if (celula) resultado.set(numero, celula.valor)
  }
  return resultado
}
