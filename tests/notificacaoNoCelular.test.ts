import { describe, expect, it } from 'vitest'
import {
  descreverAparelho,
  encurtar,
  enderecoDeEntregaAceito,
  mensagemDeAlteracao,
  mensagemDeNovasLicitacoes,
  mensagemDoLembreteDePrazo,
} from '../src/lib/notificacaoNoCelular'

const AGORA = new Date('2026-10-21T12:00:00Z')
const HORA_MS = 3_600_000

describe('endereço de entrega das notificações', () => {
  it('aceita só os serviços de entrega dos navegadores', () => {
    expect(enderecoDeEntregaAceito('https://fcm.googleapis.com/fcm/send/abc:def')).toBe(true)
    expect(enderecoDeEntregaAceito('https://web.push.apple.com/QGk2')).toBe(true)
    expect(enderecoDeEntregaAceito('https://updates.push.services.mozilla.com/wpush/v2/gAAA')).toBe(true)
    expect(enderecoDeEntregaAceito('https://wns2-bl2p.notify.windows.com/w/?token=AwYA')).toBe(true)
  })

  it('recusa endereço interno, sem https, com porta ou com host parecido', () => {
    expect(enderecoDeEntregaAceito('http://fcm.googleapis.com/fcm/send/abc')).toBe(false)
    expect(enderecoDeEntregaAceito('https://fcm.googleapis.com:8443/fcm/send/abc')).toBe(false)
    expect(enderecoDeEntregaAceito('https://169.254.169.254/latest/meta-data')).toBe(false)
    expect(enderecoDeEntregaAceito('https://localhost/push')).toBe(false)
    expect(enderecoDeEntregaAceito('https://fcm.googleapis.com.atacante.com/x')).toBe(false)
    expect(enderecoDeEntregaAceito('https://atacantepush.services.mozilla.com/x')).toBe(false)
    expect(enderecoDeEntregaAceito('https://user:senha@fcm.googleapis.com/x')).toBe(false)
    expect(enderecoDeEntregaAceito('não é url')).toBe(false)
  })
})

describe('textos das notificações', () => {
  const licitacao = (n: number) => ({ tenderId: `t${n}`, objeto: `Aquisição de esquadrias ${n}`, orgao: 'Prefeitura de Goiânia', uf: 'GO' })

  it('uma licitação nova abre direto a licitação', () => {
    const m = mensagemDeNovasLicitacoes([licitacao(1)])
    expect(m).toEqual({ titulo: 'Licitação nova para você', corpo: 'Aquisição de esquadrias 1 · Prefeitura de Goiânia/GO', url: '/tenders/t1', tag: 'novas-licitacoes' })
  })

  it('várias licitações novas viram um aviso só, que abre a lista de matches', () => {
    const m = mensagemDeNovasLicitacoes([licitacao(1), licitacao(2), licitacao(3)])
    expect(m.titulo).toBe('3 licitações novas para você')
    expect(m.corpo).toBe('Aquisição de esquadrias 1 e mais 2 licitações')
    expect(m.url).toBe('/matches')
  })

  it('lembrete de prazo diz quanto falta e começa pelo prazo mais curto', () => {
    const uma = mensagemDoLembreteDePrazo([{ tenderId: 't1', objeto: 'Material de limpeza', fimDoPrazo: new Date(AGORA.getTime() + 23.5 * HORA_MS) }], AGORA)
    expect(uma).toEqual({ titulo: 'Faltam 23 horas para o fim do prazo', corpo: 'Material de limpeza', url: '/tenders/t1', tag: 'prazo-t1' })

    const duas = mensagemDoLembreteDePrazo(
      [
        { tenderId: 't1', objeto: 'Longe', fimDoPrazo: new Date(AGORA.getTime() + 40 * HORA_MS) },
        { tenderId: 't2', objeto: 'Perto', fimDoPrazo: new Date(AGORA.getTime() + 5 * HORA_MS) },
      ],
      AGORA
    )
    expect(duas.titulo).toBe('2 licitações com prazo perto do fim')
    expect(duas.corpo).toBe('Perto e mais 1 licitação')
    expect(duas.url).toBe('/escolhidas')
  })

  it('alteração diz o que mudou', () => {
    expect(mensagemDeAlteracao('t9', 'Reforma da escola', ['Fim do recebimento de propostas'])).toEqual({
      titulo: 'Licitação alterada pelo órgão',
      corpo: 'Fim do recebimento de propostas: Reforma da escola',
      url: '/tenders/t9',
      tag: 'alteracao-t9',
    })
  })

  it('encurta objeto longo sem passar do limite', () => {
    const longo = 'a '.repeat(300)
    const curto = encurtar(longo)
    expect(curto.length).toBeLessThanOrEqual(180)
    expect(curto.endsWith('…')).toBe(true)
  })
})

describe('nome do aparelho', () => {
  it('descreve sistema e navegador', () => {
    expect(descreverAparelho('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36')).toBe('Android · Chrome')
    expect(descreverAparelho('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari')
    expect(descreverAparelho('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0')).toBe('Windows · Edge')
    expect(descreverAparelho(undefined)).toBeNull()
  })
})
