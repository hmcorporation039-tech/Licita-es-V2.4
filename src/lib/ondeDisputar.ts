// Nome curto do portal onde a disputa acontece, para mostrar na lista de licitações.
// O PNCP só reúne as publicações: a disputa acontece no portal que publicou lá
// (BLL, Licitanet, Compras.gov.br...) ou no sistema próprio do órgão.

import { apelidoDaPlataforma, ehOProprioOrgaoPublicando } from './plataformaDeOrigem'
import { portalDaLicitacao } from './portais'

export function ondeDisputar(t: { linkEdital?: string | null; plataformaDeOrigem?: string | null; fonte?: string | null }): string | null {
  const portal = portalDaLicitacao(t)
  if (portal) return portal.nome.split(' — ')[0]
  const nome = t.plataformaDeOrigem?.trim()
  if (!nome) return null
  if (ehOProprioOrgaoPublicando(nome)) return 'Sistema do próprio órgão'
  return apelidoDaPlataforma(nome) || null
}
