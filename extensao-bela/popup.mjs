const reais = (n) => (typeof n === 'number' ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—')

const alternar = document.getElementById('alternar')
const acesso = document.getElementById('acesso')
const lance = document.getElementById('lance')
const sugestao = document.getElementById('sugestao')
const status = document.getElementById('status')
const chat = document.getElementById('chat')

async function ler() {
  try {
    return await chrome.storage.local.get(['vigiando', 'token', 'tenderId', 'ultimoLance', 'sugestao', 'status', 'chat'])
  } catch {
    return {}
  }
}

function pintar(e) {
  const ligado = e.vigiando === true
  alternar.textContent = ligado ? 'Lendo lance e chat — desativar' : 'Ativar leitura (lance e chat)'
  alternar.className = ligado ? 'on' : 'off'
  const temAcesso = Boolean(e.token && e.tenderId)
  acesso.textContent = temAcesso ? 'Pronto (login e pregão abertos)' : 'Abra o pregão logado no site da Bela'
  acesso.className = temAcesso ? 'acesso-ok' : 'acesso-falta'
  lance.textContent = reais(e.ultimoLance)
  sugestao.textContent = e.sugestao ? reais(e.sugestao.valor) : '—'
  if (e.status) status.textContent = e.status
  const c = e.chat
  chat.textContent = !c ? 'Nenhuma mensagem lida ainda' : c.urgente ? `${c.urgente.rotulo}: ${c.urgente.texto}` : c.naoLidas > 0 ? `${c.naoLidas} mensagem(ns) nova(s)` : 'Sem mensagens novas'
  chat.className = c?.urgente ? 'acesso-falta' : ''
}

alternar.addEventListener('click', async () => {
  const e = await ler()
  try {
    await chrome.storage.local.set({ vigiando: !(e.vigiando === true) })
  } catch {
    /* storage indisponível */
  }
  pintar(await ler())
})

const capturar = document.getElementById('capturar')
const captura = document.getElementById('captura')

capturar.addEventListener('click', async () => {
  try {
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true })
    const estrutura = aba ? await chrome.tabs.sendMessage(aba.id, { tipo: 'capturar' }) : null
    if (!estrutura) throw new Error('sem resposta')
    await navigator.clipboard.writeText(JSON.stringify(estrutura))
    captura.textContent = `Copiado: ${estrutura.total} elementos da tela. Cole no chamado de suporte da Bela.`
  } catch {
    captura.textContent = 'Abra a sala de disputa do Compras.gov.br nesta aba e tente de novo.'
  }
})

chrome.storage?.onChanged?.addListener(async () => pintar(await ler()))

ler().then(pintar)
