import { domScClient } from '../lib/httpClient'

// Os arquivos do DOM/SC ficam num conjunto de dados por mês ("domsc-publicacoes-de-11-2026"),
// um recurso por faixa de horário: "Publicações de 09/11/2026 entre 16:00 e 23:59 (645)".
export interface ArquivoDoDomSc {
  id: string
  nome: string
  url: string
  dia: string // AAAA-MM-DD
}

const NOME_DO_ARQUIVO = /Publica\S* de (\d{2})\/(\d{2})\/(\d{4}) entre/i
const HOST_DOS_ARQUIVOS = 'dados.ciga.sc.gov.br'

export function nomeDoConjuntoDoMes(dia: string): string {
  const [ano, mes] = dia.split('-')
  return `domsc-publicacoes-de-${mes}-${ano}`
}

export function arquivosDoConjunto(resposta: unknown): ArquivoDoDomSc[] {
  const recursos = (resposta as { result?: { resources?: unknown } } | null)?.result?.resources
  if (!Array.isArray(recursos)) throw new Error('resposta do CKAN do CIGA sem "result.resources"')
  const arquivos: ArquivoDoDomSc[] = []
  for (const r of recursos as Record<string, unknown>[]) {
    const nome = typeof r.name === 'string' ? r.name : ''
    const url = typeof r.url === 'string' ? r.url : ''
    const id = typeof r.id === 'string' ? r.id : ''
    const m = NOME_DO_ARQUIVO.exec(nome)
    if (!m || !id) continue
    // Só baixa do próprio portal do CIGA, por https.
    let host: string
    try {
      const u = new URL(url)
      host = u.protocol === 'https:' ? u.hostname : ''
    } catch {
      host = ''
    }
    if (host !== HOST_DOS_ARQUIVOS) continue
    arquivos.push({ id, nome, url, dia: `${m[3]}-${m[2]}-${m[1]}` })
  }
  return arquivos
}

export async function listarArquivosDoMes(dia: string): Promise<ArquivoDoDomSc[]> {
  const resposta = await domScClient.get('/api/3/action/package_show', { params: { id: nomeDoConjuntoDoMes(dia) } })
  return arquivosDoConjunto(resposta.data)
}

export async function baixarArquivoDoDomSc(arquivo: ArquivoDoDomSc): Promise<Uint8Array> {
  const caminho = new URL(arquivo.url).pathname
  const resposta = await domScClient.get<ArrayBuffer>(caminho, { responseType: 'arraybuffer', headers: { Accept: 'application/zip' } })
  return new Uint8Array(resposta.data)
}
