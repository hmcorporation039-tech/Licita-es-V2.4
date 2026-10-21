import { api } from '@/lib/api'

const CHAVE_DO_DONO_DO_APARELHO = 'licitabela:celular-ativo-para'

export type TipoDeAvisoNoCelular = 'novas-licitacoes' | 'lembrete-de-prazo' | 'aviso-de-alteracao'

export interface AparelhoComNotificacao {
  id: string
  aparelho: string | null
  createdAt: string
  ultimoEnvioEm: string | null
}

export interface SituacaoDoCelular {
  disponivel: boolean
  chavePublica: string | null
  preferencias: Record<TipoDeAvisoNoCelular, boolean>
  aparelhos: AparelhoComNotificacao[]
}

export class AtivacaoRecusada extends Error {}

export function navegadorAceitaNotificacao(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function ehIphone(): boolean {
  return typeof window !== 'undefined' && /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

export function abertoComoApp(): boolean {
  if (typeof window === 'undefined') return false
  const navegador = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || navegador.standalone === true
}

function lerDono(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_DO_DONO_DO_APARELHO)
  } catch {
    return null
  }
}

function gravarDono(userId: string | null) {
  try {
    if (userId) window.localStorage.setItem(CHAVE_DO_DONO_DO_APARELHO, userId)
    else window.localStorage.removeItem(CHAVE_DO_DONO_DO_APARELHO)
  } catch {}
}

function chaveEmBytes(base64: string): Uint8Array<ArrayBuffer> {
  const comPreenchimento = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binario = window.atob(comPreenchimento.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(binario.length))
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!navegadorAceitaNotificacao()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
  } catch {
    return null
  }
}

export async function inscricaoDesteAparelho(): Promise<PushSubscription | null> {
  if (!navegadorAceitaNotificacao()) return null
  const registro = await navigator.serviceWorker.getRegistration('/')
  return registro ? registro.pushManager.getSubscription() : null
}

export function ativoParaEsteUsuario(inscricao: PushSubscription | null, userId: string): boolean {
  return inscricao !== null && lerDono() === userId
}

async function inscrever(registro: ServiceWorkerRegistration, chavePublica: string): Promise<PushSubscription> {
  const opcoes = { userVisibleOnly: true, applicationServerKey: chaveEmBytes(chavePublica) }
  try {
    return await registro.pushManager.subscribe(opcoes)
  } catch (err) {
    const antiga = await registro.pushManager.getSubscription()
    if (!antiga) throw err
    await antiga.unsubscribe()
    return registro.pushManager.subscribe(opcoes)
  }
}

export async function ativarNesteAparelho(chavePublica: string, userId: string): Promise<void> {
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') {
    throw new AtivacaoRecusada(
      permissao === 'denied'
        ? 'As notificações foram bloqueadas neste navegador. Libere nas configurações do site e tente de novo.'
        : 'Para receber os avisos, toque em "Permitir" quando o navegador perguntar.'
    )
  }
  const registro = await registrarServiceWorker()
  if (!registro) throw new AtivacaoRecusada('Este navegador não conseguiu ativar as notificações.')
  await navigator.serviceWorker.ready
  const inscricao = await inscrever(registro, chavePublica)
  await api.post('/api/celular/aparelhos', inscricao.toJSON())
  gravarDono(userId)
}

export async function desativarNesteAparelho(): Promise<void> {
  const inscricao = await inscricaoDesteAparelho()
  if (inscricao) {
    await api.delete('/api/celular/aparelhos', { endpoint: inscricao.endpoint })
    await inscricao.unsubscribe().catch(() => false)
  }
  gravarDono(null)
}

export async function desligarAoSair(): Promise<void> {
  try {
    const inscricao = await inscricaoDesteAparelho()
    if (inscricao) await api.delete('/api/celular/aparelhos', { endpoint: inscricao.endpoint })
  } catch {}
}

export async function sincronizarEsteAparelho(userId: string): Promise<void> {
  if (!navegadorAceitaNotificacao() || Notification.permission !== 'granted' || lerDono() !== userId) return
  const registro = await registrarServiceWorker()
  const inscricao = registro ? await registro.pushManager.getSubscription() : null
  if (inscricao) await api.post('/api/celular/aparelhos', inscricao.toJSON())
}
