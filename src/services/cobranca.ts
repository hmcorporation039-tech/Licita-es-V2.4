import { Prisma, type Assinatura, type Pagamento } from '@prisma/client'
import { prisma } from './tenderService'
import { ApiError } from '../api/asyncHandler'
import { cobrador, ErroDoAsaas, type Cobrador, type CobrancaDoAsaas } from './asaas'
import { avisarAdministrador } from './alertaOperacional'
import { registrarAuditoria } from './auditService'
import { enviarAvisoDeFaturaVencida, enviarFaturaDaAssinatura, enviarPagamentoConfirmado } from './emailTransacional'
import { inicioDoMesBrasilia } from '../lib/planos'
import {
  ROTULO_DO_STATUS_DO_PAGAMENTO,
  STATUS_EM_ABERTO,
  STATUS_ESTORNADOS,
  STATUS_PAGOS,
  dentroDoPrazoDeReembolso,
  descontoValeNoVencimento,
  diaDoBanco,
  documentoDoCliente,
  fimDoDiaEmBrasilia,
  formatarReais,
  hojeEmBrasilia,
  lerEventoDoAsaas,
  limiteParaPagarEmAtraso,
  motivoDoCupomRecusado,
  normalizarCodigoDoCupom,
  periodoPago,
  precoDoPlano,
  reaisParaCentavos,
  somarDias,
  somarMeses,
  statusPelosPagamentos,
  valorComDesconto,
  type Ciclo,
  type EventoDoAsaas,
} from '../lib/cobranca'

const DIA_EM_BRASILIA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
const DIA_DO_VENCIMENTO = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' })

export function cobrancaDisponivel(): boolean {
  return cobrador() !== null
}

function exigirCobrador(): Cobrador {
  const asaas = cobrador()
  if (!asaas) throw new ApiError(503, 'A assinatura pelo site ainda não está disponível. Fale com a equipe da Licita Bela.')
  return asaas
}

function falhaDoAsaas(err: unknown): never {
  if (err instanceof ErroDoAsaas) {
    console.error('[Cobrança]', err.message)
    throw new ApiError(err.paraOCliente ? 422 : 502, err.paraOCliente ?? 'O sistema de cobrança não respondeu. Tente de novo em alguns minutos.')
  }
  throw err
}

function violouUnicidade(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

export async function planosParaAssinar() {
  const planos = await prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
  return planos
    .filter((p) => p.code !== 'TESTE' && precoDoPlano(p, 'MENSAL') !== null)
    .map((p) => ({ code: p.code, nome: p.name, descricao: p.description, precoMensalCentavos: p.priceMonthlyCents, precoAnualCentavos: precoDoPlano(p, 'ANUAL') }))
}

function assinaturaVigente(companyId: string) {
  return prisma.assinatura.findFirst({ where: { companyId, status: { not: 'CANCELADA' } } })
}

function faturaEmAberto(assinaturaId: string) {
  return prisma.pagamento.findFirst({ where: { assinaturaId, status: { in: [...STATUS_EM_ABERTO] }, estornadoEm: null }, orderBy: { vencimento: 'asc' } })
}

async function emailsDosDonos(companyId: string): Promise<string[]> {
  const donos = await prisma.user.findMany({ where: { companyId, companyRole: 'OWNER', active: true }, select: { email: true } })
  return donos.map((d) => d.email)
}

async function nomeDoPlano(planCode: string): Promise<string> {
  return (await prisma.subscriptionPlan.findUnique({ where: { code: planCode }, select: { name: true } }))?.name ?? planCode
}

async function nomeDaEmpresa(companyId: string): Promise<string> {
  return (await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }))?.name ?? companyId
}

async function devolverCupom(cupomId: string | null): Promise<void> {
  if (cupomId) await prisma.cupom.updateMany({ where: { id: cupomId, usos: { gt: 0 } }, data: { usos: { decrement: 1 } } })
}

async function reservarCupom(codigoDigitado: string, agora: Date) {
  const codigo = normalizarCodigoDoCupom(codigoDigitado)
  const cupom = await prisma.cupom.findUnique({ where: { codigo } })
  const motivo = motivoDoCupomRecusado(cupom, agora)
  if (motivo || !cupom) throw new ApiError(422, motivo ?? 'Cupom não encontrado')
  const reservado = await prisma.cupom.updateMany({
    where: { id: cupom.id, ativo: true, ...(cupom.maxUsos !== null ? { usos: { lt: cupom.maxUsos } } : {}) },
    data: { usos: { increment: 1 } },
  })
  if (reservado.count === 0) throw new ApiError(422, 'As vagas deste cupom acabaram')
  return cupom
}

export interface PedidoDeAssinatura {
  companyId: string
  userId: string
  planCode: string
  ciclo: Ciclo
  cupom?: string | null
}

export async function assinar(pedido: PedidoDeAssinatura, agora: Date = new Date()): Promise<{ assinaturaId: string; linkDaFatura: string | null }> {
  const asaas = exigirCobrador()
  const codigoDoCupom = pedido.cupom?.trim() ? normalizarCodigoDoCupom(pedido.cupom) : null
  const vigente = await assinaturaVigente(pedido.companyId)
  if (vigente) {
    if (vigente.status === 'ATIVA') throw new ApiError(409, 'Sua empresa já tem uma assinatura ativa. Para trocar de plano, fale com o suporte.')
    const aberta = await faturaEmAberto(vigente.id)
    if (vigente.status === 'ATRASADA') return { assinaturaId: vigente.id, linkDaFatura: aberta?.linkDaFatura ?? null }
    const cupomDaVigente = vigente.cupomId ? (await prisma.cupom.findUnique({ where: { id: vigente.cupomId }, select: { codigo: true } }))?.codigo ?? null : null
    if (vigente.planCode === pedido.planCode && vigente.ciclo === pedido.ciclo && cupomDaVigente === codigoDoCupom && aberta?.linkDaFatura) {
      return { assinaturaId: vigente.id, linkDaFatura: aberta.linkDaFatura }
    }
    await encerrar(vigente, 'TROCOU_ANTES_DE_PAGAR', agora)
  }

  const plano = await prisma.subscriptionPlan.findUnique({ where: { code: pedido.planCode } })
  if (!plano || !plano.active || plano.code === 'TESTE') throw new ApiError(400, 'Plano não disponível para assinatura')
  const cheio = precoDoPlano(plano, pedido.ciclo)
  if (!cheio) throw new ApiError(400, 'Este plano não tem preço para assinatura pelo site. Fale com a equipe da Licita Bela.')

  const empresa = await prisma.company.findUniqueOrThrow({ where: { id: pedido.companyId }, select: { name: true, cnpj: true, cpf: true, email: true } })
  const documento = documentoDoCliente(empresa)
  if (!documento) throw new ApiError(422, 'Cadastre o CNPJ (ou o CPF) em Empresa antes de assinar: ele vai na fatura.', { code: 'SEM_DOCUMENTO' })
  const quem = await prisma.user.findUniqueOrThrow({ where: { id: pedido.userId }, select: { email: true } })

  const cupom = codigoDoCupom ? await reservarCupom(codigoDoCupom, agora) : null
  const hoje = hojeEmBrasilia(agora)
  const valor = cupom ? valorComDesconto(cheio, cupom.percentual) : cheio
  const descontoAte = cupom ? fimDoDiaEmBrasilia(somarDias(somarMeses(hoje, cupom.meses), -1)) : null

  let local: Assinatura
  try {
    const anterior = await prisma.assinatura.findFirst({ where: { companyId: pedido.companyId, ambiente: asaas.ambiente }, orderBy: { createdAt: 'desc' }, select: { asaasClienteId: true } })
    const clienteId =
      anterior?.asaasClienteId ??
      (
        await asaas
          .criarCliente({ nome: empresa.name, documento, email: empresa.email ?? quem.email, referencia: pedido.companyId })
          .catch(falhaDoAsaas)
      ).id
    local = await prisma.assinatura.create({
      data: {
        companyId: pedido.companyId,
        planCode: plano.code,
        ciclo: pedido.ciclo,
        ambiente: asaas.ambiente,
        asaasClienteId: clienteId,
        valorCentavos: valor,
        valorCheioCentavos: cheio,
        cupomId: cupom?.id ?? null,
        descontoAte,
        criadaPorUserId: pedido.userId,
      },
    })
  } catch (err) {
    await devolverCupom(cupom?.id ?? null)
    if (violouUnicidade(err)) throw new ApiError(409, 'Já existe uma assinatura sendo criada para a sua empresa. Atualize a página.')
    throw err
  }

  let asaasAssinaturaId: string
  try {
    asaasAssinaturaId = (
      await asaas.criarAssinatura({
        cliente: local.asaasClienteId,
        valorCentavos: valor,
        ciclo: pedido.ciclo,
        vencimento: hoje,
        descricao: `Licita Bela: plano ${plano.name} ${pedido.ciclo === 'ANUAL' ? 'anual' : 'mensal'}`,
        referencia: local.id,
      })
    ).id
  } catch (err) {
    await prisma.assinatura.delete({ where: { id: local.id } })
    await devolverCupom(cupom?.id ?? null)
    falhaDoAsaas(err)
  }
  local = await prisma.assinatura.update({ where: { id: local.id }, data: { asaasAssinaturaId } })

  const cobrancas = await asaas.cobrancasDaAssinatura(asaasAssinaturaId).catch((err) => {
    console.error('[Cobrança] Não foi possível ler a primeira fatura:', err instanceof Error ? err.message : err)
    return [] as CobrancaDoAsaas[]
  })
  for (const c of cobrancas) await registrarCobranca(local, c, agora, { avisarNovaFatura: false })
  await registrarAuditoria(null, {
    action: 'ASSINATURA_CRIADA',
    entityType: 'assinatura',
    entityId: local.id,
    companyId: pedido.companyId,
    metadata: { plano: plano.code, ciclo: pedido.ciclo, valorCentavos: valor, cupom: cupom?.codigo ?? null, ambiente: asaas.ambiente },
  }, { userId: pedido.userId, email: quem.email })
  return { assinaturaId: local.id, linkDaFatura: (await faturaEmAberto(local.id))?.linkDaFatura ?? null }
}

async function gravarCobranca(assinatura: Assinatura, c: CobrancaDoAsaas): Promise<{ pagamento: Pagamento; nova: boolean }> {
  const dados = {
    status: c.deleted ? 'DELETED' : c.status,
    forma: c.billingType,
    valorCentavos: reaisParaCentavos(c.value),
    valorLiquidoCentavos: c.netValue === null ? null : reaisParaCentavos(c.netValue),
    vencimento: new Date(`${c.dueDate}T00:00:00Z`),
    linkDaFatura: c.invoiceUrl,
  }
  const existente = await prisma.pagamento.findUnique({ where: { asaasCobrancaId: c.id } })
  if (existente) return { pagamento: await prisma.pagamento.update({ where: { id: existente.id }, data: dados }), nova: false }
  try {
    return {
      pagamento: await prisma.pagamento.create({ data: { ...dados, asaasCobrancaId: c.id, companyId: assinatura.companyId, assinaturaId: assinatura.id } }),
      nova: true,
    }
  } catch (err) {
    if (!violouUnicidade(err)) throw err
    return { pagamento: await prisma.pagamento.update({ where: { asaasCobrancaId: c.id }, data: dados }), nova: false }
  }
}

async function encerrarDesconto(assinatura: Assinatura, c: CobrancaDoAsaas): Promise<{ assinatura: Assinatura; cobranca: CobrancaDoAsaas }> {
  if (!assinatura.descontoAte || !assinatura.asaasAssinaturaId || assinatura.valorCentavos >= assinatura.valorCheioCentavos) return { assinatura, cobranca: c }
  if (descontoValeNoVencimento(assinatura.descontoAte, c.dueDate)) return { assinatura, cobranca: c }
  const asaas = exigirCobrador()
  await asaas.mudarValorDaAssinatura(assinatura.asaasAssinaturaId, assinatura.valorCheioCentavos)
  const atualizada = await prisma.assinatura.update({ where: { id: assinatura.id }, data: { valorCentavos: assinatura.valorCheioCentavos } })
  await registrarAuditoria(null, {
    action: 'ASSINATURA_DESCONTO_ENCERRADO',
    entityType: 'assinatura',
    entityId: assinatura.id,
    companyId: assinatura.companyId,
    metadata: { valorCentavos: assinatura.valorCheioCentavos },
  })
  return { assinatura: atualizada, cobranca: await asaas.buscarCobranca(c.id) }
}

interface OpcoesDoRegistro {
  avisarNovaFatura: boolean
}

export async function registrarCobranca(assinaturaInicial: Assinatura, cobrancaInicial: CobrancaDoAsaas, agora: Date, opcoes: OpcoesDoRegistro): Promise<Pagamento> {
  let assinatura = assinaturaInicial
  let c = cobrancaInicial
  const jaExistia = await prisma.pagamento.findUnique({ where: { asaasCobrancaId: c.id }, select: { id: true } })
  if (!jaExistia && STATUS_EM_ABERTO.has(c.status) && !c.deleted) ({ assinatura, cobranca: c } = await encerrarDesconto(assinatura, c))
  const { pagamento, nova } = await gravarCobranca(assinatura, c)
  const status = pagamento.status

  if (STATUS_PAGOS.has(status) && !pagamento.pagoEm && !pagamento.estornadoEm) await confirmarPagamento(assinatura, pagamento, agora)
  else if (STATUS_ESTORNADOS.has(status) && !pagamento.estornadoEm) await registrarEstorno(assinatura, pagamento, agora)
  else if (status === 'OVERDUE' && !pagamento.avisoDeAtrasoEm) await avisarAtraso(assinatura, pagamento, agora)
  else if (nova && opcoes.avisarNovaFatura && STATUS_EM_ABERTO.has(status) && !pagamento.avisoDeFaturaEm) await avisarNovaFatura(assinatura, pagamento, agora)

  await atualizarStatus(assinatura.id)
  return pagamento
}

async function atualizarStatus(assinaturaId: string): Promise<void> {
  const assinatura = await prisma.assinatura.findUnique({ where: { id: assinaturaId }, select: { status: true } })
  if (!assinatura || assinatura.status === 'CANCELADA') return
  const pagamentos = await prisma.pagamento.findMany({ where: { assinaturaId, status: { not: 'DELETED' }, estornadoEm: null }, select: { status: true } })
  const status = statusPelosPagamentos(pagamentos)
  if (status !== assinatura.status) await prisma.assinatura.updateMany({ where: { id: assinaturaId, status: { not: 'CANCELADA' } }, data: { status } })
}

function dadosDoEmail(planoNome: string, pagamento: Pagamento) {
  return {
    plano: planoNome,
    valor: formatarReais(pagamento.valorCentavos),
    vencimento: DIA_DO_VENCIMENTO.format(pagamento.vencimento),
    link: pagamento.linkDaFatura ?? '',
  }
}

async function confirmarPagamento(assinatura: Assinatura, pagamento: Pagamento, agora: Date): Promise<void> {
  const { pagoAte, acessoAte } = periodoPago(diaDoBanco(pagamento.vencimento), assinatura.ciclo as Ciclo)
  const marcado = await prisma.pagamento.updateMany({ where: { id: pagamento.id, pagoEm: null }, data: { pagoEm: agora } })
  if (marcado.count === 0) return
  await prisma.$transaction([
    prisma.assinatura.updateMany({ where: { id: assinatura.id, OR: [{ pagoAte: null }, { pagoAte: { lt: pagoAte } }] }, data: { pagoAte } }),
    prisma.company.update({ where: { id: assinatura.companyId }, data: { planCode: assinatura.planCode } }),
    prisma.user.updateMany({
      where: { companyId: assinatura.companyId, isAdmin: false, OR: [{ accessExpiresAt: null }, { accessExpiresAt: { lt: acessoAte } }] },
      data: { accessExpiresAt: acessoAte },
    }),
  ])
  const [plano, empresa, emails] = await Promise.all([nomeDoPlano(assinatura.planCode), nomeDaEmpresa(assinatura.companyId), emailsDosDonos(assinatura.companyId)])
  const valor = formatarReais(pagamento.valorCentavos)
  for (const email of emails) await enviarPagamentoConfirmado(email, { plano, valor, acessoAte: DIA_EM_BRASILIA.format(pagoAte) })
  await prisma.pagamento.update({ where: { id: pagamento.id }, data: { avisoDePagamentoEm: agora } })
  await registrarAuditoria(null, {
    action: 'ASSINATURA_PAGA',
    entityType: 'assinatura',
    entityId: assinatura.id,
    companyId: assinatura.companyId,
    metadata: { pagamentoId: pagamento.id, valorCentavos: pagamento.valorCentavos, forma: pagamento.forma, plano: assinatura.planCode },
  })
  void avisarAdministrador(`cobranca-paga|${pagamento.id}`, `Pagamento recebido: ${empresa} (${valor})`, `Empresa: ${empresa}\nPlano: ${plano} (${assinatura.ciclo.toLowerCase()})\nValor: ${valor}\nForma: ${pagamento.forma ?? '-'}\nAcesso até: ${DIA_EM_BRASILIA.format(acessoAte)}`)
}

async function avisarAtraso(assinatura: Assinatura, pagamento: Pagamento, agora: Date): Promise<void> {
  const marcado = await prisma.pagamento.updateMany({ where: { id: pagamento.id, avisoDeAtrasoEm: null }, data: { avisoDeAtrasoEm: agora } })
  if (marcado.count === 0) return
  const [plano, empresa, emails] = await Promise.all([nomeDoPlano(assinatura.planCode), nomeDaEmpresa(assinatura.companyId), emailsDosDonos(assinatura.companyId)])
  const limite = DIA_EM_BRASILIA.format(limiteParaPagarEmAtraso(diaDoBanco(pagamento.vencimento)))
  const dados = dadosDoEmail(plano, pagamento)
  if (dados.link) for (const email of emails) await enviarAvisoDeFaturaVencida(email, { ...dados, limite })
  void avisarAdministrador(`cobranca-atraso|${pagamento.id}`, `Fatura vencida: ${empresa}`, `Empresa: ${empresa}\nPlano: ${plano}\nValor: ${dados.valor}\nVenceu em: ${dados.vencimento}\nAcesso suspenso depois de: ${limite}`)
}

async function avisarNovaFatura(assinatura: Assinatura, pagamento: Pagamento, agora: Date): Promise<void> {
  const marcado = await prisma.pagamento.updateMany({ where: { id: pagamento.id, avisoDeFaturaEm: null }, data: { avisoDeFaturaEm: agora } })
  if (marcado.count === 0 || !pagamento.linkDaFatura) return
  const [plano, emails] = await Promise.all([nomeDoPlano(assinatura.planCode), emailsDosDonos(assinatura.companyId)])
  for (const email of emails) await enviarFaturaDaAssinatura(email, dadosDoEmail(plano, pagamento))
}

async function registrarEstorno(assinatura: Assinatura, pagamento: Pagamento, agora: Date): Promise<void> {
  const marcado = await prisma.pagamento.updateMany({ where: { id: pagamento.id, estornadoEm: null }, data: { estornadoEm: agora } })
  if (marcado.count === 0) return
  const atual = await prisma.assinatura.findUniqueOrThrow({ where: { id: assinatura.id } })
  if (atual.status !== 'CANCELADA') await encerrar(atual, 'ESTORNO', agora, { cortarAcessoAgora: true })
  const empresa = await nomeDaEmpresa(assinatura.companyId)
  void avisarAdministrador(`cobranca-estorno|${pagamento.id}`, `Pagamento estornado: ${empresa}`, `Empresa: ${empresa}\nValor: ${formatarReais(pagamento.valorCentavos)}\nSituação no Asaas: ${pagamento.status}\nA assinatura foi cancelada e o acesso encerrado.`)
}

async function encerrar(assinatura: Assinatura, motivo: string, agora: Date, opcoes: { cortarAcessoAgora?: boolean; avisarAsaas?: boolean } = {}): Promise<void> {
  if (assinatura.asaasAssinaturaId && opcoes.avisarAsaas !== false) {
    const asaas = exigirCobrador()
    try {
      await asaas.cancelarAssinatura(assinatura.asaasAssinaturaId)
    } catch (err) {
      if (!(err instanceof ErroDoAsaas && err.status === 404)) falhaDoAsaas(err)
    }
  }
  const encerrada = await prisma.assinatura.updateMany({ where: { id: assinatura.id, status: { not: 'CANCELADA' } }, data: { status: 'CANCELADA', canceladaEm: agora, motivoDoCancelamento: motivo } })
  if (encerrada.count === 0) return
  await prisma.pagamento.updateMany({ where: { assinaturaId: assinatura.id, status: { in: [...STATUS_EM_ABERTO] } }, data: { status: 'DELETED' } })
  const pagou = await prisma.pagamento.count({ where: { assinaturaId: assinatura.id, pagoEm: { not: null } } })
  if (pagou === 0) await devolverCupom(assinatura.cupomId)
  const limite = opcoes.cortarAcessoAgora ? agora : assinatura.pagoAte
  if (limite) {
    await prisma.user.updateMany({
      where: { companyId: assinatura.companyId, isAdmin: false, OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: limite } }] },
      data: { accessExpiresAt: limite },
    })
  }
}

export async function cancelarAssinaturaDaEmpresa(companyId: string, userId: string, agora: Date = new Date()): Promise<{ acessoAte: string | null }> {
  const vigente = await assinaturaVigente(companyId)
  if (!vigente) throw new ApiError(404, 'Sua empresa não tem assinatura ativa')
  await encerrar(vigente, 'PEDIDO_DO_CLIENTE', agora)
  await registrarAuditoria(null, { action: 'ASSINATURA_CANCELADA', entityType: 'assinatura', entityId: vigente.id, companyId, metadata: { motivo: 'PEDIDO_DO_CLIENTE' } }, { userId })
  const empresa = await nomeDaEmpresa(companyId)
  void avisarAdministrador(`cobranca-cancelada|${vigente.id}`, `Assinatura cancelada pelo cliente: ${empresa}`, `Empresa: ${empresa}\nPlano: ${vigente.planCode}\nPago até: ${vigente.pagoAte ? DIA_EM_BRASILIA.format(vigente.pagoAte) : 'nenhum pagamento'}`)
  return { acessoAte: vigente.pagoAte?.toISOString() ?? null }
}

export async function cancelarPeloAdministrador(assinaturaId: string, adminId: string, agora: Date = new Date()): Promise<void> {
  const assinatura = await prisma.assinatura.findUnique({ where: { id: assinaturaId } })
  if (!assinatura) throw new ApiError(404, 'Assinatura não encontrada')
  if (assinatura.status === 'CANCELADA') throw new ApiError(409, 'A assinatura já está cancelada')
  await encerrar(assinatura, 'ADMINISTRADOR', agora)
  await registrarAuditoria(null, { action: 'ASSINATURA_CANCELADA', entityType: 'assinatura', entityId: assinatura.id, companyId: assinatura.companyId, metadata: { motivo: 'ADMINISTRADOR' } }, { userId: adminId })
}

export async function reembolsarPrimeiroPagamento(assinaturaId: string, adminId: string, agora: Date = new Date()): Promise<void> {
  const assinatura = await prisma.assinatura.findUnique({ where: { id: assinaturaId } })
  if (!assinatura) throw new ApiError(404, 'Assinatura não encontrada')
  const primeiro = await prisma.pagamento.findFirst({ where: { companyId: assinatura.companyId, pagoEm: { not: null } }, orderBy: { pagoEm: 'asc' } })
  if (!primeiro || primeiro.assinaturaId !== assinatura.id) throw new ApiError(409, 'O reembolso de 7 dias vale só para o primeiro pagamento da empresa.')
  if (primeiro.estornadoEm) throw new ApiError(409, 'Este pagamento já foi estornado.')
  if (!primeiro.pagoEm || !dentroDoPrazoDeReembolso(primeiro.pagoEm, agora)) {
    throw new ApiError(409, 'Passaram mais de 7 dias desde o pagamento. Se quiser devolver mesmo assim, faça pelo painel do Asaas.')
  }
  if (primeiro.forma !== 'PIX' && primeiro.forma !== 'CREDIT_CARD') {
    throw new ApiError(409, 'O Asaas só devolve automaticamente pagamentos por Pix ou cartão. Para boleto, devolva por transferência no painel do Asaas e depois use Cancelar aqui.')
  }
  await exigirCobrador().estornarCobranca(primeiro.asaasCobrancaId).catch(falhaDoAsaas)
  await prisma.pagamento.update({ where: { id: primeiro.id }, data: { status: 'REFUND_REQUESTED' } })
  const atualizado = await prisma.pagamento.findUniqueOrThrow({ where: { id: primeiro.id } })
  await registrarEstorno(assinatura, atualizado, agora)
  await registrarAuditoria(null, { action: 'ASSINATURA_REEMBOLSADA', entityType: 'assinatura', entityId: assinatura.id, companyId: assinatura.companyId, metadata: { pagamentoId: primeiro.id, valorCentavos: primeiro.valorCentavos } }, { userId: adminId })
}

export async function sincronizarAssinatura(assinaturaId: string, agora: Date = new Date()): Promise<number> {
  const assinatura = await prisma.assinatura.findUnique({ where: { id: assinaturaId } })
  if (!assinatura) throw new ApiError(404, 'Assinatura não encontrada')
  if (!assinatura.asaasAssinaturaId) return 0
  const cobrancas = await exigirCobrador().cobrancasDaAssinatura(assinatura.asaasAssinaturaId).catch(falhaDoAsaas)
  for (const c of cobrancas) {
    const atual = await prisma.assinatura.findUniqueOrThrow({ where: { id: assinaturaId } })
    await registrarCobranca(atual, c, agora, { avisarNovaFatura: false })
  }
  return cobrancas.length
}

async function tratarEvento(ev: EventoDoAsaas, agora: Date): Promise<string> {
  if (ev.evento.startsWith('PAYMENT_') && ev.cobrancaId) {
    const asaas = cobrador()
    if (!asaas) return 'ignorado: cobrança desligada'
    let c: CobrancaDoAsaas
    try {
      c = await asaas.buscarCobranca(ev.cobrancaId)
    } catch (err) {
      if (err instanceof ErroDoAsaas && err.status === 404) {
        const apagadas = await prisma.pagamento.updateMany({ where: { asaasCobrancaId: ev.cobrancaId, pagoEm: null }, data: { status: 'DELETED' } })
        return apagadas.count ? 'ok: cobrança removida' : 'ignorado: cobrança desconhecida'
      }
      throw err
    }
    if (!c.subscription) return 'ignorado: cobrança avulsa'
    const assinatura = await prisma.assinatura.findUnique({ where: { asaasAssinaturaId: c.subscription } })
    if (!assinatura) return 'ignorado: assinatura desconhecida'
    await registrarCobranca(assinatura, c, agora, { avisarNovaFatura: true })
    return `ok: ${c.deleted ? 'DELETED' : c.status}`
  }
  if ((ev.evento === 'SUBSCRIPTION_DELETED' || ev.evento === 'SUBSCRIPTION_INACTIVATED') && ev.assinaturaId) {
    const assinatura = await prisma.assinatura.findUnique({ where: { asaasAssinaturaId: ev.assinaturaId } })
    if (!assinatura || assinatura.status === 'CANCELADA') return 'ignorado: já encerrada'
    await encerrar(assinatura, 'CANCELADA_NO_ASAAS', agora, { avisarAsaas: false })
    return 'ok: cancelada'
  }
  return 'ignorado: evento sem efeito'
}

export async function processarEventoDoAsaas(corpo: unknown, agora: Date = new Date()): Promise<string> {
  const ev = lerEventoDoAsaas(corpo)
  if (!ev) return 'ignorado: formato'
  const existente = await prisma.eventoDeCobranca.findUnique({ where: { id: ev.id }, select: { processadoEm: true } })
  if (existente?.processadoEm) return 'repetido'
  if (!existente) {
    try {
      await prisma.eventoDeCobranca.create({ data: { id: ev.id, evento: ev.evento, asaasCobrancaId: ev.cobrancaId, asaasAssinaturaId: ev.assinaturaId } })
    } catch (err) {
      if (violouUnicidade(err)) return 'repetido'
      throw err
    }
  }
  try {
    const resultado = await tratarEvento(ev, agora)
    await prisma.eventoDeCobranca.update({ where: { id: ev.id }, data: { processadoEm: new Date(), resultado } })
    return resultado
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err)
    console.error(`[Cobrança] Falha ao tratar ${ev.evento} (${ev.cobrancaId ?? ev.assinaturaId ?? ev.id}):`, motivo)
    await prisma.eventoDeCobranca.update({ where: { id: ev.id }, data: { resultado: `erro: ${motivo.slice(0, 400)}` } }).catch(() => undefined)
    void avisarAdministrador(`cobranca-erro|${ev.id}`, 'Falha ao tratar aviso do Asaas', `Evento: ${ev.evento}\nCobrança: ${ev.cobrancaId ?? '-'}\nAssinatura: ${ev.assinaturaId ?? '-'}\nMotivo: ${motivo}\n\nUse "Sincronizar" na assinatura em Admin > Cobrança.`)
    return 'erro'
  }
}

function assinaturaParaTela(a: (Assinatura & { cupom: { codigo: string } | null }) | null, planos: Map<string, string>) {
  if (!a) return null
  return {
    id: a.id,
    planCode: a.planCode,
    plano: planos.get(a.planCode) ?? a.planCode,
    ciclo: a.ciclo,
    status: a.status,
    valorCentavos: a.valorCentavos,
    valorCheioCentavos: a.valorCheioCentavos,
    cupom: a.cupom?.codigo ?? null,
    descontoAte: a.descontoAte?.toISOString() ?? null,
    pagoAte: a.pagoAte?.toISOString() ?? null,
    canceladaEm: a.canceladaEm?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  }
}

function pagamentoParaTela(p: Pagamento) {
  return {
    id: p.id,
    status: p.status,
    situacao: p.estornadoEm ? 'Estornada' : (ROTULO_DO_STATUS_DO_PAGAMENTO[p.status] ?? p.status),
    emAberto: STATUS_EM_ABERTO.has(p.status) && !p.estornadoEm,
    forma: p.forma,
    valorCentavos: p.valorCentavos,
    vencimento: diaDoBanco(p.vencimento),
    pagoEm: p.pagoEm?.toISOString() ?? null,
    linkDaFatura: p.linkDaFatura,
  }
}

async function nomesDosPlanos(): Promise<Map<string, string>> {
  return new Map((await prisma.subscriptionPlan.findMany({ select: { code: true, name: true } })).map((p) => [p.code, p.name]))
}

export async function resumoDaCobranca(companyId: string) {
  const [planos, nomes, assinatura] = await Promise.all([
    planosParaAssinar(),
    nomesDosPlanos(),
    prisma.assinatura.findFirst({ where: { companyId }, orderBy: [{ createdAt: 'desc' }], include: { cupom: { select: { codigo: true } } } }),
  ])
  const pagamentos = await prisma.pagamento.findMany({ where: { companyId, status: { not: 'DELETED' } }, orderBy: { vencimento: 'desc' }, take: 24 })
  return { disponivel: cobrancaDisponivel(), planos, assinatura: assinaturaParaTela(assinatura, nomes), pagamentos: pagamentos.map(pagamentoParaTela) }
}

export async function painelDaCobranca(agora: Date = new Date()) {
  const inicioDoMes = inicioDoMesBrasilia(agora)
  const [nomes, assinaturas, recebidos, porStatus, cupons] = await Promise.all([
    nomesDosPlanos(),
    prisma.assinatura.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      take: 300,
      include: { cupom: { select: { codigo: true } }, company: { select: { id: true, name: true } }, pagamentos: { orderBy: { vencimento: 'desc' }, take: 6 } },
    }),
    prisma.pagamento.aggregate({ where: { pagoEm: { gte: inicioDoMes }, estornadoEm: null }, _sum: { valorCentavos: true, valorLiquidoCentavos: true }, _count: { _all: true } }),
    prisma.assinatura.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.cupom.findMany({ orderBy: { createdAt: 'desc' } }),
  ])
  return {
    disponivel: cobrancaDisponivel(),
    ambiente: cobrador()?.ambiente ?? null,
    mes: {
      recebidoCentavos: recebidos._sum.valorCentavos ?? 0,
      liquidoCentavos: recebidos._sum.valorLiquidoCentavos ?? 0,
      pagamentos: recebidos._count._all,
    },
    porStatus: Object.fromEntries(porStatus.map((s) => [s.status, s._count._all])),
    assinaturas: assinaturas.map((a) => ({
      ...assinaturaParaTela(a, nomes)!,
      ambiente: a.ambiente,
      empresa: a.company,
      motivoDoCancelamento: a.motivoDoCancelamento,
      pagamentos: a.pagamentos.map(pagamentoParaTela),
    })),
    cupons: cupons.map((c) => ({ ...c, validoAte: c.validoAte?.toISOString() ?? null, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })),
  }
}

export async function cancelarAntesDeExcluirEmpresa(companyId: string): Promise<void> {
  const vigente = await assinaturaVigente(companyId)
  if (!vigente?.asaasAssinaturaId) return
  const asaas = cobrador()
  if (!asaas) return
  try {
    await asaas.cancelarAssinatura(vigente.asaasAssinaturaId)
  } catch (err) {
    if (!(err instanceof ErroDoAsaas && err.status === 404)) throw err
  }
}
