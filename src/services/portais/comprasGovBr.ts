import { PORTAIS } from '../../lib/portais'
import { AutomacaoNaoDisponivel, type AdaptadorDePortal } from './tipos'

const PORTAL = PORTAIS.find((p) => p.id === 'COMPRASNET')

if (!PORTAL) throw new Error('Portal COMPRASNET não registrado em lib/portais.')

const MENSAGEM_PENDENTE =
  'A automação do Compras.gov.br ainda não foi validada contra a sala de disputa real. O login é pelo gov.br com CAPTCHA, que não é automatizável: a atuação é assistida — a Bela calcula e sugere o lance e a pessoa confirma no portal.'

function sessaoRealPendente(): never {
  throw new AutomacaoNaoDisponivel('COMPRASNET', 'SESSAO_REAL_PENDENTE', MENSAGEM_PENDENTE)
}

export const comprasGovBrAdapter: AdaptadorDePortal = {
  portalId: 'COMPRASNET',
  automacao: PORTAL.automacao,
  loginComCaptcha: PORTAL.loginComCaptcha,
  async entrar() {
    sessaoRealPendente()
  },
  async lerMelhorLance() {
    sessaoRealPendente()
  },
  async darLance() {
    sessaoRealPendente()
  },
}
