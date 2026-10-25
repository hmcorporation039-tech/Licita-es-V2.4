import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { gerarPlanilhaXlsx } from '../src/lib/planilhaXlsx'
import { extrairTextoDeOffice, extrairTextoDeDocx } from '../src/services/leitorDeOffice'

function docxDeTeste(corpo: string): Buffer {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}</w:body></w:document>`
  const zip = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships/>'),
    'word/document.xml': strToU8(document),
  })
  return Buffer.from(zip)
}

describe('leitorDeOffice', () => {
  it('lê o texto de uma planilha .xlsx (ida e volta pelo nosso gerador)', () => {
    const xlsx = gerarPlanilhaXlsx({
      nomeDaAba: 'Composição',
      colunas: [
        { titulo: 'Item', largura: 8 },
        { titulo: 'Descrição', largura: 40 },
        { titulo: 'Unidade', largura: 10 },
        { titulo: 'Quantidade', largura: 12, tipo: 'numero' },
        { titulo: 'Valor unitário', largura: 14, tipo: 'moeda' },
      ],
      linhas: [
        [1, 'Microfone sem fio de mão', 'un', 4, 1850.5],
        [2, 'Cabo & conector XLR', 'm', 30, 12.9],
      ],
    })

    const lido = extrairTextoDeOffice(Buffer.from(xlsx))
    expect(lido?.tipo).toBe('xlsx')
    const texto = lido!.texto
    expect(texto).toContain('Descrição')
    expect(texto).toContain('Microfone sem fio de mão')
    expect(texto).toContain('Cabo & conector XLR') // entidade &amp; decodificada
    expect(texto).toContain('1850.5')
    expect(texto).toContain(' | ') // células da mesma linha separadas
  })

  it('lê o texto de um documento .docx por parágrafos', () => {
    const buffer = docxDeTeste(
      '<w:p><w:r><w:t>Termo de Referência</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t xml:space="preserve">Objeto: </w:t><w:t>sistema de áudio</w:t></w:r></w:p>' +
        '<w:p/>' +
        '<w:p><w:r><w:t>Prazo de entrega: 30 dias</w:t></w:r></w:p>'
    )
    const lido = extrairTextoDeOffice(buffer)
    expect(lido?.tipo).toBe('docx')
    const texto = lido!.texto
    expect(texto).toContain('Termo de Referência')
    expect(texto).toContain('Objeto: sistema de áudio')
    expect(texto).toContain('Prazo de entrega: 30 dias')
    expect(texto.split('\n').length).toBeGreaterThanOrEqual(3)
  })

  it('devolve null para conteúdo que não é Office', () => {
    expect(extrairTextoDeOffice(Buffer.from('%PDF-1.7\n...', 'latin1'))).toBeNull()
    expect(extrairTextoDeOffice(Buffer.from('qualquer coisa'))).toBeNull()
    expect(extrairTextoDeOffice(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toBeNull()
  })

  it('extrairTextoDeDocx sem parágrafos cai no texto solto das tags <w:t>', () => {
    const texto = extrairTextoDeDocx({ 'word/document.xml': strToU8('<w:document><w:t>só um pedaço</w:t></w:document>') })
    expect(texto).toBe('só um pedaço')
  })
})
