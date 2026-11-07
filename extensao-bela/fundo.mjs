import { API_BASE } from './config.mjs'

async function estado() {
  try {
    return await chrome.storage.local.get(['token', 'tenderId', 'vigiando', 'ultimoLance', 'sugestao', 'status', 'chat', 'proximoLance'])
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
    // Etapa 2: a instrução do robô já respeita o piso, o limite de lances e a vedação do edital.
    const instrucao = (painel?.robo?.instrucoes ?? []).find((i) => i.alvo === 'global') ?? painel?.robo?.instrucoes?.[0] ?? null
    const podePreencher = painel?.robo?.disponivel === true && instrucao?.acao === 'dar' && typeof instrucao.valor === 'number'
    await guardar({
      ultimoLance: valor,
      sugestao: avaliacao?.sugestao ?? null,
      status: avaliacao?.mensagem ?? 'Melhor lance registrado.',
      proximoLance: podePreencher
        ? { valor: instrucao.valor, texto: instrucao.texto, alvo: instrucao.alvo }
        : { valor: null, texto: painel?.robo?.disponivel === false ? 'O edital veda robô: dê o lance à mão.' : (instrucao?.texto ?? null) },
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

// Registra na Bela (auditoria) que a extensão escreveu um lance no campo do portal.
async function registrarPreenchimento(valor) {
  const { token, tenderId } = await estado()
  if (!token || !tenderId) return
  try {
    await fetch(`${API_BASE}/api/tenders/${tenderId}/pregao/robo/preenchido`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ valor }),
    })
  } catch {
    /* auditoria é melhor esforço; o lance não depende dela */
  }
}

// Proposta do estudo de custos, para a tela de cadastro de proposta do portal.
async function buscarProposta() {
  const { token, tenderId } = await estado()
  if (!token || !tenderId) return { ok: false, motivo: 'Abra a licitação no site da Bela (logado) para a extensão saber qual proposta usar.' }
  try {
    const resposta = await fetch(`${API_BASE}/api/estudos/${tenderId}/proposta`, { headers: { authorization: `Bearer ${token}` } })
    if (!resposta.ok) return { ok: false, motivo: resposta.status === 403 || resposta.status === 404 ? 'Escolha a licitação e faça o estudo de custos antes.' : `A Bela respondeu ${resposta.status}.` }
    return { ok: true, proposta: await resposta.json() }
  } catch {
    return { ok: false, motivo: 'Sem conexão com a Bela agora.' }
  }
}

chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  if (msg?.tipo === 'buscar-proposta') {
    buscarProposta().then(responder)
    return true
  }
  if (msg?.tipo === 'lance-preenchido' && typeof msg.valor === 'number') {
    void registrarPreenchimento(msg.valor)
  } else if (msg?.tipo === 'mensagens-chat' && Array.isArray(msg.mensagens) && msg.mensagens.length > 0) {
    void registrarMensagens(msg.mensagens)
  } else if (msg?.tipo === 'melhor-lance' && typeof msg.valor === 'number') {
    void registrarMelhorLance(msg.valor)
  } else if (msg?.tipo === 'credenciais') {
    // Em outras telas do site (painel, lista) não há licitação na URL: mantém a última aberta.
    void guardar({ token: msg.token ?? null, ...(msg.tenderId ? { tenderId: msg.tenderId } : {}) })
  }
})
