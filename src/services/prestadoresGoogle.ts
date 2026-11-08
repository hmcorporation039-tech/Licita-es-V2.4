// ============================================================
// services/prestadoresGoogle.ts — Busca de prestadores no Google (Places API, "Text Search (New)").
// Só roda com GOOGLE_PLACES_API_KEY configurada. Nada do Google é guardado no banco
// (regra de uso do Google): a busca é feita na hora em que o usuário pede.
// ============================================================

import axios from 'axios'
import { lugarDoGoogle, type LugarDoGoogle } from '../lib/prestadoresDaRegiao'

const URL = 'https://places.googleapis.com/v1/places:searchText'
const CAMPOS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.businessStatus',
].join(',')

// O Google aceita no máximo 50 km no "locationBias".
const RAIO_MAXIMO_DO_VIES_M = 50_000

export class GoogleNaoConfigurado extends Error {
  constructor() {
    super('A busca no Google ainda não foi ativada.')
  }
}

export class GoogleIndisponivel extends Error {}

export function googleConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim())
}

export async function buscarPrestadoresNoGoogle(pedido: { texto: string; centro: { lat: number; lng: number }; raioKm: number }): Promise<LugarDoGoogle[]> {
  const chave = process.env.GOOGLE_PLACES_API_KEY?.trim()
  if (!chave) throw new GoogleNaoConfigurado()
  try {
    const r = await axios.post(
      URL,
      {
        textQuery: pedido.texto,
        languageCode: 'pt-BR',
        regionCode: 'BR',
        pageSize: 20,
        locationBias: {
          circle: {
            center: { latitude: pedido.centro.lat, longitude: pedido.centro.lng },
            radius: Math.min(RAIO_MAXIMO_DO_VIES_M, Math.max(1_000, pedido.raioKm * 1000)),
          },
        },
      },
      {
        timeout: 15_000,
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': CAMPOS },
      }
    )
    const lugares = Array.isArray(r.data?.places) ? (r.data.places as unknown[]) : []
    return lugares.map(lugarDoGoogle).filter((l): l is LugarDoGoogle => l !== null)
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined
    // Não repassa a resposta do Google (pode ecoar dados da chave); só o status.
    throw new GoogleIndisponivel(status ? `O Google respondeu ${status}.` : 'O Google não respondeu.')
  }
}
