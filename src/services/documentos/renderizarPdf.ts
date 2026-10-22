import PDFDocument from 'pdfkit'
import { vemAntesDaAssinatura, type Bloco, type DocumentoDaLicitacao } from '../../lib/documentosDaLicitacao/modelo'
import { dimensoesDaImagem, encaixar, imagemLegivel, linhasDaAssinatura, linhasDoRodape, type Timbrado } from './papelTimbrado'

const MARGEM = 56
const TOPO = 112
const BASE = 86
const ALTURA_DA_ASSINATURA = 125
const COR = { texto: '#1a1c1f', suave: '#5b5f66', linha: '#d3d0c7', fundo: '#f3f1ec' }

type Tabela = Extract<Bloco, { tipo: 'tabela' }>
type DocumentoComImagem = PDFKit.PDFDocument & { openImage(src: Buffer): object }

function larguras(tabela: Tabela, total: number): number[] {
  if (tabela.colunas.length === 6) {
    const fixas = [30, 0, 56, 46, 80, 86]
    const resto = total - fixas.reduce((a, b) => a + b, 0)
    return fixas.map((l) => (l === 0 ? resto : l))
  }
  return tabela.colunas.map(() => total / tabela.colunas.length)
}

export function renderizarPdf(documento: DocumentoDaLicitacao, timbrado: Timbrado): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: TOPO, bottom: BASE, left: MARGEM, right: MARGEM }, info: { Title: documento.titulo, Author: timbrado.proponente.razaoSocial } })
    const partes: Buffer[] = []
    doc.on('data', (b: Buffer) => partes.push(b))
    doc.on('end', () => resolve(Buffer.concat(partes)))
    doc.on('error', reject)

    const largura = doc.page.width - MARGEM * 2
    const limite = () => doc.page.height - BASE

    const garantirEspaco = (altura: number) => {
      if (doc.y + altura > limite()) doc.addPage()
    }

    const desenharTabela = (t: Tabela) => {
      const cols = larguras(t, largura)
      const direita = new Set(t.alinharDireita ?? [])
      const alturaDaLinha = (celulas: string[], fonte: string) => {
        doc.font(fonte).fontSize(8.5)
        return Math.max(...celulas.map((c, i) => doc.heightOfString(c || ' ', { width: cols[i] - 8 }))) + 8
      }
      const linha = (celulas: string[], fonte: string, fundo: string | null) => {
        const altura = alturaDaLinha(celulas, fonte)
        if (doc.y + altura > limite()) {
          doc.addPage()
          linha(t.colunas, 'Helvetica-Bold', COR.fundo)
        }
        const y = doc.y
        if (fundo) doc.rect(MARGEM, y, largura, altura).fill(fundo)
        let x = MARGEM
        celulas.forEach((c, i) => {
          doc.font(fonte).fontSize(8.5).fillColor(COR.texto).text(c, x + 4, y + 4, { width: cols[i] - 8, align: direita.has(i) ? 'right' : 'left' })
          x += cols[i]
        })
        doc.moveTo(MARGEM, y + altura).lineTo(MARGEM + largura, y + altura).lineWidth(0.5).strokeColor(COR.linha).stroke()
        doc.y = y + altura
      }
      garantirEspaco(60)
      linha(t.colunas, 'Helvetica-Bold', COR.fundo)
      t.linhas.forEach((l) => linha(l, 'Helvetica', null))
      if (t.rodape) linha(t.rodape, 'Helvetica-Bold', COR.fundo)
      doc.moveDown(0.8)
    }

    const desenharAssinatura = (local: string) => {
      garantirEspaco(ALTURA_DA_ASSINATURA)
      doc.moveDown(0.6).font('Helvetica').fontSize(10.5).fillColor(COR.texto).text(local, MARGEM, doc.y, { width: largura, align: 'right' })
      doc.moveDown(3.2)
      const y = doc.y
      const larguraDaLinha = 240
      const x = MARGEM + (largura - larguraDaLinha) / 2
      doc.moveTo(x, y).lineTo(x + larguraDaLinha, y).lineWidth(0.8).strokeColor(COR.texto).stroke()
      doc.y = y + 4
      linhasDaAssinatura(timbrado.proponente).forEach((t, i) => {
        doc.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(i === 0 ? COR.texto : COR.suave).text(t, MARGEM, doc.y, { width: largura, align: 'center' })
      })
      doc.moveDown(1)
    }

    const alturaDoParagrafo = (texto: string) => {
      doc.font('Helvetica').fontSize(10.5)
      return doc.heightOfString(texto, { width: largura, align: 'justify', lineGap: 2.5 }) + doc.currentLineHeight() * 0.7
    }

    documento.blocos.forEach((bloco, indice) => {
      if (bloco.tipo === 'titulo') {
        garantirEspaco(50)
        doc.moveDown(0.4).font('Helvetica-Bold').fontSize(12.5).fillColor(COR.texto).text(bloco.texto, MARGEM, doc.y, { width: largura, align: 'center' })
        doc.moveDown(0.8)
      } else if (bloco.tipo === 'paragrafo') {
        if (!bloco.texto.trim()) return
        if (vemAntesDaAssinatura(documento.blocos, indice)) {
          const comAAssinatura = alturaDoParagrafo(bloco.texto) + ALTURA_DA_ASSINATURA
          if (comAAssinatura <= limite() - TOPO) garantirEspaco(comAAssinatura)
        }
        doc.font('Helvetica').fontSize(10.5).fillColor(COR.texto).text(bloco.texto, MARGEM, doc.y, { width: largura, align: 'justify', lineGap: 2.5 })
        doc.moveDown(0.7)
      } else if (bloco.tipo === 'tabela') {
        desenharTabela(bloco)
      } else if (bloco.tipo === 'assinatura') {
        desenharAssinatura(bloco.local)
      } else if (bloco.tipo === 'quebra') {
        doc.addPage()
      }
    })

    const { proponente, logo } = timbrado
    const dims = logo && imagemLegivel(logo.conteudo) ? dimensoesDaImagem(logo.conteudo) : null
    const imagemDoLogo = logo && dims ? (doc as DocumentoComImagem).openImage(logo.conteudo) : null
    const paginas = doc.bufferedPageRange()
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(paginas.start + i)
      const margemInferior = doc.page.margins.bottom
      doc.page.margins.bottom = 0
      if (imagemDoLogo && dims) {
        const caixa = encaixar(dims, 170, 52)
        doc.image(imagemDoLogo as unknown as Buffer, MARGEM, 34 + (52 - caixa.altura) / 2, { width: caixa.largura, height: caixa.altura })
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.texto).text(proponente.razaoSocial, MARGEM + 190, 42, { width: largura - 190, align: 'right', lineBreak: false })
        doc.font('Helvetica').fontSize(8).fillColor(COR.suave).text(proponente.documento, MARGEM + 190, 56, { width: largura - 190, align: 'right', lineBreak: false })
      } else {
        doc.font('Helvetica-Bold').fontSize(15).fillColor(COR.texto).text(proponente.razaoSocial, MARGEM, 40, { width: largura, lineBreak: false })
        doc.font('Helvetica').fontSize(8.5).fillColor(COR.suave).text(proponente.documento, MARGEM, 60, { width: largura, lineBreak: false })
      }
      doc.moveTo(MARGEM, 94).lineTo(MARGEM + largura, 94).lineWidth(0.8).strokeColor(COR.linha).stroke()

      const yRodape = doc.page.height - 66
      doc.moveTo(MARGEM, yRodape).lineTo(MARGEM + largura, yRodape).lineWidth(0.8).strokeColor(COR.linha).stroke()
      linhasDoRodape(proponente).forEach((t, n) => {
        doc.font('Helvetica').fontSize(7.5).fillColor(COR.suave).text(t, MARGEM, yRodape + 7 + n * 10, { width: largura - 60, lineBreak: false })
      })
      doc.font('Helvetica').fontSize(7.5).fillColor(COR.suave).text(`Página ${i + 1} de ${paginas.count}`, MARGEM + largura - 80, yRodape + 7, { width: 80, align: 'right', lineBreak: false })
      doc.page.margins.bottom = margemInferior
    }

    doc.end()
  })
}
