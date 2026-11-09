import { CHAVE_DO_TOKEN_NO_APP, ehHostDoApp } from './config.mjs'

function tenderDaUrl() {
  // Pregão, licitação ou estudo de custos: qualquer uma dessas telas diz qual licitação usar.
  const m = location.pathname.match(/\/(?:tenders|escolhidas)\/([0-9a-f-]{36})(?:\/|$)/i)
  return m ? m[1] : null
}

function enviarCredenciais() {
  if (!ehHostDoApp(location.hostname)) return
  let token = null
  try {
    token = localStorage.getItem(CHAVE_DO_TOKEN_NO_APP)
  } catch {
    token = null
  }
  chrome.runtime.sendMessage({
    tipo: 'credenciais',
    token: token ?? null,
    tenderId: tenderDaUrl(),
    em: Date.now(),
  })
}

enviarCredenciais()
setInterval(enviarCredenciais, 30000)

// Marca a página para o site saber que a extensão está instalada (e a versão).
try {
  document.documentElement.dataset.belaExtensao = chrome.runtime.getManifest().version
} catch {
  /* página sem DOM pronto */
}

// O site pede para abrir um portal com a Bela: liga a leitura da licitação indicada.
window.addEventListener('bela:abrir-portal', (e) => {
  // O detalhe é só o id (texto): objetos não atravessam bem do site para a extensão.
  const tenderId = e?.detail
  if (typeof tenderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(tenderId)) return
  enviarCredenciais()
  chrome.runtime.sendMessage({ tipo: 'ativar-leitura', tenderId })
})
