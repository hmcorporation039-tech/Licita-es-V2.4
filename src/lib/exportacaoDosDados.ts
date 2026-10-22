export type Celula = string | number | boolean | Date | null | undefined

const EXTENSAO_DO_TIPO: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
}

export function nomeSeguro(texto: string, maximo = 80): string {
  const limpo = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ._()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[ .]+|[ .]+$/g, '')
  return limpo.slice(0, maximo).trim() || 'sem nome'
}

export function separarExtensao(nome: string): [string, string] {
  const ponto = nome.lastIndexOf('.')
  if (ponto <= 0 || nome.length - ponto > 8) return [nome, '']
  return [nome.slice(0, ponto), nome.slice(ponto)]
}

export function caminhoUnico(usados: Set<string>, caminho: string): string {
  const chave = (c: string) => c.toLowerCase()
  if (!usados.has(chave(caminho))) {
    usados.add(chave(caminho))
    return caminho
  }
  const [base, extensao] = separarExtensao(caminho)
  for (let n = 2; ; n++) {
    const candidato = `${base} (${n})${extensao}`
    if (!usados.has(chave(candidato))) {
      usados.add(chave(candidato))
      return candidato
    }
  }
}

export function caminhoDoArquivoDoCofre(nomeDoDocumento: string, nomeDoArquivo: string): string {
  const [base, extensao] = separarExtensao(nomeDoArquivo)
  const extensaoSegura = extensao.slice(1).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  return `cofre-de-documentos/${nomeSeguro(nomeDoDocumento, 60)} - ${nomeSeguro(base, 60)}${extensaoSegura ? `.${extensaoSegura}` : ''}`
}

export function extensaoDoTipo(mimeType: string): string {
  return EXTENSAO_DO_TIPO[mimeType.toLowerCase()] ?? 'bin'
}

function textoDaCelula(valor: Celula): string {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) return valor.toISOString()
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não'
  return String(valor)
}

export function planilhaCsv(cabecalho: string[], linhas: Celula[][]): string {
  const celula = (valor: Celula) => {
    const texto = typeof valor === 'string' && /^[=+\-@\t]/.test(valor) ? `'${valor}` : textoDaCelula(valor)
    return /[";\r\n']/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
  }
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n'
}

export interface ResumoDoPacote {
  geradoEm: Date
  email: string
  empresa: string | null
  dono: boolean
  arquivosDoCofre: number
  documentosSemArquivo: number
  temLogo: boolean
  licitacoesEncontradas: number
  licitacoesCortadas: boolean
}

export function textoDoLeiaMe(r: ResumoDoPacote): string {
  const linhas = [
    'CÓPIA DOS SEUS DADOS NA LICITA BELA',
    '',
    `Gerada em ${r.geradoEm.toISOString()} para ${r.email}${r.empresa ? `, da empresa ${r.empresa}` : ''}.`,
    'Lei Geral de Proteção de Dados (Lei 13.709/2018), art. 18: acesso e portabilidade.',
    '',
    'O QUE TEM AQUI',
    '- dados.json: todos os dados em formato aberto (JSON), que outro sistema consegue ler.',
    '- licitacoes-encontradas.csv: as licitações que a Licita Bela encontrou para os seus itens. Abre no Excel.',
    '- cofre-de-documentos.csv: a lista dos documentos do cofre, com emissão, validade e o código SHA-256 de cada arquivo.',
    r.arquivosDoCofre === 0
      ? '- (nenhum arquivo foi enviado ao cofre de documentos)'
      : `- cofre-de-documentos/: ${r.arquivosDoCofre === 1 ? 'o arquivo' : `os ${r.arquivosDoCofre} arquivos`} que você enviou ao cofre, do jeito que ${r.arquivosDoCofre === 1 ? 'foi enviado' : 'foram enviados'}.`,
    r.temLogo ? '- logo/: a logomarca da empresa usada no papel timbrado.' : '- (a empresa não tem logomarca cadastrada)',
    '',
  ]
  if (r.documentosSemArquivo > 0) linhas.push(`${r.documentosSemArquivo} documento(s) do cofre estão cadastrados sem arquivo anexado; eles aparecem só na lista.`, '')
  if (r.licitacoesCortadas) linhas.push(`A lista de licitações encontradas traz as ${r.licitacoesEncontradas} mais recentes. Para receber todas, escreva para suporte@licitabela.com.br.`, '')
  if (!r.dono) {
    linhas.push('Você é membro da empresa, não o dono: a cópia traz os dados da empresa que você vê na plataforma e as suas ações. Os dados dos colegas, a cobrança e o histórico de ações dos outros ficam só na cópia do dono.', '')
  }
  linhas.push(
    'O QUE NÃO TEM AQUI',
    '- As licitações em si são públicas (vêm do PNCP e de outros portais oficiais): a cópia traz a referência e o link de cada uma, não o edital inteiro.',
    '- Senhas e códigos de acesso não são exportados.',
    '',
    'Dúvidas: suporte@licitabela.com.br'
  )
  return linhas.join('\r\n') + '\r\n'
}
