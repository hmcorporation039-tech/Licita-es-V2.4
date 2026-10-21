import { describe, expect, it } from 'vitest'
import { caminhoDoArquivoDoCofre, caminhoUnico, extensaoDoTipo, nomeSeguro, planilhaCsv, textoDoLeiaMe } from '../src/lib/exportacaoDosDados'

describe('nomes dos arquivos no pacote', () => {
  it('tira acento, barra e caractere que quebra o Windows', () => {
    expect(nomeSeguro('Certidão: FGTS / CRF*?')).toBe('Certidao FGTS CRF')
    expect(nomeSeguro('../../etc/passwd')).toBe('etc passwd')
    expect(nomeSeguro('   ')).toBe('sem nome')
    expect(nomeSeguro('a'.repeat(200))).toHaveLength(80)
  })

  it('monta o caminho do cofre mantendo a extensão em minúsculas', () => {
    expect(caminhoDoArquivoDoCofre('Certidão Negativa Federal', 'CND federal/2026.PDF')).toBe('cofre-de-documentos/Certidao Negativa Federal - CND federal 2026.pdf')
    expect(caminhoDoArquivoDoCofre('Contrato', 'contrato')).toBe('cofre-de-documentos/Contrato - contrato')
    expect(caminhoDoArquivoDoCofre('Balanço', 'balanço 2025.p*df')).toBe('cofre-de-documentos/Balanco - balanco 2025.pdf')
  })

  it('não deixa dois arquivos com o mesmo nome, sem diferenciar maiúsculas', () => {
    const usados = new Set<string>()
    expect(caminhoUnico(usados, 'cofre/CND.pdf')).toBe('cofre/CND.pdf')
    expect(caminhoUnico(usados, 'cofre/cnd.pdf')).toBe('cofre/cnd (2).pdf')
    expect(caminhoUnico(usados, 'cofre/CND.pdf')).toBe('cofre/CND (3).pdf')
    expect(caminhoUnico(usados, 'cofre/sem-extensao')).toBe('cofre/sem-extensao')
  })

  it('escolhe a extensão da logo pelo tipo', () => {
    expect(extensaoDoTipo('image/png')).toBe('png')
    expect(extensaoDoTipo('IMAGE/JPEG')).toBe('jpg')
    expect(extensaoDoTipo('application/x-desconhecido')).toBe('bin')
  })
})

describe('planilha CSV', () => {
  it('abre no Excel brasileiro: BOM, ponto e vírgula e aspas quando precisa', () => {
    const csv = planilhaCsv(['a', 'b', 'c'], [['texto; com ponto e vírgula', 'diz "oi"', 3.5], [null, true, new Date('2026-10-21T12:00:00Z')]])
    expect(csv).toBe('\uFEFFa;b;c\r\n"texto; com ponto e vírgula";"diz ""oi""";3.5\r\n;sim;2026-10-21T12:00:00.000Z\r\n')
  })

  it('neutraliza fórmula vinda do objeto da licitação, mas não número negativo', () => {
    const csv = planilhaCsv(['x'], [['=HYPERLINK("http://mal")'], ['+1'], ['@SOMA(A1)'], [-5]])
    expect(csv).toContain(`"'=HYPERLINK(""http://mal"")"`)
    expect(csv).toContain(`"'+1"`)
    expect(csv).toContain(`"'@SOMA(A1)"`)
    expect(csv).toContain('\r\n-5\r\n')
  })
})

describe('LEIA-ME', () => {
  const base = {
    geradoEm: new Date('2026-10-21T12:00:00Z'),
    email: 'ana@empresa.com.br',
    empresa: 'ACME Ltda',
    dono: true,
    arquivosDoCofre: 3,
    documentosSemArquivo: 0,
    temLogo: true,
    licitacoesEncontradas: 10,
    licitacoesCortadas: false,
  }

  it('explica o conteúdo e cita a LGPD', () => {
    const texto = textoDoLeiaMe(base)
    expect(texto).toContain('para ana@empresa.com.br, da empresa ACME Ltda')
    expect(texto).toContain('art. 18')
    expect(texto).toContain('os 3 arquivos que você enviou ao cofre, do jeito que foram enviados')
    expect(textoDoLeiaMe({ ...base, arquivosDoCofre: 1 })).toContain('o arquivo que você enviou ao cofre, do jeito que foi enviado')
    expect(textoDoLeiaMe({ ...base, arquivosDoCofre: 0 })).toContain('nenhum arquivo foi enviado ao cofre')
    expect(texto).toContain('logo/')
    expect(texto).not.toContain('membro da empresa')
    expect(texto).toContain('\r\n')
  })

  it('avisa membro, documento sem arquivo e lista cortada', () => {
    const texto = textoDoLeiaMe({ ...base, dono: false, documentosSemArquivo: 2, temLogo: false, licitacoesCortadas: true, licitacoesEncontradas: 20000 })
    expect(texto).toContain('Você é membro da empresa')
    expect(texto).toContain('2 documento(s) do cofre estão cadastrados sem arquivo')
    expect(texto).toContain('as 20000 mais recentes')
    expect(texto).toContain('não tem logomarca')
  })
})
