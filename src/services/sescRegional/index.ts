// ============================================================
// services/sescRegional/index.ts — Registro das unidades do SESC Regional que
// o coletor (workers/coletorSescRegional.ts) varre. Para incluir uma unidade
// nova: criar <uf>.ts exportando uma SescUnidade e adicioná-la aqui.
//
// Fase 1 (lista no HTML/AJAX público): AL, AM, CE, DF, MA, MS, MT, PA, SC, SE.
// Fase 2 (página da lista localizada a partir da home): AC, AP, ES, MG, PB, PE,
// PI, PR (API JSON por POST), RN, RO, TO.
// Fase 3 (plataforma Paradigma, AJAX por POST — paradigma.ts): BA, DN, RJ, RS, SP.
// O SESC GO tem coletor próprio (services/sescGoParser.ts).
// Ainda fora: RR (aplicação JavaScript sem API localizada) — ver relatório.
// ============================================================

import { SescUnidade } from './tipos'
import { sescAL } from './al'
import { sescAM } from './am'
import { sescCE } from './ce'
import { sescDF } from './df'
import { sescMA } from './ma'
import { sescMS } from './ms'
import { sescMT } from './mt'
import { sescPA } from './pa'
import { sescSC } from './sc'
import { sescSE } from './se'
import { sescAC } from './ac'
import { sescAP } from './ap'
import { sescES } from './es'
import { sescMG } from './mg'
import { sescPB } from './pb'
import { sescPE } from './pe'
import { sescPI } from './pi'
import { sescPR } from './pr'
import { sescRN } from './rn'
import { sescRO } from './ro'
import { sescTO } from './to'
import { sescBA, sescDN, sescRJ, sescRS, sescSP } from './paradigma'

export const SESC_UNIDADES: SescUnidade[] = [
  sescAC,
  sescAL,
  sescAM,
  sescAP,
  sescBA,
  sescCE,
  sescDF,
  sescDN,
  sescES,
  sescMA,
  sescMG,
  sescMS,
  sescMT,
  sescPA,
  sescPB,
  sescPE,
  sescPI,
  sescPR,
  sescRJ,
  sescRN,
  sescRO,
  sescRS,
  sescSC,
  sescSE,
  sescSP,
  sescTO,
]
