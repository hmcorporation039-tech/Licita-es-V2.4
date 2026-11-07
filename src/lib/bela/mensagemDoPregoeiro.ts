// ============================================================
// lib/bela/mensagemDoPregoeiro.ts — O que uma mensagem do chat do pregoeiro pede.
//
// Regra pura (sem banco): classifica a mensagem e diz se ela cita a empresa
// (pelo CNPJ, pela razão social ou pelo nome fantasia). Urgente = a empresa
// foi chamada a agir (convocação, documento, negociação) ou a sessão mudou de
// estado (suspensa, retomada). Na dúvida, é só aviso: quem lê é a pessoa.
// ============================================================

import { createHash } from 'node:crypto'
import { normalize } from '../geoService'

export type CategoriaDaMensagem = 'CONVOCACAO' | 'DOCUMENTO' | 'NEGOCIACAO' | 'SUSPENSAO' | 'RETOMADA' | 'ENCERRAMENTO' | 'AVISO'

export const ROTULO_DA_CATEGORIA: Record<CategoriaDaMensagem, string> = {
  CONVOCACAO: 'Convocação',
  DOCUMENTO: 'Pedido de documento',
  NEGOCIACAO: 'Negociação',
  SUSPENSAO: 'Sessão suspensa',
  RETOMADA: 'Sessão retomada',
  ENCERRAMENTO: 'Encerramento',
  AVISO: 'Aviso',
}

// A ordem importa: a primeira regra que casar define a categoria.
const REGRAS: [CategoriaDaMensagem, RegExp][] = [
  ['SUSPENSAO', /\b(suspens[ao]|suspend(e|o|emos|era)|interromp|pausad[ao])\b/],
  ['RETOMADA', /\b(retom(ad[ao]|aremos|a|ando)|reabert[ao]|reinici)\b/],
  ['NEGOCIACAO', /\b(negocia|contraproposta|contra-proposta|melhor (preco|valor|oferta|proposta)|redu[cz]ao do valor|reduzir o valor|baixar o valor|valor mais vantajoso)\b/],
  ['DOCUMENTO', /\b(anex(o|os|ar|e)|envi(e|ar|o) (a|o|os|as)? ?(proposta|documenta|planilha|catalogo|declara|atestado)|document(o|os|acao) de habilita|proposta (atualizada|ajustada|readequada)|planilha (ajustada|readequada)|diligencia)\b/],
  ['CONVOCACAO', /\b(convoc|chamad[ao] para|solicit[ao] (a|ao) (empresa|licitante|fornecedor)|empresa .{0,40} (deve|devera)|prazo de \d+ ?(min|minutos|hora|horas)|aguardando (o|a) (fornecedor|licitante|empresa))/],
  ['ENCERRAMENTO', /\b(encerrad[ao]|encerramento|homologa|adjudica|sessao (finalizada|encerrada)|resultado)\b/],
]

export interface EmpresaParaCitar {
  cnpj?: string | null
  nomes: string[]
}

const PALAVRAS_GENERICAS_DO_NOME = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'cia', 'comercio', 'servicos', 'industria', 'empresa', 'de', 'da', 'do', 'e'])

function nucleoDoNome(nome: string): string {
  return normalize(nome)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !PALAVRAS_GENERICAS_DO_NOME.has(p))
    .join(' ')
}

export function citaAEmpresa(texto: string, empresa: EmpresaParaCitar): boolean {
  const digitos = texto.replace(/\D/g, '')
  const cnpj = (empresa.cnpj ?? '').replace(/\D/g, '')
  if (cnpj.length === 14 && digitos.includes(cnpj)) return true
  const t = ` ${normalize(texto).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ')} `
  for (const nome of empresa.nomes) {
    const nucleo = nucleoDoNome(nome)
    // Nome de uma palavra só ("Torres") casaria por acaso: exige duas palavras ou uma bem longa.
    const forte = nucleo.includes(' ') ? nucleo.replace(/\s/g, '').length >= 6 : nucleo.length >= 10
    if (forte && t.includes(` ${nucleo} `)) return true
  }
  return false
}

export interface MensagemClassificada {
  categoria: CategoriaDaMensagem
  citaAEmpresa: boolean
  urgente: boolean
}

export function classificarMensagem(texto: string, empresa: EmpresaParaCitar): MensagemClassificada {
  const t = normalize(texto)
  const categoria = REGRAS.find(([, re]) => re.test(t))?.[0] ?? 'AVISO'
  const cita = citaAEmpresa(texto, empresa)
  const pedeAcao = categoria === 'CONVOCACAO' || categoria === 'DOCUMENTO' || categoria === 'NEGOCIACAO'
  const mudaASessao = categoria === 'SUSPENSAO' || categoria === 'RETOMADA'
  return { categoria, citaAEmpresa: cita, urgente: (pedeAcao && cita) || mudaASessao }
}

// Mesma mensagem (autor + texto) = mesma chave: a extensão reenvia o que já viu
// quando a página recarrega, e isso não pode virar mensagem repetida.
export function chaveDaMensagem(autor: string | null | undefined, texto: string, horaNoPortal?: string | null): string {
  const base = `${normalize(autor ?? '')}|${(horaNoPortal ?? '').trim()}|${texto.replace(/\s+/g, ' ').trim()}`
  return createHash('sha256').update(base).digest('hex').slice(0, 40)
}
