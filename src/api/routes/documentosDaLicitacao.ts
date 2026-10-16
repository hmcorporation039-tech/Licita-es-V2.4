import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../services/tenderService'
import { asyncHandler, ApiError } from '../asyncHandler'
import { estudoPdfLimiter } from '../rateLimit'
import { registrarAuditoria } from '../../services/auditService'
import { dataDaSessao } from '../../lib/dataDaSessao'
import { documentoSchema, type DocumentoDaLicitacao } from '../../lib/documentosDaLicitacao/modelo'
import { dadosDoCertame, dadosDoProponente } from '../../lib/documentosDaLicitacao/proponente'
import { propostaComercial } from '../../lib/documentosDaLicitacao/proposta'
import { declaracoes, IDS_DE_DECLARACAO, MODELOS_DE_DECLARACAO } from '../../lib/documentosDaLicitacao/declaracoes'
import { renderizarPdf } from '../../services/documentos/renderizarPdf'
import { renderizarDocx } from '../../services/documentos/renderizarDocx'
import type { Timbrado } from '../../services/documentos/papelTimbrado'
import { carregar, dadosSalvos } from './estudos'
import { alertasDaAnalise, type AlertaLegal } from '../../lib/alertasLegais'
import { calcularPrazosDaSessao, lerDataTexto } from '../../lib/diasUteis'
import { impugnacao, pedidoDeEsclarecimento } from '../../lib/documentosDaLicitacao/impugnacao'
import { readequarPrecos, type LancesFinais } from '../../lib/documentosDaLicitacao/readequacao'

export const documentosDaLicitacaoRouter = Router({ mergeParams: true })

const CAMPOS_DA_EMPRESA = {
  name: true, tipo: true, cnpj: true, cpf: true, email: true, telefone: true, responsavel: true, responsavelCpf: true, responsavelCargo: true,
  dadosBancarios: true, endereco: true, enderecoNumero: true, enderecoComplemento: true, enderecoBairro: true, enderecoCidade: true, enderecoUf: true, cep: true,
} as const

async function carregarTimbrado(companyId: string): Promise<Timbrado> {
  const [empresa, logo] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: CAMPOS_DA_EMPRESA }),
    prisma.companyLogo.findUnique({ where: { companyId } }),
  ])
  return {
    proponente: dadosDoProponente(empresa),
    logo: logo && (logo.mimeType === 'image/png' || logo.mimeType === 'image/jpeg') ? { conteudo: Buffer.from(logo.conteudo), mimeType: logo.mimeType } : null,
  }
}

async function carregarCertame(tenderId: string) {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    select: {
      orgao: true, numeroControle: true, modalidade: true, objeto: true, fonte: true, aberturaAt: true, encerramentoAt: true, valorEstimado: true,
      analysis: { select: { status: true, resultado: true } },
    },
  })
  if (!tender) throw new ApiError(404, 'Licitação não encontrada')
  const analise = tender.analysis?.status === 'DONE' ? (tender.analysis.resultado as ({ pagamento?: string; prazoEntrega?: string; dataSessao?: string } & Parameters<typeof alertasDaAnalise>[0]) | null) : null
  const sessao = dataDaSessao(tender) ?? lerDataTexto(analise?.dataSessao)
  const prazos = sessao ? calcularPrazosDaSessao(sessao) : null
  return {
    certame: dadosDoCertame({ ...tender, sessao: dataDaSessao(tender) }),
    analise,
    alertas: alertasDaAnalise(analise, tender.valorEstimado != null ? Number(tender.valorEstimado) : null),
    prazo: prazos ? { limite: diaBr(prazos.limiteImpugnacao), passou: prazos.limitePassou } : null,
  }
}

const diaBr = (iso: string) => iso.split('-').reverse().join('/')

const MAX_ALERTAS_NO_DOCUMENTO = 20

function alertasEscolhidos(todos: AlertaLegal[], chaves: string[]): AlertaLegal[] {
  const escolhidos = todos.filter((a) => chaves.includes(a.chave))
  if (escolhidos.length !== new Set(chaves).size) throw new ApiError(400, 'Algum alerta escolhido não existe mais nesta licitação. Recarregue a página.')
  return escolhidos
}

async function lancesFinais(companyId: string, tenderId: string, itens: Array<{ id: string; quantidade: number }>): Promise<LancesFinais> {
  const acompanhamento = await prisma.pregaoAcompanhamento.findUnique({
    where: { companyId_tenderId: { companyId, tenderId } },
    include: { lances: { where: { origem: 'MEU_LANCE' }, orderBy: { createdAt: 'desc' } } },
  })
  if (!acompanhamento) throw new ApiError(409, 'Registre seus lances ou o resultado em "Pregão com a Bela" para gerar a proposta readequada.')
  const ultimoDe = (alvo: string) => acompanhamento.lances.find((l) => l.alvo === alvo)
  const porItem: Record<string, number> = {}
  for (const it of itens) {
    const lance = ultimoDe(it.id)
    if (lance) porItem[it.id] = acompanhamento.criterio === 'UNITARIO' ? Number(lance.valor) * it.quantidade : Number(lance.valor)
  }
  const global = acompanhamento.valorFinal !== null ? Number(acompanhamento.valorFinal) : ultimoDe('global') ? Number(ultimoDe('global')!.valor) : null
  if (global === null && Object.keys(porItem).length === 0) {
    throw new ApiError(409, 'Registre seus lances ou o resultado em "Pregão com a Bela" para gerar a proposta readequada.')
  }
  return itens.length === 1 && global !== null ? { global, porItem: {} } : { global, porItem }
}

const textoCurto = (v: string | undefined) => {
  const t = (v ?? '').replace(/\s+/g, ' ').trim()
  if (!t || /^(nao|não)\s+(informad|especificad|consta)/i.test(t)) return ''
  return t.length > 400 ? `${t.slice(0, 400)}…` : t
}

documentosDaLicitacaoRouter.get(
  '/modelos',
  asyncHandler(async (req, res) => {
    const plano = await prisma.tenderParticipationPlan.findUnique({
      where: { companyId_tenderId: { companyId: req.companyId!, tenderId: req.params.id } },
      select: { status: true },
    })
    const { alertas, prazo } = await carregarCertame(req.params.id)
    res.json({
      impugnacao: {
        analiseFeita: alertas.disponivel,
        prazo,
        alertas: alertas.itens.map((a) => ({ chave: a.chave, titulo: a.titulo, gravidade: a.gravidade, local: a.local ?? null })),
      },
      proposta: plano?.status === 'VOU_PARTICIPAR'
        ? { disponivel: true }
        : { disponivel: false, motivo: 'Escolha a licitação e preencha o preço de venda no estudo de custos para gerar a proposta.' },
      declaracoes: MODELOS_DE_DECLARACAO.map((m) => ({ id: m.id, titulo: m.titulo, fundamento: m.fundamento })),
    })
  })
)

const previaSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('proposta'), validadeDias: z.number().int().min(1).max(365).default(60), readequada: z.boolean().default(false) }),
  z.object({ tipo: z.literal('declaracoes'), declaracoes: z.array(z.enum(IDS_DE_DECLARACAO as [string, ...string[]])).min(1).max(IDS_DE_DECLARACAO.length) }),
  z.object({ tipo: z.literal('impugnacao'), alertas: z.array(z.string().min(1).max(200)).min(1).max(MAX_ALERTAS_NO_DOCUMENTO) }),
  z.object({
    tipo: z.literal('esclarecimento'),
    alertas: z.array(z.string().min(1).max(200)).max(MAX_ALERTAS_NO_DOCUMENTO).default([]),
    perguntas: z.array(z.string().max(1000)).max(10).default([]),
  }),
])

documentosDaLicitacaoRouter.post(
  '/previa',
  asyncHandler(async (req, res) => {
    const pedido = previaSchema.parse(req.body)
    const [timbrado, { certame, analise, alertas, prazo }] = await Promise.all([carregarTimbrado(req.companyId!), carregarCertame(req.params.id)])

    if (pedido.tipo === 'impugnacao' || pedido.tipo === 'esclarecimento') {
      if (!alertas.disponivel && pedido.tipo === 'impugnacao') throw new ApiError(409, 'A impugnação usa os alertas da análise do edital. Faça a análise do edital primeiro.')
      const escolhidos = alertasEscolhidos(alertas.itens, pedido.alertas)
      const r =
        pedido.tipo === 'impugnacao'
          ? impugnacao(timbrado.proponente, certame, escolhidos, prazo)
          : pedidoDeEsclarecimento(timbrado.proponente, certame, escolhidos, pedido.perguntas, prazo)
      res.json({ ...r, temLogo: timbrado.logo !== null })
      return
    }

    if (pedido.tipo === 'declaracoes') {
      const r = declaracoes(timbrado.proponente, certame, pedido.declaracoes)
      res.json({ ...r, temLogo: timbrado.logo !== null })
      return
    }

    const ctx = await carregar(req.companyId!, req.params.id)
    const { dados } = await dadosSalvos(req.companyId!, req.params.id, ctx)
    const readequacao = pedido.readequada
      ? readequarPrecos(
          ctx.itens.map((it) => ({ id: it.id, quantidade: it.quantidade, precoBase: dados.itens[it.id]?.precoVendaUnit ?? null })),
          await lancesFinais(req.companyId!, req.params.id, ctx.itens),
        )
      : null
    const itens = ctx.itens.map((it) => ({
      numero: it.numero,
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: it.quantidade,
      precoUnitario: readequacao ? (readequacao.precos[it.id] ?? null) : (dados.itens[it.id]?.precoVendaUnit ?? null),
    }))
    const prazoDoEstudo = dados.prazo.exigidoDias ? `${dados.prazo.exigidoDias} dias${dados.prazo.exigidoEmDiasUteis ? ' úteis' : ''}` : ''
    const r = propostaComercial(timbrado.proponente, certame, itens, {
      validadeDias: pedido.validadeDias,
      prazoDeEntrega: prazoDoEstudo || textoCurto(analise?.prazoEntrega),
      condicoesDePagamento: textoCurto(analise?.pagamento),
      ...(readequacao ? { lanceFinal: readequacao.total } : {}),
    })
    const pendencias = readequacao ? [...readequacao.pendencias, ...r.pendencias.filter((p) => !p.startsWith('preço de venda'))] : r.pendencias
    res.json({ documento: r.documento, pendencias, total: r.total, temLogo: timbrado.logo !== null })
  })
)

const arquivoSchema = z.object({ formato: z.enum(['pdf', 'docx']), documento: documentoSchema })

const nomeDoArquivo = (doc: DocumentoDaLicitacao, numero: string, extensao: string) => {
  const prefixo =
    doc.tipo === 'proposta'
      ? doc.titulo.toLowerCase().includes('readequada')
        ? 'proposta-readequada'
        : 'proposta-comercial'
      : doc.tipo === 'impugnacao'
        ? 'impugnacao'
        : doc.tipo === 'esclarecimento'
          ? 'pedido-de-esclarecimento'
          : 'declaracoes'
  const base = `${prefixo}-${numero}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
  return `${base}.${extensao}`
}

documentosDaLicitacaoRouter.post(
  '/arquivo',
  estudoPdfLimiter,
  asyncHandler(async (req, res) => {
    const { formato, documento } = arquivoSchema.parse(req.body)
    const [timbrado, { certame }] = await Promise.all([carregarTimbrado(req.companyId!), carregarCertame(req.params.id)])

    const arquivo = formato === 'pdf' ? await renderizarPdf(documento, timbrado) : await renderizarDocx(documento, timbrado)
    await registrarAuditoria(req, {
      action: 'DOCUMENTO_GERADO',
      entityType: 'licitacao',
      entityId: req.params.id,
      metadata: { tipo: documento.tipo, formato },
    })

    const numero = certame.numero.startsWith('[') ? req.params.id.slice(0, 8) : certame.numero
    res.setHeader('Content-Type', formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${nomeDoArquivo(documento, numero, formato)}"`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.send(arquivo)
  })
)
