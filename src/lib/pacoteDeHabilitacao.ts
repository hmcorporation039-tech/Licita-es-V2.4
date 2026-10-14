import { strToU8, zipSync, type Zippable } from 'fflate'
import type { RequisitoAvaliado } from './habilitacao'

export interface ArquivoDoPacote {
  documentId: string
  nomeArquivo: string
  conteudo: Uint8Array
}

const ROTULO_STATUS: Record<RequisitoAvaliado['status'], string> = {
  verde: 'em dia',
  amarelo: 'atenção',
  vermelho: 'pendente',
  cinza: 'conferir',
}

function nomeDePasta(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

export function montarPacoteDeHabilitacao(dossiePdf: Uint8Array, requisitos: RequisitoAvaliado[], arquivos: ArquivoDoPacote[]): Uint8Array {
  const porDocumento = new Map(arquivos.map((a) => [a.documentId, a]))
  const conteudo: Zippable = { 'dossie-da-licitacao.pdf': dossiePdf }
  const usados = new Set<string>()
  const linhas: string[] = ['PACOTE DE HABILITAÇÃO', '', 'Inclui o dossiê da licitação e os arquivos do cofre de documentos usados em cada exigência.', '']
  let ordem = 0

  for (const r of requisitos) {
    const arquivo = r.documento ? porDocumento.get(r.documento.id) : undefined
    if (arquivo) {
      if (!usados.has(arquivo.documentId)) {
        ordem += 1
        const pasta = nomeDePasta(r.section) || 'Documentos'
        const nome = `${String(ordem).padStart(2, '0')} - ${nomeDePasta(r.label) || 'documento'} - ${arquivo.nomeArquivo}`
        conteudo[`documentos/${pasta}/${nome}`] = arquivo.conteudo
        usados.add(arquivo.documentId)
      }
      linhas.push(`[incluído] ${r.label} (${ROTULO_STATUS[r.status]})`)
    } else if (r.documento) {
      linhas.push(`[sem arquivo] ${r.label}: documento "${r.documento.nome}" cadastrado no cofre sem arquivo anexado`)
    } else if (r.status === 'vermelho') {
      linhas.push(`[falta] ${r.label}: não há documento no cofre`)
    }
  }

  conteudo['LEIA-ME.txt'] = strToU8(linhas.join('\r\n') + '\r\n')
  return zipSync(conteudo, { level: 6 })
}
