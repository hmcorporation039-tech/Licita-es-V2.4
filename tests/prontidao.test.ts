import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { migrationsDoCodigo, migrationsPendentes } from '../src/services/prontidao'
import { MINIMO_ESPERADO, precisaImportar } from '../src/services/catalogoBootstrap'

describe('migrationsPendentes', () => {
  const codigo = ['001_a', '002_b', '003_c']

  it('vazio quando o banco tem tudo que o código conhece', () => {
    expect(migrationsPendentes(codigo, ['001_a', '002_b', '003_c'])).toEqual([])
  })

  it('lista o que o código tem e o banco ainda não aplicou (o caso do deploy sem migration)', () => {
    expect(migrationsPendentes(codigo, ['001_a'])).toEqual(['002_b', '003_c'])
  })

  it('banco à frente do código (rollback para versão antiga) não é pendência', () => {
    expect(migrationsPendentes(['001_a'], ['001_a', '002_b', '003_c'])).toEqual([])
  })
})

describe('migrationsDoCodigo', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'migr-'))
  afterAll(() => rmSync(raiz, { recursive: true, force: true }))

  it('lê só as pastas numeradas, em ordem, ignorando arquivos como migration_lock.toml', () => {
    for (const nome of ['00000000000002_b', '00000000000000_baseline', '00000000000001_a', 'nao-migration']) {
      mkdirSync(join(raiz, nome))
    }
    expect(migrationsDoCodigo(raiz)).toEqual(['00000000000000_baseline', '00000000000001_a', '00000000000002_b'])
  })

  it('pasta inexistente não bloqueia a prontidão (devolve vazio)', () => {
    expect(migrationsDoCodigo(join(raiz, 'nao-existe'))).toEqual([])
  })

  it('o projeto real tem a migration mais recente conhecida pelo código', () => {
    const reais = migrationsDoCodigo()
    expect(reais.length).toBeGreaterThanOrEqual(16)
    expect(reais).toContain('00000000000015_fonte_sesc_regional')
  })
})

describe('precisaImportar (UASG e catálogo)', () => {
  const AGORA = new Date(2026, 9, 1, 12, 0)
  const dias = (n: number) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000)
  const MAX_IDADE = 35 * 24 * 60 * 60 * 1000

  it('importa quando a tabela está vazia', () => {
    expect(precisaImportar(0, null, MINIMO_ESPERADO.uasg, AGORA, MAX_IDADE)).toBe('tabela vazia')
  })

  it('importa quando os dados têm mais que a idade máxima', () => {
    expect(precisaImportar(22_000, dias(40), MINIMO_ESPERADO.uasg, AGORA, MAX_IDADE)).toBe('dados antigos')
  })

  it('NÃO importa tabela completa e recente', () => {
    expect(precisaImportar(22_000, dias(3), MINIMO_ESPERADO.uasg, AGORA, MAX_IDADE)).toBeNull()
  })

  it('importa tabela INCOMPLETA (caso real: 3.000 UASGs de ~22 mil), recente ou não', () => {
    expect(precisaImportar(3_000, dias(5), MINIMO_ESPERADO.uasg, AGORA, MAX_IDADE)).toBe('tabela incompleta')
  })

  it('tabela incompleta só é tentada de novo depois de 1 dia (a fonte pode ter encolhido)', () => {
    expect(precisaImportar(3_000, new Date(AGORA.getTime() - 60 * 60 * 1000), MINIMO_ESPERADO.uasg, AGORA, MAX_IDADE)).toBeNull()
  })

  it('forçar sempre importa', () => {
    expect(precisaImportar(22_000, dias(1), MINIMO_ESPERADO.uasg, AGORA, MAX_IDADE, true)).toBe('forçada')
  })

  it('o mínimo de cada fonte fica abaixo do tamanho real das fontes', () => {
    expect(MINIMO_ESPERADO.uasg).toBeLessThan(22_000)
    expect(MINIMO_ESPERADO.servico).toBeLessThan(3_100)
    expect(MINIMO_ESPERADO.material).toBeLessThan(345_000)
  })
})
