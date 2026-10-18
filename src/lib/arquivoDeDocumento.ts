export const TAMANHO_MAXIMO_ARQUIVO = 10 * 1024 * 1024

export type TipoDeArquivo = 'application/pdf' | 'image/jpeg' | 'image/png'

const EXTENSAO: Record<TipoDeArquivo, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

export function detectarTipoDeArquivo(conteudo: Buffer): TipoDeArquivo | null {
  if (conteudo.length >= 5 && conteudo.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  if (conteudo.length >= 3 && conteudo[0] === 0xff && conteudo[1] === 0xd8 && conteudo[2] === 0xff) return 'image/jpeg'
  if (conteudo.length >= 8 && conteudo.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return null
}

export function extensaoDoTipo(tipo: TipoDeArquivo): string {
  return EXTENSAO[tipo]
}

export function nomeDeArquivoSeguro(nome: string | undefined | null, tipo: TipoDeArquivo): string {
  const base = (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[^a-zA-Z0-9 ._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${base || 'documento'}.${EXTENSAO[tipo]}`
}

export interface ProblemaNosDados {
  path: (string | number)[]
  code: string
}

const MENSAGEM_DO_CAMPO: Record<string, { vazio: string; invalido: string }> = {
  nome: { vazio: 'Informe o nome do documento', invalido: 'O nome do documento deve ter até 200 caracteres' },
  tipo: { vazio: 'Tipo de documento inválido', invalido: 'Tipo de documento inválido' },
  dataEmissao: { vazio: 'Data de emissão inválida', invalido: 'Data de emissão inválida' },
  dataValidade: { vazio: 'Data de validade inválida', invalido: 'Data de validade inválida' },
  observacao: { vazio: 'Observação inválida', invalido: 'A observação deve ter até 2.000 caracteres' },
}

export function erroDosDadosDoDocumento(problemas: ProblemaNosDados[]): { campo: string | null; mensagem: string } {
  const problema = problemas.find((p) => typeof p.path[0] === 'string' && MENSAGEM_DO_CAMPO[p.path[0]])
  if (!problema) return { campo: null, mensagem: 'Dados do documento inválidos' }
  const campo = problema.path[0] as string
  const vazio = problema.code === 'invalid_type' || problema.code === 'too_small'
  return { campo, mensagem: vazio ? MENSAGEM_DO_CAMPO[campo].vazio : MENSAGEM_DO_CAMPO[campo].invalido }
}

export function limiteDeArmazenamentoPorEmpresa(env: NodeJS.ProcessEnv = process.env): number {
  const mb = Number(env.MAX_ARQUIVOS_MB_EMPRESA)
  return (Number.isInteger(mb) && mb > 0 ? mb : 300) * 1024 * 1024
}
