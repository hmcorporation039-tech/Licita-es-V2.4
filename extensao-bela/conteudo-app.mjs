import { CHAVE_DO_TOKEN_NO_APP, ehHostDoApp } from './config.mjs'

function tenderDaUrl() {
  const m = location.pathname.match(/\/tenders\/([^/]+)\/pregao/)
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
