export const API_BASE = 'https://api-production-4375e.up.railway.app'

export const APP_HOSTS = ['licitabela.com.br', 'licita-es-v2-4.vercel.app', 'localhost']

export const CHAVE_DO_TOKEN_NO_APP = 'licitacao-platform:token'

export const PORTAIS = [
  {
    nome: 'Compras.gov.br',
    // A sala de disputa do Comprasnet 4.0 fica em cnetmobile.estaleiro.serpro.gov.br.
    hosts: ['compras.gov.br', 'comprasnet.gov.br', 'estaleiro.serpro.gov.br'],
    seletoresDoMelhorLance: [
      '[id*="melhorLance" i]',
      '[id*="menorLance" i]',
      '[class*="melhor-lance" i]',
      '[class*="menor-lance" i]',
      '[data-melhor-lance]',
    ],
    // Etapa 2: campo onde a pessoa digita o lance (a extensão só escreve; quem envia é a pessoa).
    seletoresDoCampoDeLance: [
      'input[formcontrolname*="lance" i]',
      'input[formcontrolname*="valor" i]',
      'input[id*="lance" i]',
      'input[name*="lance" i]',
      'input[placeholder*="lance" i]',
    ],
    // 'br' = 179.100,00 · 'digitos' = 17910000 (campo com máscara) · 'ponto' = 179100.00
    formatoDoCampoDeLance: 'br',
    // Chat do pregoeiro: candidatos até a captura da sala de disputa real.
    // `mensagem` acha cada mensagem; `autor`, `hora` e `texto` são procurados dentro dela.
    seletoresDoChat: {
      mensagem: [
        '[class*="chat" i] [class*="mensagem" i]',
        '[class*="chat" i] [class*="message" i]',
        '[id*="chat" i] li',
        '[class*="mensagens" i] li',
        '[class*="chat" i] li',
      ],
      autor: ['[class*="autor" i]', '[class*="remetente" i]', '[class*="author" i]', 'strong', 'b'],
      hora: ['[class*="hora" i]', '[class*="data" i]', 'time', '[class*="time" i]'],
      texto: ['[class*="texto" i]', '[class*="conteudo" i]', '[class*="text" i]', 'p'],
    },
  },
]

export function portalDoHost(host) {
  const h = (host || '').toLowerCase()
  return PORTAIS.find((p) => p.hosts.some((d) => h === d || h.endsWith('.' + d))) ?? null
}

export function ehHostDoApp(host) {
  const h = (host || '').toLowerCase()
  return APP_HOSTS.some((d) => h === d || h.endsWith('.' + d))
}
