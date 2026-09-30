// ============================================================
// services/sescRegional/index.ts — Registro das unidades do SESC Regional que
// o coletor (workers/coletorSescRegional.ts) varre. Para incluir uma unidade
// nova: criar <uf>.ts exportando uma SescUnidade e adicioná-la aqui.
//
// Fase 1 (portais com lista no HTML/AJAX público): AL, AM, CE, DF, MA, MS, MT,
// PA, SC, SE. O SESC GO tem coletor próprio (services/sescGoParser.ts).
// Ainda fora (sem lista acessível por GET, ver relatório): DN, RJ, SP, BA
// (Paradigma/ASP.NET com postback), RR (aplicação JavaScript) e as unidades
// cujo endereço da planilha é só a home do site.
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

export const SESC_UNIDADES: SescUnidade[] = [
  sescAL,
  sescAM,
  sescCE,
  sescDF,
  sescMA,
  sescMS,
  sescMT,
  sescPA,
  sescSC,
  sescSE,
]
