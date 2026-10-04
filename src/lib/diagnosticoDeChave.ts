// ============================================================
// lib/diagnosticoDeChave.ts — Descreve o FORMATO de uma chave de API sem expô-la.
//
// "API key is invalid" quase sempre vem de a variável de ambiente ter chegado
// diferente do que se copiou: espaço ou quebra de linha no fim, aspas em volta,
// valor cortado, valor de exemplo. Este módulo só devolve fatos sobre o formato
// (tamanho, prefixo público, presença de espaços/aspas); NUNCA devolve a chave.
// ============================================================

export interface DiagnosticoDaChave {
  definida: boolean
  tamanho: number
  // Só o prefixo PÚBLICO esperado (ex.: "sk-ant-"), nunca parte da chave.
  prefixoEsperadoOk: boolean
  problemas: string[]
}

export function diagnosticarChave(valor: string | undefined, prefixoEsperado: string, tamanhoMinimo: number): DiagnosticoDaChave {
  if (valor === undefined || valor === '') {
    return { definida: false, tamanho: 0, prefixoEsperadoOk: false, problemas: ['variável vazia ou ausente'] }
  }
  const problemas: string[] = []
  if (valor !== valor.trim()) problemas.push('há espaço ou quebra de linha no começo ou no fim')
  if (/^["'`]|["'`]$/.test(valor.trim())) problemas.push('o valor está entre aspas')
  if (/\s/.test(valor.trim())) problemas.push('há espaço ou quebra de linha no meio do valor')
  const limpo = valor.trim().replace(/^["'`]+|["'`]+$/g, '')
  const prefixoEsperadoOk = limpo.startsWith(prefixoEsperado)
  if (!prefixoEsperadoOk) problemas.push(`não começa com "${prefixoEsperado}" (parece valor de exemplo, chave de outro serviço ou texto errado)`)
  if (limpo.length < tamanhoMinimo) problemas.push(`curto demais (${limpo.length} caracteres; o normal é ${tamanhoMinimo} ou mais): pode ter sido cortado ao colar`)
  return { definida: true, tamanho: valor.length, prefixoEsperadoOk, problemas }
}

export interface DiagnosticoDoAmbienteDeIa {
  claude: DiagnosticoDaChave
  gemini: DiagnosticoDaChave
  // Variáveis que mudam para ONDE a chamada vai ou COMO ela se autentica.
  claudeBaseUrlDefinida: boolean
  claudeAuthTokenDefinido: boolean
}

export function diagnosticoDoAmbienteDeIa(env: NodeJS.ProcessEnv = process.env): DiagnosticoDoAmbienteDeIa {
  return {
    claude: diagnosticarChave(env.ANTHROPIC_API_KEY, 'sk-ant-', 40),
    gemini: diagnosticarChave(env.GEMINI_API_KEY, 'AIza', 30),
    claudeBaseUrlDefinida: !!env.ANTHROPIC_BASE_URL?.trim(),
    claudeAuthTokenDefinido: !!env.ANTHROPIC_AUTH_TOKEN?.trim(),
  }
}

function descreve(nome: string, d: DiagnosticoDaChave): string {
  if (!d.definida) return `${nome}: AUSENTE`
  const estado = d.problemas.length === 0 ? 'formato aparentemente correto' : `PROBLEMAS: ${d.problemas.join('; ')}`
  return `${nome}: ${d.tamanho} caracteres, ${estado}`
}

// Texto curto para o detalhe técnico (só admin vê) e para o log.
export function textoDoDiagnostico(env: NodeJS.ProcessEnv = process.env): string {
  const d = diagnosticoDoAmbienteDeIa(env)
  const extras: string[] = []
  if (d.claudeBaseUrlDefinida) extras.push('ANTHROPIC_BASE_URL está definida (desvia as chamadas da Claude para outro endereço)')
  if (d.claudeAuthTokenDefinido) extras.push('ANTHROPIC_AUTH_TOKEN está definida (pode se somar à chave de API)')
  return [descreve('ANTHROPIC_API_KEY', d.claude), descreve('GEMINI_API_KEY', d.gemini), ...extras].join(' | ')
}

// O erro é de autenticação/permissão da chave?
export function pareceErroDeChave(mensagem: string): boolean {
  return /\b(401|403)\b|authentication|api key|invalid x-api-key|permission/i.test(mensagem)
}
