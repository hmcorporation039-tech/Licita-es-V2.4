// ============================================================
// lib/prestadoresDaRegiao.ts — O caminho inverso de "Obras e ganhadores": quem
// ganhou uma obra longe de casa procura quem execute um serviço perto dela.
// Duas fontes: as empresas da Bela que aceitaram aparecer como prestador e,
// como complemento, o Google (nota e número de avaliações).
// Aqui ficam os serviços, o casamento com os nichos e a ordem. Sem rede e sem banco.
// ============================================================

import { haversineKm, normalize } from './geoService'
import { CATALOGO_DE_NICHOS, naRegiao, type RegiaoDaEmpresa } from './obrasEGanhadores'

export interface ServicoProcurado {
  id: string
  nome: string
  /** O que se digita no Google para achar quem faz o serviço. */
  busca: string
  /** Pedaços de palavra que, no nome de um nicho próprio, mostram que a empresa faz o serviço. */
  palavras: string[]
}

const BUSCA: Record<string, { busca: string; palavras: string[] }> = {
  eletrica: { busca: 'empresa de instalações elétricas', palavras: ['eletric', 'iluminac', 'quadro'] },
  hidraulica: { busca: 'empresa de instalações hidráulicas', palavras: ['hidraul', 'encanad', 'saneament', 'esgoto', 'drenag'] },
  pintura: { busca: 'empresa de pintura predial', palavras: ['pintur', 'pintor', 'textura'] },
  climatizacao: { busca: 'instalação de ar-condicionado', palavras: ['ar condicionado', 'climatiz', 'refrigera'] },
  esquadrias: { busca: 'serralheria e esquadrias', palavras: ['esquadri', 'serralher', 'vidrac', 'vidro', 'metalic'] },
  cobertura: { busca: 'empresa de telhados e impermeabilização', palavras: ['telhad', 'cobertur', 'impermeabiliz', 'calha'] },
  terraplenagem: { busca: 'terraplenagem', palavras: ['terraplen', 'escavac', 'maquina'] },
  pavimentacao: { busca: 'empresa de pavimentação', palavras: ['paviment', 'asfalt', 'calcament', 'bloquete'] },
  equipamentos: { busca: 'locação de equipamentos para construção', palavras: ['locac', 'aluguel', 'andaime', 'betoneira'] },
  materiais: { busca: 'material de construção e concreto usinado', palavras: ['material', 'concreto', 'agregad', 'areia', 'brita'] },
  transporte: { busca: 'transporte de entulho e caçamba', palavras: ['transport', 'frete', 'cacamba', 'entulho', 'caminhao'] },
  projetos: { busca: 'topografia e projetos de engenharia', palavras: ['topograf', 'projet', 'engenharia', 'laudo'] },
  spda: { busca: 'para-raios SPDA aterramento', palavras: ['spda', 'para raio', 'pararraio', 'aterrament'] },
  'mao-de-obra': { busca: 'empreiteira de mão de obra para construção', palavras: ['mao de obra', 'pedreiro', 'empreit'] },
  'limpeza-pos-obra': { busca: 'limpeza pós-obra', palavras: ['limpeza pos', 'pos obra', 'limpeza fina'] },
  seguranca: { busca: 'segurança do trabalho', palavras: ['seguranca do trabalho', 'epi', 'pcmso', 'treinament'] },
  paisagismo: { busca: 'paisagismo e jardinagem', palavras: ['paisagis', 'jardin', 'rocag', 'poda'] },
  gerador: { busca: 'locação de gerador de energia', palavras: ['gerador', 'nobreak', 'energia'] },
}

export const SERVICOS_PROCURADOS: ServicoProcurado[] = CATALOGO_DE_NICHOS.map((n) => ({
  id: n.id,
  nome: n.nome,
  busca: BUSCA[n.id]?.busca ?? n.nome,
  palavras: BUSCA[n.id]?.palavras ?? [normalize(n.nome)],
}))

export function servicoPorId(id: string): ServicoProcurado | undefined {
  return SERVICOS_PROCURADOS.find((s) => s.id === id)
}

/** O nicho da empresa atende o serviço? Pelo nome do catálogo ou, num nicho próprio, por palavra no nome. */
export function nichoAtende(nicho: { nome: string }, servico: ServicoProcurado): boolean {
  if (nicho.nome === servico.nome) return true
  const nome = normalize(nicho.nome)
  return servico.palavras.some((p) => nome.includes(p))
}

export interface LocalDaObra {
  municipio: string
  uf: string
  lat: number
  lng: number
}

/**
 * A empresa atende a obra? Vale a região que ela mesma cadastrou (raio ou estados)
 * ou a base dela estar dentro do raio procurado a partir da obra.
 */
export function prestadorAtendeAObra(regiao: RegiaoDaEmpresa, obra: LocalDaObra, raioDaBuscaKm: number): { atende: boolean; distanciaKm: number | null } {
  const { dentro, distanciaKm } = naRegiao(regiao, { uf: obra.uf, lat: obra.lat, lng: obra.lng })
  return { atende: dentro || (distanciaKm !== null && distanciaKm <= raioDaBuscaKm), distanciaKm }
}

// ---------- Google ----------

export interface LugarDoGoogle {
  id: string
  nome: string
  endereco: string | null
  nota: number | null
  avaliacoes: number
  telefone: string | null
  site: string | null
  linkMaps: string | null
  lat: number | null
  lng: number | null
}

// Nota "ajustada": 5,0 com 3 avaliações não passa na frente de 4,8 com 200.
const NOTA_DE_PARTIDA = 4.2
const PESO_DA_PARTIDA = 10
export function notaAjustada(nota: number | null, avaliacoes: number): number {
  if (nota === null || avaliacoes <= 0) return 0
  return (nota * avaliacoes + NOTA_DE_PARTIDA * PESO_DA_PARTIDA) / (avaliacoes + PESO_DA_PARTIDA)
}

export interface LugarOrdenado extends LugarDoGoogle {
  distanciaKm: number | null
  notaAjustada: number
}

/** Tira o que está longe demais e ordena pela nota ajustada (empate: mais perto primeiro). */
export function ordenarLugares(lugares: LugarDoGoogle[], obra: LocalDaObra, raioKm: number): LugarOrdenado[] {
  const vistos = new Set<string>()
  return lugares
    .flatMap((l) => {
      if (vistos.has(l.id)) return []
      vistos.add(l.id)
      const distanciaKm = l.lat !== null && l.lng !== null ? Math.round(haversineKm(obra.lat, obra.lng, l.lat, l.lng)) : null
      if (distanciaKm !== null && distanciaKm > raioKm) return []
      return [{ ...l, distanciaKm, notaAjustada: Math.round(notaAjustada(l.nota, l.avaliacoes) * 100) / 100 }]
    })
    .sort((a, b) => b.notaAjustada - a.notaAjustada || (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity))
}

/** Converte um "place" da Places API (New) no que a tela mostra. */
export function lugarDoGoogle(bruto: unknown): LugarDoGoogle | null {
  if (!bruto || typeof bruto !== 'object') return null
  const p = bruto as Record<string, unknown>
  const id = typeof p.id === 'string' ? p.id : ''
  const nomeObj = p.displayName as { text?: unknown } | undefined
  const nome = typeof nomeObj?.text === 'string' ? nomeObj.text.trim() : ''
  if (!id || !nome) return null
  if (typeof p.businessStatus === 'string' && p.businessStatus !== 'OPERATIONAL') return null
  const loc = p.location as { latitude?: unknown; longitude?: unknown } | undefined
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    id,
    nome,
    endereco: txt(p.formattedAddress),
    nota: num(p.rating),
    avaliacoes: num(p.userRatingCount) ?? 0,
    telefone: txt(p.nationalPhoneNumber),
    site: txt(p.websiteUri),
    linkMaps: txt(p.googleMapsUri),
    lat: num(loc?.latitude),
    lng: num(loc?.longitude),
  }
}
