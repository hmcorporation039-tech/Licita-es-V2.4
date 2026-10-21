const DESTINO_PADRAO = '/dashboard'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

function lerAviso(event) {
  if (!event.data) return {}
  try {
    return event.data.json()
  } catch {
    return { corpo: event.data.text() }
  }
}

self.addEventListener('push', (event) => {
  const aviso = lerAviso(event)
  const tag = typeof aviso.tag === 'string' && aviso.tag ? aviso.tag : undefined
  event.waitUntil(
    self.registration.showNotification(aviso.titulo || 'Licita Bela', {
      body: aviso.corpo || '',
      icon: '/app/icon-192.png',
      lang: 'pt-BR',
      tag,
      renotify: Boolean(tag),
      data: { url: typeof aviso.url === 'string' ? aviso.url : DESTINO_PADRAO },
    })
  )
})

async function abrirDestino(destino) {
  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const daLicitaBela = janelas.find((janela) => new URL(janela.url).origin === self.location.origin)
  if (daLicitaBela) {
    await daLicitaBela.focus()
    if ('navigate' in daLicitaBela) await daLicitaBela.navigate(destino.href)
    return
  }
  await self.clients.openWindow(destino.href)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = new URL(event.notification.data?.url || DESTINO_PADRAO, self.location.origin)
  if (destino.origin !== self.location.origin) return
  event.waitUntil(abrirDestino(destino))
})
