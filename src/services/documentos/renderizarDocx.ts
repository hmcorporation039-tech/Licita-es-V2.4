import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { Bloco, DocumentoDaLicitacao } from '../../lib/documentosDaLicitacao/modelo'
import { dimensoesDaImagem, encaixar, imagemLegivel, linhasDaAssinatura, linhasDoRodape, type Timbrado } from './papelTimbrado'

const FONTE = 'Arial'
const COR_SUAVE = '5B5F66'
const COR_FUNDO = 'F3F1EC'
const COR_LINHA = 'D3D0C7'

type Tabela = Extract<Bloco, { tipo: 'tabela' }>

const texto = (t: string, opcoes: { negrito?: boolean; tamanho?: number; cor?: string } = {}) =>
  new TextRun({ text: t, bold: opcoes.negrito, size: opcoes.tamanho ?? 21, color: opcoes.cor, font: FONTE })

function cabecalho(t: Timbrado): Header {
  const { proponente, logo } = t
  const dims = logo && imagemLegivel(logo.conteudo) ? dimensoesDaImagem(logo.conteudo) : null
  const linhaInferior = { bottom: { style: BorderStyle.SINGLE, size: 6, color: COR_LINHA, space: 6 } }
  if (logo && dims) {
    const caixa = encaixar(dims, 220, 64)
    return new Header({
      children: [
        new Paragraph({
          border: linhaInferior,
          children: [
            new ImageRun({ type: logo.mimeType === 'image/png' ? 'png' : 'jpg', data: logo.conteudo, transformation: { width: caixa.largura, height: caixa.altura } }),
            texto(`\t${proponente.razaoSocial}`, { negrito: true, tamanho: 18 }),
          ],
          tabStops: [{ type: 'right', position: 9638 }],
        }),
      ],
    })
  }
  return new Header({
    children: [
      new Paragraph({ children: [texto(proponente.razaoSocial, { negrito: true, tamanho: 30 })] }),
      new Paragraph({ border: linhaInferior, children: [texto(proponente.documento, { tamanho: 17, cor: COR_SUAVE })] }),
    ],
  })
}

function rodape(t: Timbrado): Footer {
  const linhas = linhasDoRodape(t.proponente)
  return new Footer({
    children: [
      ...linhas.map(
        (l, i) =>
          new Paragraph({
            border: i === 0 ? { top: { style: BorderStyle.SINGLE, size: 6, color: COR_LINHA, space: 6 } } : undefined,
            children: [texto(l, { tamanho: 15, cor: COR_SUAVE })],
          }),
      ),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], size: 15, color: COR_SUAVE, font: FONTE })],
      }),
    ],
  })
}

function tabela(t: Tabela): Table {
  const direita = new Set(t.alinharDireita ?? [])
  const proporcoes = t.colunas.length === 6 ? [6, 44, 7, 9, 16, 18] : t.colunas.map(() => 100 / t.colunas.length)
  const celula = (valor: string, i: number, destaque: boolean) =>
    new TableCell({
      width: { size: proporcoes[i], type: WidthType.PERCENTAGE },
      shading: destaque ? { type: ShadingType.CLEAR, color: 'auto', fill: COR_FUNDO } : undefined,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [new Paragraph({ alignment: direita.has(i) ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [texto(valor, { negrito: destaque, tamanho: 17 })] })],
    })
  const linhas = [
    new TableRow({ tableHeader: true, children: t.colunas.map((c, i) => celula(c, i, true)) }),
    ...t.linhas.map((l) => new TableRow({ children: t.colunas.map((_, i) => celula(l[i] ?? '', i, false)) })),
    ...(t.rodape ? [new TableRow({ children: t.colunas.map((_, i) => celula(t.rodape![i] ?? '', i, true)) })] : []),
  ]
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: linhas })
}

function assinatura(local: string, t: Timbrado): Paragraph[] {
  return [
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 240, after: 720 }, children: [texto(local)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [texto('_______________________________________________')] }),
    ...linhasDaAssinatura(t.proponente).map(
      (l, i) => new Paragraph({ alignment: AlignmentType.CENTER, children: [texto(l, { negrito: i === 0, tamanho: 19, cor: i === 0 ? undefined : COR_SUAVE })] }),
    ),
  ]
}

export async function renderizarDocx(documento: DocumentoDaLicitacao, timbrado: Timbrado): Promise<Buffer> {
  const corpo: Array<Paragraph | Table> = []
  for (const bloco of documento.blocos) {
    if (bloco.tipo === 'titulo') {
      corpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 240 }, children: [texto(bloco.texto, { negrito: true, tamanho: 25 })] }))
    } else if (bloco.tipo === 'paragrafo') {
      if (!bloco.texto.trim()) continue
      corpo.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 160, line: 300 }, children: [texto(bloco.texto)] }))
    } else if (bloco.tipo === 'tabela') {
      corpo.push(tabela(bloco), new Paragraph({ spacing: { after: 160 }, children: [] }))
    } else if (bloco.tipo === 'assinatura') {
      corpo.push(...assinatura(bloco.local, timbrado))
    } else if (bloco.tipo === 'quebra') {
      corpo.push(new Paragraph({ children: [new PageBreak()] }))
    }
  }

  const arquivo = new Document({
    creator: timbrado.proponente.razaoSocial,
    title: documento.titulo,
    styles: { default: { document: { run: { font: FONTE, size: 21 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1900, bottom: 1500, left: 1134, right: 1134, header: 560, footer: 560 } } },
        headers: { default: cabecalho(timbrado) },
        footers: { default: rodape(timbrado) },
        children: corpo,
      },
    ],
  })
  return Packer.toBuffer(arquivo)
}
