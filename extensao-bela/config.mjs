export const API_BASE = 'https://api-production-4375e.up.railway.app'

export const APP_HOSTS = ['licitabela.com.br', 'licita-es-v2-4.vercel.app', 'localhost']

export const CHAVE_DO_TOKEN_NO_APP = 'licitacao-platform:token'

// Candidatos genéricos para os portais que ainda não têm a tela da disputa capturada.
// A captura (popup → "Capturar a tela da disputa") mostra o seletor certo de cada portal.
const SELETORES_GENERICOS = {
  seletoresDoMelhorLance: [
    '[id*="melhorLance" i]',
    '[id*="menorLance" i]',
    '[class*="melhor-lance" i]',
    '[class*="menor-lance" i]',
    '[class*="melhorLance" i]',
    '[class*="menorLance" i]',
    '[data-melhor-lance]',
  ],
  seletoresDoCampoDeLance: ['input[name*="lance" i]', 'input[id*="lance" i]', 'input[placeholder*="lance" i]', 'input[formcontrolname*="lance" i]', 'input[name*="valor" i]'],
  formatoDoCampoDeLance: 'br',
  seletoresDaProposta: {
    linha: ['tr[class*="item" i]', '[class*="item-proposta" i]', 'tbody tr'],
    numeroDoItem: ['[class*="numero" i]', 'td:first-child'],
    campoDoPreco: ['input[name*="valor" i]', 'input[id*="valor" i]', 'input[name*="preco" i]'],
  },
  seletoresDoChat: {
    mensagem: ['[class*="chat" i] [class*="mensagem" i]', '[class*="chat" i] [class*="message" i]', '[id*="chat" i] li', '[class*="chat" i] li'],
    autor: ['[class*="autor" i]', '[class*="remetente" i]', 'strong', 'b'],
    hora: ['[class*="hora" i]', 'time', '[class*="data" i]'],
    texto: ['[class*="texto" i]', '[class*="mensagem" i] p', 'p'],
  },
}

// Portais que não abrem dentro da Bela (bloqueiam navegador automático): a Bela trabalha
// neles pela extensão, no Chrome da própria pessoa. Os mesmos domínios de src/lib/portais.ts.
export const PORTAIS_PARTICULARES = [
  { nome: 'Portal de Compras Públicas', hosts: ['portaldecompraspublicas.com.br'] },
  { nome: 'Licitações-e (Banco do Brasil)', hosts: ['licitacoes-e.com.br'] },
  { nome: 'BLL', hosts: ['bll.org.br', 'bllcompras.com', 'bllcompras.com.br'] },
  { nome: 'BNC', hosts: ['bnc.org.br'] },
  { nome: 'Licitar Digital', hosts: ['licitardigital.com.br', 'ammlicita.org.br'] },
  { nome: 'LicitaNet', hosts: ['licitanet.com.br'] },
  { nome: 'BEC/SP', hosts: ['bec.sp.gov.br', 'bec.fazenda.sp.gov.br'] },
  { nome: 'Compras BR', hosts: ['comprasbr.com.br'] },
  { nome: 'Publinexo', hosts: ['publinexo.com.br'] },
]

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
    // Proposta: cada linha de item na tela de cadastro da proposta, o número do item e o campo do preço.
    seletoresDaProposta: {
      linha: ['tr[class*="item" i]', '[class*="item-proposta" i]', '[class*="itemProposta" i]', 'tbody tr', '[class*="item" i][class*="card" i]'],
      numeroDoItem: ['[class*="numero" i]', 'td:first-child', '[class*="item" i] strong'],
      campoDoPreco: ['input[formcontrolname*="valorUnitario" i]', 'input[formcontrolname*="preco" i]', 'input[formcontrolname*="valor" i]', 'input[name*="valor" i]', 'input[id*="valor" i]'],
    },
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

for (const p of PORTAIS_PARTICULARES) PORTAIS.push({ ...SELETORES_GENERICOS, ...p })

export function portalDoHost(host) {
  const h = (host || '').toLowerCase()
  return PORTAIS.find((p) => p.hosts.some((d) => h === d || h.endsWith('.' + d))) ?? null
}

export function ehHostDoApp(host) {
  const h = (host || '').toLowerCase()
  return APP_HOSTS.some((d) => h === d || h.endsWith('.' + d))
}
