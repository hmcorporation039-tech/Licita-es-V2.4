import { API_BASE } from './config.mjs'

async function estado() {
  try {
    return await chrome.storage.local.get(['token', 'tenderId', 'vigiando', 'ultimoLance', 'sugestao', 'status'])
  } catch {
    return {}
  }
}

async function guardar(dados) {
  try {
    await chrome.storage.local.set(dados)
  } catch {
    /* storage indisponível */
  }
}

async function registrarMelhorLance(valor) {
  const { token, tenderId, vigiando } = await estado()
  if (!vigiando) return
  if (!token || !tenderId) {
    await guardar({ status: 'Abra o pregão no site da Bela e faça login para a extensão pegar o acesso.' })
    return
  }
  try {
    const resposta = await fetch(`${API_BASE}/api/tenders/${tenderId}/pregao/lances`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ alvo: 'global', origem: 'MELHOR_LANCE', valor }),
    })
    if (!resposta.ok) {
      await guardar({ status: `A Bela respondeu ${resposta.status}. Confira o login e o pregão aberto.` })
      return
    }
    const painel = await resposta.json()
    const avaliacao = painel?.alvos?.[0]?.avaliacao ?? null
    await guardar({
      ultimoLance: valor,
      sugestao: avaliacao?.sugestao ?? null,
      status: avaliacao?.mensagem ?? 'Melhor lance registrado.',
    })
  } catch {
    await guardar({ status: 'Sem conexão com a Bela agora.' })
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.tipo === 'melhor-lance' && typeof msg.valor === 'number') {
    void registrarMelhorLance(msg.valor)
  } else if (msg?.tipo === 'credenciais') {
    void guardar({ token: msg.token ?? null, tenderId: msg.tenderId ?? null })
  }
})
