import { once } from 'node:events'
import type { Writable } from 'node:stream'
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate'
import { prisma } from './tenderService'
import { caminhoDoArquivoDoCofre, caminhoUnico, extensaoDoTipo, planilhaCsv, textoDoLeiaMe } from '../lib/exportacaoDosDados'

export interface TitularDosDados {
  companyId: string
  userId: string
  dono: boolean
}

export const MAXIMO_DE_LICITACOES_ENCONTRADAS = 20_000

const REFERENCIA_DA_LICITACAO = {
  id: true,
  numeroControle: true,
  orgao: true,
  uf: true,
  municipio: true,
  modalidade: true,
  objeto: true,
  aberturaAt: true,
  encerramentoAt: true,
  valorEstimado: true,
  linkEdital: true,
} as const

export async function dadosDoTitular({ companyId, userId, dono }: TitularDosDados) {
  const [usuario, empresa, membros, itens, documentos, planos, checklists, exigencias, matches, analises, eventos, perguntasAoEdital, chamados, assinaturas] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, companyRole: true, createdAt: true, emailVerifiedAt: true,
        termsAcceptedAt: true, termsVersion: true, accessExpiresAt: true, active: true,
        receberResumoDiario: true, receberLembreteDePrazo: true, receberAvisoDeDocumento: true, receberAvisoDeAlteracao: true,
        celularNovasLicitacoes: true, celularLembreteDePrazo: true, celularAvisoDeAlteracao: true,
        pushSubscriptions: { select: { aparelho: true, createdAt: true, ultimoEnvioEm: true } },
      },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true, tipo: true, name: true, cnpj: true, cpf: true, email: true, telefone: true, responsavel: true,
        endereco: true, cep: true, planCode: true, createdAt: true,
      },
    }),
    dono
      ? prisma.user.findMany({ where: { companyId }, select: { email: true, name: true, companyRole: true, active: true, createdAt: true } })
      : Promise.resolve([]),
    prisma.monitoredItem.findMany({ where: { companyId } }),
    prisma.companyDocument.findMany({ where: { companyId } }),
    prisma.tenderParticipationPlan.findMany({ where: { companyId } }),
    prisma.tenderChecklist.findMany({ where: { companyId } }),
    prisma.requirementProgress.findMany({ where: { companyId } }),
    prisma.tenderMatch.count({ where: { companyId } }),
    prisma.aiUsage.count({ where: { companyId } }),
    prisma.auditLog.findMany({
      where: { companyId, ...(dono ? {} : { actorUserId: userId }) },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { createdAt: true, action: true, entityType: true, actorEmail: true },
    }),
    prisma.editalPergunta.findMany({
      where: { companyId, ...(dono ? {} : { userId }) },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: { tenderId: true, pergunta: true, resposta: true, createdAt: true },
    }),
    prisma.chamado.findMany({
      where: dono ? { companyId } : { companyId, userId },
      orderBy: { createdAt: 'desc' },
      select: { numero: true, tipo: true, status: true, assunto: true, relato: true, contexto: true, createdAt: true, mensagens: { orderBy: { createdAt: 'asc' }, select: { autor: true, texto: true, createdAt: true } } },
    }),
    dono
      ? prisma.assinatura.findMany({
          where: { companyId },
          orderBy: { createdAt: 'desc' },
          select: {
            planCode: true, ciclo: true, status: true, valorCentavos: true, valorCheioCentavos: true, descontoAte: true, pagoAte: true, canceladaEm: true, createdAt: true,
            pagamentos: { orderBy: { vencimento: 'desc' }, select: { status: true, forma: true, valorCentavos: true, vencimento: true, pagoEm: true, estornadoEm: true } },
          },
        })
      : Promise.resolve([]),
  ])

  return {
    geradoEm: new Date().toISOString(),
    observacao: 'Cópia dos seus dados pessoais e da sua empresa guardados na plataforma (LGPD, art. 18).',
    usuario,
    empresa,
    membros,
    itensMonitorados: itens,
    documentosDaEmpresa: documentos,
    planosDeParticipacao: planos,
    checklists,
    progressoDeExigencias: exigencias,
    totais: { licitacoesCompativeisEncontradas: matches, analisesDeEditalSolicitadas: analises },
    historicoDeAcoes: eventos,
    perguntasAoEdital,
    chamadosDeSuporte: chamados,
    assinaturasEPagamentos: assinaturas,
  }
}

async function dadosQueSoCabemNoPacote({ companyId, userId }: TitularDosDados) {
  const [licitacoesEncontradas, estudosDeCustos, pregoes, conversaComOSuporte, notificacoes, arquivosDoCofre, logo] = await Promise.all([
    prisma.tenderMatch.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: MAXIMO_DE_LICITACOES_ENCONTRADAS,
      select: {
        createdAt: true,
        score: true,
        matchedKeywords: true,
        matchedByCode: true,
        dentroDeObraCompleta: true,
        monitoredItem: { select: { name: true } },
        tender: { select: REFERENCIA_DA_LICITACAO },
      },
    }),
    prisma.costStudy.findMany({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
      select: { dados: true, createdAt: true, updatedAt: true, tender: { select: REFERENCIA_DA_LICITACAO } },
    }),
    prisma.pregaoAcompanhamento.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        decrementoPct: true, maxLances: true, criterio: true, resultado: true, valorFinal: true, encerradoEm: true, planoDeDisputa: true, createdAt: true,
        tender: { select: REFERENCIA_DA_LICITACAO },
        lances: { orderBy: { createdAt: 'asc' }, select: { alvo: true, origem: true, valor: true, margemPct: true, createdAt: true } },
      },
    }),
    prisma.mensagemDeSuporte.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { papel: true, texto: true, createdAt: true },
    }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: { type: true, title: true, body: true, sentAt: true, readAt: true, createdAt: true },
    }),
    prisma.companyDocumentFile.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, documentId: true, nomeArquivo: true, mimeType: true, tamanho: true, sha256: true, createdAt: true },
    }),
    prisma.companyLogo.findUnique({ where: { companyId }, select: { mimeType: true, tamanho: true } }),
  ])
  return { licitacoesEncontradas, estudosDeCustos, pregoes, conversaComOSuporte, notificacoes, arquivosDoCofre, logo }
}

export interface ResultadoDoPacote {
  arquivosDoCofre: number
  bytes: number
}

export async function escreverPacoteDosDados(titular: TitularDosDados, destino: Writable): Promise<ResultadoDoPacote> {
  const [base, extra] = await Promise.all([dadosDoTitular(titular), dadosQueSoCabemNoPacote(titular)])
  const usados = new Set<string>()
  let bytes = 0
  let falha: Error | null = null

  const zip = new Zip((err, pedaco, final) => {
    if (err) {
      falha = err
      return
    }
    bytes += pedaco.length
    destino.write(pedaco)
    if (final) destino.end()
  })

  async function esperarODestino() {
    if (falha) throw falha
    if (destino.destroyed) throw new Error('O download foi interrompido')
    if (destino.writableNeedDrain) await once(destino, 'drain')
  }

  async function adicionar(caminho: string, conteudo: Uint8Array, comprimir: boolean) {
    const entrada = comprimir ? new ZipDeflate(caminhoUnico(usados, caminho), { level: 6 }) : new ZipPassThrough(caminhoUnico(usados, caminho))
    zip.add(entrada)
    entrada.push(conteudo, true)
    await esperarODestino()
  }

  const nomeDoDocumento = new Map(base.documentosDaEmpresa.map((d) => [d.id, d.nome]))
  const caminhoDoArquivo = new Map<string, string>()
  for (const arquivo of extra.arquivosDoCofre) {
    caminhoDoArquivo.set(arquivo.id, caminhoUnico(usados, caminhoDoArquivoDoCofre(nomeDoDocumento.get(arquivo.documentId) ?? 'documento', arquivo.nomeArquivo)))
  }
  const caminhoDaLogo = extra.logo ? `logo/logo.${extensaoDoTipo(extra.logo.mimeType)}` : null

  await adicionar(
    'LEIA-ME.txt',
    strToU8(
      textoDoLeiaMe({
        geradoEm: new Date(base.geradoEm),
        email: base.usuario?.email ?? '',
        empresa: base.empresa?.name ?? null,
        dono: titular.dono,
        arquivosDoCofre: extra.arquivosDoCofre.length,
        documentosSemArquivo: base.documentosDaEmpresa.length - extra.arquivosDoCofre.length,
        temLogo: Boolean(extra.logo),
        licitacoesEncontradas: extra.licitacoesEncontradas.length,
        licitacoesCortadas: base.totais.licitacoesCompativeisEncontradas > extra.licitacoesEncontradas.length,
      })
    ),
    true
  )

  const arquivosDoCofre = extra.arquivosDoCofre.map((a) => ({
    documento: nomeDoDocumento.get(a.documentId) ?? null,
    documentoId: a.documentId,
    nomeOriginal: a.nomeArquivo,
    noPacote: caminhoDoArquivo.get(a.id),
    tipo: a.mimeType,
    tamanho: a.tamanho,
    sha256: a.sha256,
    enviadoEm: a.createdAt,
  }))

  await adicionar(
    'dados.json',
    strToU8(
      JSON.stringify(
        {
          ...base,
          licitacoesEncontradas: extra.licitacoesEncontradas,
          estudosDeCustos: extra.estudosDeCustos,
          pregoes: extra.pregoes,
          conversaComOSuporte: extra.conversaComOSuporte,
          notificacoes: extra.notificacoes,
          arquivosDoCofre,
          logo: extra.logo && caminhoDaLogo ? { ...extra.logo, noPacote: caminhoDaLogo } : null,
        },
        null,
        2
      )
    ),
    true
  )

  await adicionar(
    'licitacoes-encontradas.csv',
    strToU8(
      planilhaCsv(
        ['encontrada_em', 'item', 'nota', 'palavras', 'por_codigo', 'dentro_de_obra_completa', 'orgao', 'uf', 'municipio', 'modalidade', 'objeto', 'abertura', 'encerramento', 'valor_estimado', 'link'],
        extra.licitacoesEncontradas.map((m) => [
          m.createdAt,
          m.monitoredItem.name,
          Math.round(m.score * 100),
          m.matchedKeywords.join(', '),
          m.matchedByCode,
          m.dentroDeObraCompleta,
          m.tender.orgao,
          m.tender.uf,
          m.tender.municipio,
          m.tender.modalidade,
          m.tender.objeto,
          m.tender.aberturaAt,
          m.tender.encerramentoAt,
          m.tender.valorEstimado?.toString() ?? null,
          m.tender.linkEdital,
        ])
      )
    ),
    true
  )

  await adicionar(
    'cofre-de-documentos.csv',
    strToU8(
      planilhaCsv(
        ['documento', 'tipo', 'emissao', 'validade', 'observacao', 'arquivo_no_pacote', 'sha256'],
        base.documentosDaEmpresa.map((d) => {
          const arquivo = arquivosDoCofre.find((a) => a.documentoId === d.id)
          return [d.nome, d.tipo, d.dataEmissao, d.dataValidade, d.observacao, arquivo?.noPacote ?? null, arquivo?.sha256 ?? null]
        })
      )
    ),
    true
  )

  for (const arquivo of extra.arquivosDoCofre) {
    const conteudo = await prisma.companyDocumentFile.findUnique({ where: { id: arquivo.id }, select: { conteudo: true } })
    if (!conteudo) continue
    const entrada = new ZipPassThrough(caminhoDoArquivo.get(arquivo.id)!)
    zip.add(entrada)
    entrada.push(conteudo.conteudo, true)
    await esperarODestino()
  }

  if (caminhoDaLogo) {
    const logo = await prisma.companyLogo.findUnique({ where: { companyId: titular.companyId }, select: { conteudo: true } })
    if (logo) await adicionar(caminhoDaLogo, logo.conteudo, false)
  }

  zip.end()
  if (falha) throw falha
  return { arquivosDoCofre: extra.arquivosDoCofre.length, bytes }
}
