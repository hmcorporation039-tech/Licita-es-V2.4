// ============================================================
// lib/primeirosPassos.ts — "Primeiros passos" do painel para quem está no teste.
// Três tarefas que mostram o valor do sistema logo no começo; cada uma fica
// feita sozinha quando a empresa faz a ação (nada é marcado à mão):
// 1. dizer o que vende: ter um item monitorado (o do interesse do cadastro já conta);
// 2. salvar uma licitação: "Salvar" (favorita) ou "Vou participar/Avaliando" (plano);
// 3. perguntar ao edital: o teste tem perguntas no mês, mas não análise nova.
// Some quando as três estão feitas ou quando a empresa sai do plano de teste.
// ============================================================

import { PLANO_DE_TESTE } from './acessoEncerrado'

export type IdDoPasso = 'oQueVende' | 'salvarLicitacao' | 'perguntarAoEdital'

export interface ContagensDosPrimeirosPassos {
  planCode: string
  itensMonitorados: number
  favoritas: number
  planosDeParticipacao: number
  perguntasAoEdital: number
  matches: number
  buscasEmAndamento: number
}

export interface PrimeirosPassos {
  mostrar: boolean
  feitos: number
  total: number
  passos: Array<{ id: IdDoPasso; feito: boolean }>
  matches: number
  buscando: boolean
}

export function montarPrimeirosPassos(c: ContagensDosPrimeirosPassos): PrimeirosPassos {
  const passos: PrimeirosPassos['passos'] = [
    { id: 'oQueVende', feito: c.itensMonitorados > 0 },
    { id: 'salvarLicitacao', feito: c.favoritas + c.planosDeParticipacao > 0 },
    { id: 'perguntarAoEdital', feito: c.perguntasAoEdital > 0 },
  ]
  const feitos = passos.filter((p) => p.feito).length
  return {
    mostrar: c.planCode === PLANO_DE_TESTE && feitos < passos.length,
    feitos,
    total: passos.length,
    passos,
    matches: c.matches,
    buscando: c.buscasEmAndamento > 0,
  }
}
