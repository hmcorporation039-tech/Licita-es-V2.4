import { extrairMelhorLance } from './lib/valor.mjs'
import { capturarEstrutura } from './lib/captura.mjs'
import { chaveLocal, extrairMensagens } from './lib/chat.mjs'
import { preencherLance } from './lib/preencher.mjs'
import { portalDoHost } from './config.mjs'

const portal = portalDoHost(location.hostname)
let ultimoEnviado = null

function conferir() {
  if (!portal) return
  const achado = extrairMelhorLance(document, portal.seletoresDoMelhorLance)
  if (!achado || achado.valor === ultimoEnviado) return
  ultimoEnviado = achado.valor
  chrome.runtime.sendMessage({
    tipo: 'melhor-lance',
    valor: achado.valor,
    seletor: achado.seletor,
    em: Date.now(),
  })
}

// Chat do pregoeiro: manda só as mensagens que ainda não foram enviadas desta página.
const mensagensVistas = new Set()
function conferirChat() {
  if (!portal?.seletoresDoChat) return
  const novas = extrairMensagens(document, portal.seletoresDoChat).filter((m) => !mensagensVistas.has(chaveLocal(m)))
  if (novas.length === 0) return
  for (const m of novas) mensagensVistas.add(chaveLocal(m))
  chrome.runtime.sendMessage({ tipo: 'mensagens-chat', mensagens: novas.slice(-50), em: Date.now() })
}

async function ligado() {
  try {
    const { vigiando } = await chrome.storage.local.get('vigiando')
    return vigiando === true
  } catch {
    return false
  }
}

async function iniciar() {
  if (!portal) return
  if (!(await ligado())) return
  conferir()
  conferirChat()
  let agendado = null
  const observador = new MutationObserver(() => {
    conferir()
    // O chat muda em rajadas: espera a página assentar antes de ler.
    if (agendado) clearTimeout(agendado)
    agendado = setTimeout(conferirChat, 800)
  })
  observador.observe(document.body, { childList: true, subtree: true, characterData: true })
}

// A captura atende mesmo com a leitura desligada: serve justamente para achar os seletores.
chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  if (msg?.tipo === 'capturar') {
    responder(capturarEstrutura(document))
  } else if (msg?.tipo === 'preencher-lance') {
    // Só escreve no campo; nunca clica em enviar.
    if (!portal) return responder({ ok: false, motivo: 'Esta aba não é a sala de disputa de um portal conhecido.' })
    responder(preencherLance(document, { valor: msg.valor, seletores: portal.seletoresDoCampoDeLance, formato: portal.formatoDoCampoDeLance }, window))
  }
})

iniciar()
