// ============================================================
// services/estudoPdf.ts — PDF do estudo de viabilidade (custos, preços de mercado, deslocamento,
// prazo e resultado) de uma licitação escolhida. Só texto e tabelas, fontes padrão do PDF
// (suportam acentos do português); nenhum caractere fora do Latin-1/WinAnsi.
// ============================================================

import PDFDocument from 'pdfkit'
import { DadosDoEstudo, ItemDaLicitacao, ResultadoDoEstudo } from '../lib/estudoDeCustos'
import type { DossieDaLicitacao } from './dossieDaLicitacao'

export interface EntradaDoPdf {
  empresa: { nome: string; documento: string | null; base: string | null }
  licitacao: {
    objeto: string
    orgao: string | null
    local: string | null
    modalidade: string | null
    fonte: string
    numeroControle: string | null
    valorEstimado: number | null
    sessaoEm: Date | null
    linkEdital: string | null
  }
  // Tudo o que já foi analisado sobre a licitação (habilitação, exigências, alertas); null = não disponível.
  dossie: DossieDaLicitacao | null
  itens: (ItemDaLicitacao & { codigoCatalogo: string | null })[]
  dados: DadosDoEstudo
  resultado: ResultadoDoEstudo
  geradoEm: Date
  geradoPor: string
}

const brl = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ')
const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`)
const dataBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—')
const dataHora = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).replace(/\u00a0/g, ' ')

const MODALIDADES: Record<string, string> = {
  PREGAO_ELETRONICO: 'Pregão eletrônico',
  PREGAO_PRESENCIAL: 'Pregão presencial',
  CONCORRENCIA: 'Concorrência',
  DISPENSA_COM_DISPUTA: 'Dispensa com disputa',
  DISPENSA_SEM_DISPUTA: 'Dispensa sem disputa',
  INEXIGIBILIDADE: 'Inexigibilidade',
  CONVITE: 'Convite',
  TOMADA_DE_PRECOS: 'Tomada de preços',
  CONCURSO: 'Concurso',
  CREDENCIAMENTO: 'Credenciamento',
  DIALOGO_COMPETITIVO: 'Diálogo competitivo',
  OUTROS: 'Outras',
}
const rotuloDaModalidade = (m: string | null) => (m ? (MODALIDADES[m] ?? m) : '—')

const COR = { texto: '#1e293b', suave: '#64748b', linha: '#e2e8f0', bom: '#047857', ruim: '#b91c1c', alerta: '#b45309', titulo: '#3730a3' }
const MARGEM = 40
const TOPO = 100 // espaço do papel timbrado do Monitor de Licitações no alto de cada página

// Fontes padrão do PDF só têm Latin-1 e algumas pontuações: o resto (textos de edital) vira espaço.
const seguro = (t: string) => t.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, ' ').replace(/\s+/g, ' ').trim()
const ROTULO_CATEGORIA: Record<string, string> = { juridica: 'Jurídica', fiscal: 'Fiscal', economica: 'Econômico-financeira', tecnica: 'Técnica', proposta: 'Proposta', outra: 'Outra' }
const ROTULO_RESPONSAVEL: Record<string, string> = { fiscal: 'documentos', calculista: 'preços', redator: 'proposta' }

export function gerarPdfDoEstudo(e: EntradaDoPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: TOPO, bottom: 50, left: MARGEM, right: MARGEM }, bufferPages: true, info: { Title: 'Dossiê da licitação', Author: e.empresa.nome } })
    const partes: Buffer[] = []
    doc.on('data', (c: Buffer) => partes.push(c))
    doc.on('end', () => resolve(Buffer.concat(partes)))
    doc.on('error', reject)

    const largura = doc.page.width - MARGEM * 2
    const limite = () => doc.page.height - MARGEM - 30
    const garantir = (altura: number) => {
      if (doc.y + altura > limite()) doc.addPage()
    }
    const titulo = (t: string) => {
      garantir(40)
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor(COR.titulo).text(t, MARGEM, doc.y, { width: largura })
      doc.moveTo(MARGEM, doc.y + 2).lineTo(MARGEM + largura, doc.y + 2).strokeColor(COR.linha).lineWidth(1).stroke()
      doc.moveDown(0.5).fillColor(COR.texto)
    }
    const par = (rotulo: string, valor: string, cor = COR.texto) => {
      garantir(16)
      const y = doc.y
      doc.font('Helvetica').fontSize(9).fillColor(COR.suave).text(rotulo, MARGEM, y, { width: 170 })
      doc.font('Helvetica-Bold').fontSize(9).fillColor(cor).text(valor, MARGEM + 175, y, { width: largura - 175 })
    }
    const paragrafo = (t: string, cor = COR.texto, tam = 9) => {
      garantir(14)
      doc.font('Helvetica').fontSize(tam).fillColor(cor).text(t, MARGEM, doc.y, { width: largura })
    }

    // ---- Título (o papel timbrado é desenhado em todas as páginas no final) ----
    doc.font('Helvetica-Bold').fontSize(17).fillColor(COR.titulo).text('Dossiê da licitação', MARGEM, doc.y, { width: largura })
    doc.font('Helvetica').fontSize(9).fillColor(COR.suave).text('Estudo de viabilidade, habilitação e exigências do edital', MARGEM, doc.y, { width: largura })
    doc.text(`Gerado em ${dataHora(e.geradoEm)} por ${seguro(e.geradoPor)}`, MARGEM, doc.y, { width: largura })
    doc.moveDown(0.3)

    titulo('Licitação')
    par('Objeto', e.licitacao.objeto.replace(/\s+/g, ' ').slice(0, 600))
    par('Órgão', e.licitacao.orgao ?? '—')
    par('Local', e.licitacao.local ?? '—')
    par('Modalidade / fonte', `${rotuloDaModalidade(e.licitacao.modalidade)} / ${e.licitacao.fonte}`)
    if (e.licitacao.numeroControle) par('Nº de controle', e.licitacao.numeroControle)
    par('Valor estimado pelo órgão', brl(e.licitacao.valorEstimado))
    if (e.licitacao.sessaoEm) par('Sessão / limite das propostas', dataHora(e.licitacao.sessaoEm))
    if (e.licitacao.linkEdital) par('Edital', e.licitacao.linkEdital)

    // ---- Dossiê: o que o edital pede e o que a empresa já tem ----
    const d = e.dossie
    if (d) {
      titulo('Condições da licitação (lidas do edital)')
      if (!d.analisada) paragrafo('O edital ainda não foi analisado pelo sistema. Solicite a análise do edital para completar esta parte do dossiê.', COR.alerta)
      for (const c of d.condicoes) par(c.rotulo, seguro(c.valor).slice(0, 700))

      const h = d.habilitacao
      titulo('Habilitação: documentos da empresa para esta licitação')
      paragrafo(
        `Referência de validade: ${h.referencia.dataSessao ? 'data da sessão (' + dataBr(h.referencia.dataSessao) + ')' : 'hoje (a licitação não informa a data da sessão)'}.`,
        COR.suave,
        8.5
      )
      const resumo = h.resumo
      paragrafo(`Em ordem: ${resumo.verde}  |  Vencem antes da sessão: ${resumo.amarelo}  |  Faltam ou vencidos: ${resumo.vermelho}  |  A conferir: ${resumo.cinza}`, resumo.vermelho > 0 ? COR.ruim : COR.texto, 9)
      const bloco = (nome: string, status: 'verde' | 'amarelo' | 'vermelho' | 'cinza', cor: string, limiteDeLinhas = 60) => {
        const lista = h.requisitos.filter((r) => r.status === status)
        if (lista.length === 0) return
        garantir(30)
        doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).fillColor(cor).text(`${nome} (${lista.length})`, MARGEM, doc.y, { width: largura })
        doc.moveDown(0.2)
        for (const r of lista.slice(0, limiteDeLinhas)) {
          let linha = `[${status === 'verde' ? 'OK' : status === 'cinza' ? '?' : '!'}] ${seguro(r.label)}`
          if (r.documento) linha += ` - ${seguro(r.documento.nome)}${r.documento.dataValidade ? ' (válido até ' + dataBr(r.documento.dataValidade) + ')' : ' (sem vencimento)'}`
          paragrafo(linha, COR.texto, 8.5)
          if (status === 'amarelo' || status === 'vermelho') paragrafo('     ' + seguro(r.motivo) + (r.acao ? ' ' + seguro(r.acao) : ''), COR.suave, 8)
        }
        if (lista.length > limiteDeLinhas) paragrafo(`... e mais ${lista.length - limiteDeLinhas} item(ns).`, COR.suave, 8)
      }
      bloco('Documentos que a empresa já tem e valem para esta licitação', 'verde', COR.bom)
      bloco('Atenção: vencem antes da sessão (renovar a tempo)', 'amarelo', COR.alerta)
      bloco('FALTAM ou estão vencidos (providenciar)', 'vermelho', COR.ruim)
      bloco('A conferir no edital ou feitos para cada proposta', 'cinza', COR.suave, 40)

      if (d.exigencias.length > 0) {
        titulo('Exigências do edital (matriz)')
        const atendidas = d.exigencias.filter((x) => x.atendida).length
        paragrafo(`${atendidas} de ${d.exigencias.length} exigência(s) marcada(s) como atendida(s) pela empresa. [x] atendida, [ ] pendente.`, COR.suave, 8.5)
        for (const x of d.exigencias.slice(0, 120)) {
          const onde = [x.documento ? seguro(x.documento) : '', x.pagina ? 'pág. ' + seguro(x.pagina) : ''].filter(Boolean).join(', ')
          paragrafo(`[${x.atendida ? 'x' : ' '}] ${seguro(x.texto).slice(0, 350)}`, x.atendida ? COR.bom : COR.texto, 8.5)
          paragrafo(
            `     ${ROTULO_CATEGORIA[x.categoria] ?? x.categoria}${x.responsavel ? ' - responsável: ' + (ROTULO_RESPONSAVEL[x.responsavel] ?? x.responsavel) : ''}${onde ? ' - ' + onde : ''}${x.nota ? ' - nota: ' + seguro(x.nota) : ''}`,
            COR.suave,
            7.5
          )
        }
        if (d.exigencias.length > 120) paragrafo(`... e mais ${d.exigencias.length - 120} exigência(s) no sistema.`, COR.suave, 8)
      }

      if (d.exigenciasTecnicas.length > 0) {
        titulo('Exigências técnicas')
        for (const t of d.exigenciasTecnicas.slice(0, 40)) paragrafo('- ' + seguro(t).slice(0, 400), COR.texto, 8.5)
      }

      if (d.alertas.length > 0) {
        titulo('Alertas legais (indícios para análise jurídica, não conclusões)')
        for (const a of d.alertas) {
          paragrafo(`${a.gravidade === 'alta' ? '[ALTA]' : '[MÉDIA]'} ${seguro(a.titulo)}`, a.gravidade === 'alta' ? COR.ruim : COR.alerta, 9)
          paragrafo('     ' + seguro(a.detalhe) + ' ' + seguro(a.fundamento), COR.suave, 8)
        }
      }

      if (d.riscos.length > 0) {
        titulo('Riscos apontados na análise do edital')
        for (const r of d.riscos.slice(0, 30)) {
          paragrafo(`[${r.severidade === 'alta' ? 'ALTO' : r.severidade === 'media' ? 'MÉDIO' : 'BAIXO'}] ${seguro(r.titulo)}`, r.severidade === 'alta' ? COR.ruim : r.severidade === 'media' ? COR.alerta : COR.texto, 9)
          paragrafo('     ' + seguro(r.descricao).slice(0, 500), COR.suave, 8)
        }
      }
    }

    // ---- Resultado ----
    const r = e.resultado
    titulo('Estudo de custos: resultado')
    const corLucro = r.lucro >= 0 ? COR.bom : COR.ruim
    par('Receita (seus preços de venda)', brl(r.receita))
    par('Custo dos itens', brl(r.custoItens))
    par('Deslocamento', brl(r.custoDeslocamento))
    par('Outros custos', brl(r.custoOutros))
    par(`Impostos (${pct(e.dados.impostosPct)})`, brl(r.impostos))
    par('Custo total', brl(r.custoTotal))
    par('TOTAL DOS CUSTOS', brl(r.custoTotal))
    const estimado = e.licitacao.valorEstimado
    if (estimado !== null && estimado > 0 && r.custoTotal > estimado) {
      par('ALERTA', `o total dos custos supera o valor estimado pelo órgão (${brl(estimado)}); concorrer nesse valor daria prejuízo.`, COR.ruim)
    }
    if (r.receita > 0) par(r.lucro >= 0 ? 'Lucro estimado' : 'Resultado com seus preços', `${brl(r.lucro)}   (margem ${pct(r.margemPct)})`, corLucro)
    par(`Preço mínimo (margem de ${pct(e.dados.margemDesejadaPct)})`, r.receitaMinima === null ? '—' : brl(r.receitaMinima))

    if (r.cenarios.length > 0) {
      doc.moveDown(0.6).font('Helvetica-Bold').fontSize(10).fillColor(COR.texto).text('Cenários de lance', MARGEM, doc.y, { width: largura })
      doc.moveDown(0.2)
      const colunas = [MARGEM, MARGEM + 230, MARGEM + 345, MARGEM + 450]
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COR.suave)
      ;['Cenário', 'Valor do lance', 'Lucro', 'Margem'].forEach((t, i) => doc.text(t, colunas[i], doc.y - (i ? 10 : 0), { width: 110, lineBreak: false }))
      doc.moveDown(0.3)
      for (const c of r.cenarios) {
        garantir(14)
        const y = doc.y
        doc.font('Helvetica').fontSize(9).fillColor(COR.texto).text(c.nome, colunas[0], y, { width: 225, lineBreak: false })
        doc.text(brl(c.receita), colunas[1], y, { width: 110, lineBreak: false })
        doc.fillColor(c.lucro >= 0 ? COR.bom : COR.ruim).text(brl(c.lucro), colunas[2], y, { width: 100, lineBreak: false })
        doc.fillColor(COR.texto).text(pct(c.margemPct), colunas[3], y, { width: 70, lineBreak: false })
        doc.moveDown(1)
      }
    }

    // ---- Itens ----
    titulo('Itens: custos, preços e mercado')
    const col = { desc: MARGEM, qtd: MARGEM + 190, custo: MARGEM + 225, venda: MARGEM + 285, minimo: MARGEM + 345, mercado: MARGEM + 410, cod: MARGEM + 475 }
    const cabecalho = () => {
      const y = doc.y
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COR.suave)
      doc.text('Item', col.desc, y, { width: 185, lineBreak: false })
      doc.text('Qtd', col.qtd, y, { width: 32, lineBreak: false })
      doc.text('Custo un.', col.custo, y, { width: 58, lineBreak: false })
      doc.text('Venda un.', col.venda, y, { width: 58, lineBreak: false })
      doc.text('Mínimo un.', col.minimo, y, { width: 62, lineBreak: false })
      doc.text('Mercado (med.)', col.mercado, y, { width: 62, lineBreak: false })
      doc.text('Catálogo', col.cod, y, { width: 50, lineBreak: false })
      doc.y = y + 12
    }
    cabecalho()
    e.itens.forEach((it, i) => {
      const linha = r.itens[i]
      const d = e.dados.itens[it.id]
      const mercado = e.dados.mercado[it.id]
      const desc = `${it.numero ? it.numero + '. ' : ''}${it.descricao.replace(/\s+/g, ' ')}`.slice(0, 120)
      garantir(30)
      if (doc.y + 30 > limite()) cabecalho()
      const y = doc.y
      doc.font('Helvetica').fontSize(8).fillColor(COR.texto)
      const alturaDesc = doc.heightOfString(desc, { width: 185 })
      doc.text(desc, col.desc, y, { width: 185 })
      doc.text(`${it.quantidade.toLocaleString('pt-BR')}${it.unidade ? ' ' + it.unidade : ''}`, col.qtd, y, { width: 34 })
      doc.text(brl(d?.custoUnit ?? null), col.custo, y, { width: 58, lineBreak: false })
      doc.text(brl(d?.precoVendaUnit ?? null), col.venda, y, { width: 58, lineBreak: false })
      doc.text(brl(linha?.precoMinimoUnit ?? null), col.minimo, y, { width: 62, lineBreak: false })
      doc.text(mercado ? brl(mercado.mediana) : '—', col.mercado, y, { width: 62, lineBreak: false })
      doc.text(it.codigoCatalogo ?? '—', col.cod, y, { width: 50, lineBreak: false })
      doc.y = y + Math.max(alturaDesc, 11) + 4
    })
    const comMercado = e.itens.filter((it) => e.dados.mercado[it.id])
    if (comMercado.length > 0) {
      doc.moveDown(0.4)
      paragrafo('Preços de mercado: valores efetivamente pagos por órgãos públicos (Compras.gov.br, Pesquisa de Preços), sem valores extremos.', COR.suave, 8)
      for (const it of comMercado) {
        const m = e.dados.mercado[it.id]
        paragrafo(
          `Item ${it.numero ?? ''}: mínimo ${brl(m.minimo)}, mediana ${brl(m.mediana)}, máximo ${brl(m.maximo)} em ${m.amostras} compra(s)` +
            `${m.uf ? ' (' + m.uf + ')' : ' (Brasil)'}, últimos ${m.meses} meses, consultado em ${dataBr(m.consultadoEm.slice(0, 10))}.`,
          COR.suave,
          8
        )
      }
    }

    // ---- Deslocamento ----
    titulo('Deslocamento')
    const dl = r.deslocamento
    if (dl.kmIda === null) {
      paragrafo('Distância não calculada (base da empresa ou local de entrega não informados).', COR.alerta)
    } else {
      par('Distância (ida)', `${dl.kmIda.toLocaleString('pt-BR')} km (${dl.origem === 'informado' ? 'informada' : 'estimada em linha reta x 1,3'})`)
      par('Ida e volta', `${(dl.kmIdaEVolta ?? 0).toLocaleString('pt-BR')} km`)
    }
    par('Viagens', String(e.dados.deslocamento.viagens))
    par('Valor por km / pedágio / hospedagem', `${brl(e.dados.deslocamento.valorPorKm)} / ${brl(e.dados.deslocamento.pedagioPorViagem)} / ${brl(e.dados.deslocamento.hospedagemPorViagem)}`)
    par('Custo por viagem', brl(dl.custoPorViagem))
    par('Custo total de deslocamento', brl(r.custoDeslocamento))

    if (e.dados.outrosCustos.length > 0) {
      titulo('Outros custos')
      for (const o of e.dados.outrosCustos) par(o.descricao || 'Outro custo', brl(o.valor))
    }

    // ---- Prazo ----
    titulo('Prazo de entrega ou execução')
    const p = r.prazo
    par('Prazo do edital', e.dados.prazo.exigidoDias === null ? 'não informado' : `${e.dados.prazo.exigidoDias} dia(s) ${e.dados.prazo.exigidoEmDiasUteis ? 'úteis' : 'corridos'}`)
    par('Preparo (compra/produção)', `${e.dados.prazo.preparoDias} dia(s)`)
    par('Transporte estimado', `${p.diasDeTransporte} dia(s)`)
    par('Total necessário', `${p.diasNecessarios} dia(s)`)
    if (p.situacao) {
      const cor = p.situacao === 'ok' ? COR.bom : p.situacao === 'apertado' ? COR.alerta : COR.ruim
      par('Situação', `${p.situacao === 'ok' ? 'Cabe no prazo' : p.situacao === 'apertado' ? 'Prazo apertado' : 'Prazo inviável'} (folga de ${p.folgaDias} dia(s))`, cor)
    }
    if (e.dados.prazo.assinatura) {
      par('Assinatura prevista', dataBr(e.dados.prazo.assinatura))
      par('Entrega prevista', dataBr(p.dataEntregaPrevista))
      par('Data limite do edital', dataBr(p.dataLimite))
    }

    // ---- Avisos e ressalvas ----
    if (r.avisos.length > 0) {
      titulo('Atenção')
      for (const a of r.avisos) paragrafo('- ' + a, COR.alerta)
    }
    doc.moveDown(1)
    paragrafo(
      'Este estudo é um apoio à decisão e não garante resultado. Distâncias são estimativas em linha reta com fator de correção; preços de mercado são os praticados em compras anteriores de órgãos públicos; custos, impostos e prazos são informados pela própria empresa. Confira o edital antes de ofertar.',
      COR.suave,
      8
    )

    // Papel timbrado do Monitor de Licitações (nome da plataforma) com o nome e o CNPJ/CPF da empresa,
    // e rodapé, em TODAS as páginas. A margem inferior é zerada para o rodapé não abrir página nova.
    const { start, count } = doc.bufferedPageRange()
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i)
      doc.page.margins.bottom = 0
      doc.rect(0, 0, doc.page.width, 8).fill(COR.titulo)
      doc.font('Helvetica-Bold').fontSize(17).fillColor(COR.titulo).text('Monitor de Licitações', MARGEM, 26, { width: largura, lineBreak: false })
      doc.font('Helvetica').fontSize(8).fillColor(COR.suave).text('Acompanhamento, análise e estudo de viabilidade de licitações públicas', MARGEM, 47, { width: largura, lineBreak: false })
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.texto).text(
        seguro(e.empresa.nome) + (e.empresa.documento ? '  -  ' + (e.empresa.documento.replace(/\D/g, '').length === 14 ? 'CNPJ ' : 'CPF ') + seguro(e.empresa.documento) : ''),
        MARGEM,
        62,
        { width: largura, lineBreak: false, ellipsis: true }
      )
      doc.moveTo(MARGEM, TOPO - 16).lineTo(MARGEM + largura, TOPO - 16).strokeColor(COR.titulo).lineWidth(1.2).stroke()
      doc.font('Helvetica').fontSize(7.5).fillColor(COR.suave)
      doc.text(`Monitor de Licitações - ${seguro(e.empresa.nome)} - página ${i - start + 1} de ${count}`, MARGEM, doc.page.height - 28, { width: largura, align: 'center', lineBreak: false })
    }
    doc.end()
  })
}
