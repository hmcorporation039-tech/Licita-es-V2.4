import { describe, expect, it } from 'vitest'
import {
  base32,
  cifrarSegredo,
  codigoDoPasso,
  confirmacaoRecente,
  deBase32,
  decifrarSegredo,
  enderecoDoAutenticador,
  gerarCodigosDeRecuperacao,
  gerarSegredo,
  pareceCodigoDeRecuperacao,
  passoDoCodigoValido,
  passoDoMomento,
  resumoDoCodigoDeRecuperacao,
  resumoQueConfere,
  segredoAgrupado,
  segundoFatorDoAdminExigido,
} from '../src/lib/segundoFator'

const SEGREDO_DA_RFC = Buffer.from('12345678901234567890', 'ascii')
const SEGREDO_DA_RFC_EM_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('código do aplicativo (RFC 6238)', () => {
  it('bate com os vetores de teste oficiais', () => {
    expect(codigoDoPasso(SEGREDO_DA_RFC, Math.floor(59 / 30), 8)).toBe('94287082')
    expect(codigoDoPasso(SEGREDO_DA_RFC, Math.floor(1111111109 / 30), 8)).toBe('07081804')
    expect(codigoDoPasso(SEGREDO_DA_RFC, Math.floor(1234567890 / 30), 8)).toBe('89005924')
    expect(codigoDoPasso(SEGREDO_DA_RFC, Math.floor(20000000000 / 30), 8)).toBe('65353130')
    expect(codigoDoPasso(SEGREDO_DA_RFC, Math.floor(1111111109 / 30))).toBe('081804')
  })

  it('converte base32 nos dois sentidos', () => {
    expect(base32(SEGREDO_DA_RFC)).toBe(SEGREDO_DA_RFC_EM_BASE32)
    expect(deBase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq').equals(SEGREDO_DA_RFC)).toBe(true)
    const segredo = gerarSegredo()
    expect(segredo).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32(deBase32(segredo))).toBe(segredo)
    expect(() => deBase32('1890')).toThrow()
  })

  it('aceita o código de agora e o vizinho de 30 s, e recusa o resto', () => {
    const agora = new Date(1_111_111_109_000)
    const passo = passoDoMomento(agora)
    const codigo = (p: number) => codigoDoPasso(SEGREDO_DA_RFC, p)
    expect(passoDoCodigoValido(SEGREDO_DA_RFC_EM_BASE32, codigo(passo), agora, null)).toBe(passo)
    expect(passoDoCodigoValido(SEGREDO_DA_RFC_EM_BASE32, codigo(passo - 1), agora, null)).toBe(passo - 1)
    expect(passoDoCodigoValido(SEGREDO_DA_RFC_EM_BASE32, codigo(passo + 1), agora, null)).toBe(passo + 1)
    expect(passoDoCodigoValido(SEGREDO_DA_RFC_EM_BASE32, codigo(passo - 2), agora, null)).toBeNull()
    expect(passoDoCodigoValido(SEGREDO_DA_RFC_EM_BASE32, '12345', agora, null)).toBeNull()
    expect(passoDoCodigoValido(SEGREDO_DA_RFC_EM_BASE32, 'abcdef', agora, null)).toBeNull()
    expect(passoDoCodigoValido(SEGREDO_DA_RFC_EM_BASE32, codigo(passo).replace(/(\d{3})/, '$1 '), agora, null)).toBe(passo)
  })

  it('não deixa usar duas vezes o mesmo código nem um mais antigo', () => {
    const agora = new Date(1_234_567_890_000)
    const passo = passoDoMomento(agora)
    const codigo = codigoDoPasso(SEGREDO_DA_RFC, passo)
    expect(passoDoCodigoValido(SEGREDO_DA_RFC_EM_BASE32, codigo, agora, passo)).toBeNull()
    expect(passoDoCodigoValido(SEGREDO_DA_RFC_EM_BASE32, codigoDoPasso(SEGREDO_DA_RFC, passo - 1), agora, passo - 1)).toBeNull()
    expect(passoDoCodigoValido(SEGREDO_DA_RFC_EM_BASE32, codigo, agora, passo - 1)).toBe(passo)
  })

  it('monta o endereço que o Google Authenticator lê', () => {
    const endereco = enderecoDoAutenticador('adm@licitabela.com.br', 'ABCD')
    expect(endereco).toBe('otpauth://totp/Licita%20Bela%3Aadm%40licitabela.com.br?secret=ABCD&issuer=Licita%20Bela&algorithm=SHA1&digits=6&period=30')
    expect(segredoAgrupado('ABCDEFGHIJ')).toBe('ABCD EFGH IJ')
  })
})

describe('códigos de recuperação', () => {
  it('gera 8 códigos diferentes, fáceis de ler e sem 0/O nem 1/I', () => {
    const codigos = gerarCodigosDeRecuperacao()
    expect(codigos).toHaveLength(8)
    expect(new Set(codigos).size).toBe(8)
    for (const c of codigos) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/)
  })

  it('confere sem diferenciar maiúsculas, espaço ou hífen', () => {
    const guardados = ['ABCDE-FGHJK', 'MNPQR-STUVW'].map(resumoDoCodigoDeRecuperacao)
    expect(resumoQueConfere('abcde fghjk', guardados)).toBe(guardados[0])
    expect(resumoQueConfere('MNPQRSTUVW', guardados)).toBe(guardados[1])
    expect(resumoQueConfere('ZZZZZ-ZZZZZ', guardados)).toBeNull()
    expect(resumoDoCodigoDeRecuperacao('ABCDE-FGHJK')).not.toContain('ABCDE')
  })

  it('separa código de recuperação de código do aplicativo', () => {
    expect(pareceCodigoDeRecuperacao('ABCDE-FGHJK')).toBe(true)
    expect(pareceCodigoDeRecuperacao('123456')).toBe(false)
    expect(pareceCodigoDeRecuperacao('1234567890')).toBe(false)
  })
})

describe('guarda do segredo e regras da sessão', () => {
  it('guarda o segredo cifrado e só abre com o segredo do servidor', () => {
    const guardado = cifrarSegredo('GEZDGNBVGY3TQOJQ', 'x'.repeat(40))
    expect(guardado).not.toContain('GEZDGNBV')
    expect(guardado.startsWith('v1.')).toBe(true)
    expect(decifrarSegredo(guardado, 'x'.repeat(40))).toBe('GEZDGNBVGY3TQOJQ')
    expect(() => decifrarSegredo(guardado, 'y'.repeat(40))).toThrow()
    expect(cifrarSegredo('GEZDGNBVGY3TQOJQ', 'x'.repeat(40))).not.toBe(guardado)
  })

  it('a confirmação vale por 15 minutos', () => {
    const agora = new Date('2026-10-21T15:00:00Z')
    const segundos = (d: Date) => Math.floor(d.getTime() / 1000)
    expect(confirmacaoRecente(segundos(new Date('2026-10-21T14:46:00Z')), agora)).toBe(true)
    expect(confirmacaoRecente(segundos(new Date('2026-10-21T14:44:59Z')), agora)).toBe(false)
    expect(confirmacaoRecente(undefined, agora)).toBe(false)
  })

  it('em produção o login em duas etapas do admin é sempre exigido', () => {
    expect(segundoFatorDoAdminExigido({ NODE_ENV: 'production', SEGUNDO_FATOR_DO_ADMIN: 'desligado' })).toBe(true)
    expect(segundoFatorDoAdminExigido({})).toBe(true)
    expect(segundoFatorDoAdminExigido({ NODE_ENV: 'test' })).toBe(false)
    expect(segundoFatorDoAdminExigido({ NODE_ENV: 'test', SEGUNDO_FATOR_DO_ADMIN: 'ligado' })).toBe(true)
    expect(segundoFatorDoAdminExigido({ SEGUNDO_FATOR_DO_ADMIN: 'desligado' })).toBe(false)
  })
})
