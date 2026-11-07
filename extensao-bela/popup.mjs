const reais = (n) => (typeof n === 'number' ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—')

const alternar = document.getElementById('alternar')
const acesso = document.getElementById('acesso')
const lance = document.getElementById('lance')
const sugestao = document.getElementById('sugestao')
const status = document.getElementById('status')
const chat = document.getElementById('chat')
const proximo = document.getElementById('proximo')
const proximoTexto = document.getElementById('proximo-texto')
const preencher = document.getElementById('preencher')
const preenchido = document.getElementById('preenchido')
let valorParaPreencher = null

async function ler() {
  try {
    return await chrome.storage.local.get(['vigiando', 'token', 'tenderId', 'ultimoLance', 'sugestao', 'status', 'chat', 'proximoLance'])
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
  const p = e.proximoLance
  valorParaPreencher = ligado && typeof p?.valor === 'number' ? p.valor : null
  proximo.textContent = valorParaPreencher ? reais(valorParaPreencher) : '—'
  proximoTexto.textContent = p?.texto ?? ''
  preencher.disabled = valorParaPreencher === null
  preencher.className = valorParaPreencher === null ? 'off' : 'preencher'
  preencher.textContent = valorParaPreencher ? `Preencher ${reais(valorParaPreencher)} no portal` : 'Preencher no portal'
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

preencher.addEventListener('click', async () => {
  if (valorParaPreencher === null) return
  const valor = valorParaPreencher
  try {
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true })
    const r = aba ? await chrome.tabs.sendMessage(aba.id, { tipo: 'preencher-lance', valor }) : null
    if (!r?.ok) {
      preenchido.textContent = r?.motivo ?? 'Abra a sala de disputa nesta aba e tente de novo.'
      return
    }
    preenchido.textContent = `Escrevi ${r.texto} no campo de lance (destacado em laranja). Confira e clique em enviar no portal.`
    chrome.runtime.sendMessage({ tipo: 'lance-preenchido', valor })
  } catch {
    preenchido.textContent = 'Abra a sala de disputa nesta aba e tente de novo.'
  }
})

const botaoDaProposta = document.getElementById('proposta')
const statusDaProposta = document.getElementById('proposta-status')

botaoDaProposta.addEventListener('click', async () => {
  statusDaProposta.textContent = 'Buscando os preços do estudo…'
  try {
    const r = await chrome.runtime.sendMessage({ tipo: 'buscar-proposta' })
    if (!r?.ok) {
      statusDaProposta.textContent = r?.motivo ?? 'Não foi possível buscar a proposta.'
      return
    }
    const itens = r.proposta.itens ?? []
    if (itens.length === 0) {
      statusDaProposta.textContent = 'O estudo de custos ainda não tem preço de venda em nenhum item.'
      return
    }
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true })
    const feito = aba ? await chrome.tabs.sendMessage(aba.id, { tipo: 'preencher-proposta', itens }) : null
    if (!feito?.ok) {
      statusDaProposta.textContent = feito?.motivo ?? 'Abra a tela de cadastro da proposta do portal nesta aba.'
      return
    }
    const partes = [`Preenchi ${feito.preenchidos.length} de ${itens.length} itens (campos em laranja).`]
    if (feito.naoEncontrados.length) partes.push(`Não achei na tela: ${feito.naoEncontrados.join(', ')}.`)
    if (feito.semCampo.length) partes.push(`Sem campo de preço: ${feito.semCampo.join(', ')}.`)
    if (r.proposta.semPreco?.length) partes.push(`${r.proposta.semPreco.length} item(ns) sem preço no estudo.`)
    partes.push('Confira tudo e envie no portal.')
    statusDaProposta.textContent = partes.join(' ')
  } catch {
    statusDaProposta.textContent = 'Abra a tela de cadastro da proposta do portal nesta aba e tente de novo.'
  }
})

chrome.storage?.onChanged?.addListener(async () => pintar(await ler()))

ler().then(pintar)
