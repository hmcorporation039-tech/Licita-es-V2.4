import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { zipSync } from 'fflate'
import type { CaudaDoArquivo, RedeDoTceRs, TrechoDoArquivo } from '../../src/services/tceRsColeta'

export const PASTA_DO_TCE_RS = join(__dirname, '..', 'fixtures', 'tce-rs')
export const ARQUIVOS_DO_TCE_RS = ['licitacao.csv', 'evento_lic.csv', 'documento_lic.csv'] as const

export function arquivoDoTceRs(nome: string): Buffer {
  return readFileSync(join(PASTA_DO_TCE_RS, nome))
}

export function zipDoTceRs(substituir: Record<string, string | Buffer> = {}, nivel: 0 | 6 = 6): Buffer {
  const entradas: Record<string, Uint8Array> = {}
  for (const nome of ARQUIVOS_DO_TCE_RS) {
    const conteudo = substituir[nome] ?? arquivoDoTceRs(nome)
    entradas[nome] = typeof conteudo === 'string' ? Buffer.from(conteudo, 'utf8') : conteudo
  }
  return Buffer.from(zipSync(entradas, { level: nivel }))
}

export interface PedidoAoTceRs {
  tipo: 'cauda' | 'trecho'
  caminho: string
  inicio?: number
  fim?: number
}

export interface OpcoesDaRedeFalsa {
  statusDaCauda?: (caminho: string) => number
  statusDoTrecho?: (vez: number) => number
  cortarTrecho?: (vez: number) => number | null
  pendurarTrecho?: (vez: number) => boolean
  silenciarTrecho?: (vez: number) => boolean
}

export interface RedeFalsaDoTceRs extends RedeDoTceRs {
  pedidos: PedidoAoTceRs[]
  esperas: number[]
  corposDestruidos: number
}

export function redeFalsaDoTceRs(arquivos: Record<string, Buffer>, opcoes: OpcoesDaRedeFalsa = {}): RedeFalsaDoTceRs {
  let trechos = 0
  const rede: RedeFalsaDoTceRs = {
    pedidos: [],
    esperas: [],
    corposDestruidos: 0,
    baixarCauda: async (caminho, bytes): Promise<CaudaDoArquivo> => {
      rede.pedidos.push({ tipo: 'cauda', caminho })
      const zip = arquivos[caminho]
      const status = opcoes.statusDaCauda?.(caminho) ?? (zip ? 206 : 404)
      if (!zip || status !== 206) return { status, dados: Buffer.alloc(0), tamanhoTotal: null, atualizadoEm: null }
      return { status, dados: zip.subarray(Math.max(0, zip.length - bytes)), tamanhoTotal: zip.length, atualizadoEm: 'Sun, 18 Oct 2026 06:35:01 GMT' }
    },
    baixarTrecho: async (caminho, inicio, fim, sinal): Promise<TrechoDoArquivo> => {
      rede.pedidos.push({ tipo: 'trecho', caminho, inicio, fim })
      const vez = trechos++
      if (opcoes.pendurarTrecho?.(vez)) {
        await new Promise<never>((_, rejeitar) => sinal?.addEventListener('abort', () => rejeitar(new Error('canceled'))))
      }
      const zip = arquivos[caminho] ?? Buffer.alloc(0)
      const status = opcoes.statusDoTrecho?.(vez) ?? 206
      const corte = opcoes.cortarTrecho?.(vez) ?? null
      const pedaco = zip.subarray(inicio, fim + 1)
      const corpo = opcoes.silenciarTrecho?.(vez)
        ? new Readable({ read() {} })
        : Readable.from(corte === null ? [pedaco] : [pedaco.subarray(0, corte)])
      if (opcoes.silenciarTrecho?.(vez)) corpo.push(pedaco.subarray(0, 100))
      const destruir = corpo.destroy.bind(corpo)
      corpo.destroy = (erro?: Error) => {
        rede.corposDestruidos++
        return destruir(erro)
      }
      return { status, corpo }
    },
    esperar: async (ms) => {
      rede.esperas.push(ms)
    },
  }
  return rede
}

export function caminhoDoAno(ano: number): string {
  return `/dados/licitacon/licitacao/ano/${ano}.csv.zip`
}
