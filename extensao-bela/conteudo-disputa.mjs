import { extrairMelhorLance } from './lib/valor.mjs'
import { capturarEstrutura } from './lib/captura.mjs'
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
  const observador = new MutationObserver(() => conferir())
  observador.observe(document.body, { childList: true, subtree: true, characterData: true })
}

// A captura atende mesmo com a leitura desligada: serve justamente para achar os seletores.
chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  if (msg?.tipo !== 'capturar') return
  responder(capturarEstrutura(document))
})

iniciar()
