import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DESCRICAO_NA_LOJA, LIMITE_DA_DESCRICAO, NOME_NA_LOJA, manifestoDaLoja, montarPacote, problemasDoManifesto } from '../scripts/lib/pacoteDaExtensao'

const PASTA = join(__dirname, '..', 'extensao-bela')

describe('pacote da extensão para a Chrome Web Store', () => {
  it('monta o zip sem localhost e com todos os arquivos citados no manifesto', () => {
    const { zip, versao, arquivos } = montarPacote(PASTA)
    const dentro = unzipSync(zip)
    expect(Object.keys(dentro).sort()).toEqual(arquivos)
    expect(arquivos).not.toContain('README.md')
    const manifesto = JSON.parse(new TextDecoder().decode(dentro['manifest.json']))
    expect(manifesto.version).toBe(versao)
    expect(JSON.stringify(manifesto)).not.toMatch(/localhost/)
    expect(manifesto.description).toBe(DESCRICAO_NA_LOJA)
    expect(manifesto.description.length).toBeLessThanOrEqual(LIMITE_DA_DESCRICAO)
    expect(manifesto.name).toBe(NOME_NA_LOJA)
    expect(manifesto.host_permissions).toContain('https://*.licitabela.com.br/*')
  })

  it('a pasta de desenvolvimento continua abrindo no localhost', () => {
    const original = JSON.parse(readFileSync(join(PASTA, 'manifest.json'), 'utf8'))
    expect(original.host_permissions).toContain('http://localhost/*')
  })

  it('aponta o que a loja recusaria', () => {
    const ruim = { manifest_version: 3, description: 'x'.repeat(200), host_permissions: ['http://localhost:3000/*'], action: { default_icon: { '16': 'falta.png' } } }
    const problemas = problemasDoManifesto(ruim, new Set())
    expect(problemas.join(' ')).toMatch(/132/)
    expect(problemas.join(' ')).toMatch(/localhost/)
    expect(problemas.join(' ')).toMatch(/falta\.png/)
    const corrigido = problemasDoManifesto(manifestoDaLoja(ruim), new Set(['falta.png'])).join(' ')
    expect(corrigido).not.toMatch(/localhost/)
    expect(corrigido).not.toMatch(/132/)
  })
})
