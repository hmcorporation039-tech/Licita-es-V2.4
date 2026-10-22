const reais = (n) => (typeof n === 'number' ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—')

const alternar = document.getElementById('alternar')
const acesso = document.getElementById('acesso')
const lance = document.getElementById('lance')
const sugestao = document.getElementById('sugestao')
const status = document.getElementById('status')

async function ler() {
  try {
    return await chrome.storage.local.get(['vigiando', 'token', 'tenderId', 'ultimoLance', 'sugestao', 'status'])
  } catch {
    return {}
  }
}

function pintar(e) {
  const ligado = e.vigiando === true
  alternar.textContent = ligado ? 'Leitura ativa — desativar' : 'Ativar leitura'
  alternar.className = ligado ? 'on' : 'off'
  const temAcesso = Boolean(e.token && e.tenderId)
  acesso.textContent = temAcesso ? 'Pronto (login e pregão abertos)' : 'Abra o pregão logado no site da Bela'
  acesso.className = temAcesso ? 'acesso-ok' : 'acesso-falta'
  lance.textContent = reais(e.ultimoLance)
  sugestao.textContent = e.sugestao ? reais(e.sugestao.valor) : '—'
  if (e.status) status.textContent = e.status
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

chrome.storage?.onChanged?.addListener(async () => pintar(await ler()))

ler().then(pintar)
