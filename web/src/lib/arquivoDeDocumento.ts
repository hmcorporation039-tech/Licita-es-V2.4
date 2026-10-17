export const TIPOS_DE_ARQUIVO_ACEITOS = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'
const TAMANHO_MAXIMO_DO_ARQUIVO = 10 * 1024 * 1024

export function erroDoArquivoDeDocumento(arquivo: File): string | null {
  const nome = arquivo.name.toLowerCase()
  const tipoOk = ['application/pdf', 'image/jpeg', 'image/png'].includes(arquivo.type) || /\.(pdf|jpe?g|png)$/.test(nome)
  if (!tipoOk) return 'Envie o documento em PDF, JPG ou PNG.'
  if (arquivo.size > TAMANHO_MAXIMO_DO_ARQUIVO) return 'O arquivo passa de 10 MB. Envie um arquivo menor.'
  if (arquivo.size === 0) return 'O arquivo está vazio.'
  return null
}
