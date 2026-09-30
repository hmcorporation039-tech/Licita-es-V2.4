// ============================================================
// services/sescRegional/pe.ts — Sesc Pernambuco
// A URL da planilha (https://www.sescpe.org.br/sobre-o-sesc/licitacoes/) é só um
// redirecionamento para o portal https://licitacoes.sescpe.com.br/ (WordPress/Elementor),
// cuja lista é montada NO NAVEGADOR: o JavaScript da página baixa uma planilha pública do
// Google Sheets (`export?format=xlsx`) e desenha os cards. O HTML estático só tem
// "Carregando portal de licitações...". Como o parser é puro e recebe texto, buscamos a MESMA
// planilha em `export?format=csv` (texto) e lemos o CSV aqui.
// Colunas: status, modalidade, natureza, titulo (nº/ano), objeto, data_abertura (dd/mm/aaaa),
//   data_homologacao, ultima_atualizacao, link_sharepoint (pasta do Drive com o edital e anexos),
//   link_externo (Licitações-e, genérico), publicado (Sim/Não — o portal só mostra "Sim").
// A planilha traz ~900 linhas vazias no fim (só com data 01/01/2026): são ignoradas.
// ============================================================

import { NormalizedTender } from '../../types'
import { parseDataBr } from '../../lib/scrapingHelpers'
import {
  ContextoDeParse,
  SescUnidade,
  ehLicitacaoAtual,
  limparTexto,
  montarTender,
  urlAbsoluta,
} from './tipos'

// Planilha que alimenta o portal (id fixado no JavaScript do próprio site).
const PLANILHA_CSV =
  'https://docs.google.com/spreadsheets/d/1Pde6F6z8h_k8USA84BjegdmPcfnS2un4M4u6XMwTTRs/export?format=csv'

// CSV RFC 4180 mínimo: campos entre aspas podem ter vírgula, quebra de linha e "" escapado.
function lerCsv(texto: string): string[][] {
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  const t = texto.replace(/^\uFEFF/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"'
          i++
        } else aspas = false
      } else campo += c
    } else if (c === '"') aspas = true
    else if (c === ',') {
      linha.push(campo)
      campo = ''
    } else if (c === '\n') {
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else if (c !== '\r') campo += c
  }
  if (campo || linha.length) {
    linha.push(campo)
    linhas.push(linha)
  }
  return linhas
}

function slug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parse(csv: string, ctx: ContextoDeParse): NormalizedTender[] {
  const linhas = lerCsv(csv)
  if (linhas.length < 2) return []
  const cab = linhas[0].map((c) => slug(c))
  const col = (nome: string) => cab.indexOf(nome)
  const iStatus = col('status')
  const iMod = col('modalidade')
  const iTitulo = col('titulo')
  const iObjeto = col('objeto')
  const iAbertura = col('data-abertura')
  const iLinkDrive = col('link-sharepoint')
  const iLinkExt = col('link-externo')
  const iPublicado = col('publicado')
  if ([iStatus, iTitulo, iObjeto].includes(-1)) return []

  const resultado: NormalizedTender[] = []
  const vistos = new Set<string>()

  for (const l of linhas.slice(1)) {
    const v = (i: number) => (i >= 0 ? limparTexto(l[i]) : '')
    const titulo = v(iTitulo)
    const objeto = v(iObjeto)
    if (!titulo || !objeto) continue
    if (iPublicado >= 0 && v(iPublicado).toLowerCase() !== 'sim') continue

    const aberturaAt = parseDataBr(v(iAbertura))
    if (!ehLicitacaoAtual({ situacao: v(iStatus), aberturaAt }, ctx.agora)) continue

    // O nº reinicia por modalidade (Pregão 002/2026, Concorrência 002/2026, Leilão 002/2026).
    const modalidadeTexto = v(iMod)
    const idLocal = `${slug(modalidadeTexto) || 'proc'}-${titulo.replace(/\//g, '-')}`
    if (vistos.has(idLocal)) continue
    vistos.add(idLocal)

    const drive = urlAbsoluta(v(iLinkDrive), ctx.url)
    const externo = urlAbsoluta(v(iLinkExt), ctx.url)
    resultado.push(
      montarTender(sescPE, {
        idLocal,
        objeto,
        modalidadeTexto: modalidadeTexto || objeto,
        numeroControle: titulo,
        aberturaAt,
        linkEdital: drive ?? externo,
        anexos: drive ? [{ uri: drive, titulo: 'Edital e anexos (pasta do Drive)' }] : [],
      })
    )
  }

  return resultado
}

export const sescPE: SescUnidade = {
  uf: 'PE',
  nome: 'Sesc Pernambuco',
  urls: () => [PLANILHA_CSV],
  parse,
}
