import { API_BASE } from './config.mjs'

async function estado() {
  try {
    return await chrome.storage.local.get(['token', 'tenderId', 'vigiando', 'ultimoLance', 'sugestao', 'status', 'chat'])
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

async function registrarMensagens(mensagens) {
  const { token, tenderId, vigiando } = await estado()
  if (!vigiando || !token || !tenderId) return
  try {
    const resposta = await fetch(`${API_BASE}/api/tenders/${tenderId}/pregao/mensagens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ mensagens }),
    })
    if (!resposta.ok) return
    const r = await resposta.json()
    const urgente = (r.mensagens ?? []).find((m) => m.urgente && !m.lida)
    await guardar({ chat: { naoLidas: r.naoLidas ?? 0, urgente: urgente ? { rotulo: urgente.rotulo, texto: urgente.texto.slice(0, 160) } : null, em: Date.now() } })
    if (r.urgentes > 0 && urgente && chrome.notifications) {
      chrome.notifications.create(`chat-${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icone-128.png',
        title: `Bela: ${urgente.rotulo}`,
        message: urgente.texto.slice(0, 180),
        priority: 2,
      })
    }
  } catch {
    /* sem conexão: a próxima mudança da página tenta de novo */
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.tipo === 'mensagens-chat' && Array.isArray(msg.mensagens) && msg.mensagens.length > 0) {
    void registrarMensagens(msg.mensagens)
  } else if (msg?.tipo === 'melhor-lance' && typeof msg.valor === 'number') {
    void registrarMelhorLance(msg.valor)
  } else if (msg?.tipo === 'credenciais') {
    void guardar({ token: msg.token ?? null, tenderId: msg.tenderId ?? null })
  }
})
