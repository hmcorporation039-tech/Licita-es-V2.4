import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  chavesDoAmbiente,
  cifrar,
  decifrar,
  precisaRecifrar,
  versaoDoBlob,
  type ChaveVersionada,
} from '../src/lib/cofreDeCredenciais'

const chaveV1: ChaveVersionada = { versao: 1, chave: randomBytes(32) }
const chaveV2: ChaveVersionada = { versao: 2, chave: randomBytes(32) }

describe('cofreDeCredenciais', () => {
  it('cifra e decifra de volta (ida e volta)', () => {
    const blob = cifrar('senha-do-portal-123', chaveV1)
    expect(decifrar(blob, [chaveV1])).toBe('senha-do-portal-123')
  })

  it('o blob não contém a senha em texto puro', () => {
    const blob = cifrar('MinhaSenhaSecreta', chaveV1)
    expect(blob.toString('utf8')).not.toContain('MinhaSenhaSecreta')
    expect(blob.toString('latin1')).not.toContain('MinhaSenhaSecreta')
  })

  it('cada cifragem usa IV novo (saídas diferentes para a mesma senha)', () => {
    const a = cifrar('igual', chaveV1)
    const b = cifrar('igual', chaveV1)
    expect(a.equals(b)).toBe(false)
  })

  it('falha ao decifrar com a chave errada', () => {
    const blob = cifrar('x', chaveV1)
    expect(() => decifrar(blob, [{ versao: 1, chave: randomBytes(32) }])).toThrow()
  })

  it('falha quando a chave da versão não está carregada', () => {
    const blob = cifrar('x', chaveV2)
    expect(() => decifrar(blob, [chaveV1])).toThrow(/não está carregada/)
  })

  it('suporta rotação: decifra com [atual, anterior] e marca para recifrar', () => {
    const blob = cifrar('antiga', chaveV1)
    expect(decifrar(blob, [chaveV2, chaveV1])).toBe('antiga')
    expect(versaoDoBlob(blob)).toBe(1)
    expect(precisaRecifrar(blob, 2)).toBe(true)
    expect(precisaRecifrar(cifrar('nova', chaveV2), 2)).toBe(false)
  })

  it('detecta adulteração (tag GCM)', () => {
    const blob = cifrar('integridade', chaveV1)
    const mexido = Buffer.from(blob)
    mexido[mexido.length - 1] ^= 0x01
    expect(() => decifrar(mexido, [chaveV1])).toThrow()
  })

  it('rejeita chave com tamanho errado', () => {
    expect(() => cifrar('x', { versao: 1, chave: randomBytes(16) })).toThrow(/32 bytes/)
  })

  it('lê as chaves do ambiente, com a anterior opcional', () => {
    const env = {
      CREDENCIAIS_PORTAL_CHAVE: randomBytes(32).toString('base64'),
      CREDENCIAIS_PORTAL_CHAVE_VERSAO: '2',
      CREDENCIAIS_PORTAL_CHAVE_ANTERIOR: randomBytes(32).toString('base64'),
    } as NodeJS.ProcessEnv
    const { atual, todas } = chavesDoAmbiente(env)
    expect(atual.versao).toBe(2)
    expect(todas.map((c) => c.versao)).toEqual([2, 1])
  })

  it('exige a chave do ambiente', () => {
    expect(() => chavesDoAmbiente({} as NodeJS.ProcessEnv)).toThrow(/CREDENCIAIS_PORTAL_CHAVE/)
  })
})
