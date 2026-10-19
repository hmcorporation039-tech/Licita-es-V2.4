import { describe, expect, it } from 'vitest'
import {
  CODIGO_ACESSO_EXPIRADO,
  acessoExpirou,
  avisoDoPedidoDeAcessoEncerrado,
  detalhesDoAcessoEncerrado,
  mensagemDeAcessoEncerrado,
} from '../src/lib/acessoEncerrado'
import { linkDoWhatsAppParaContinuar, numeroDoWhatsApp, situacaoDoAcesso } from '../web/src/lib/acessoDaConta'

describe('fim do teste grátis — mensagens da API', () => {
  const venceu = new Date('2026-10-18T02:30:00Z')

  it('teste vencido diz quando terminou no dia de Brasília e não manda falar com "o administrador"', () => {
    const texto = mensagemDeAcessoEncerrado(venceu, true)
    expect(texto).toBe('Seu teste grátis terminou em 17/10/2026. Seus dados continuam guardados: fale com a equipe da Licita Bela para assinar ou pedir uma cópia deles.')
    expect(texto).not.toMatch(/administrador/i)
    expect(mensagemDeAcessoEncerrado(venceu, false)).toMatch(/^O prazo de acesso da sua conta terminou em 17\/10\/2026/)
  })

  it('o corpo do erro leva código, data e se era teste, para a tela reagir sem ler texto', () => {
    expect(detalhesDoAcessoEncerrado(venceu, 'TESTE')).toEqual({ code: CODIGO_ACESSO_EXPIRADO, acessoAte: venceu.toISOString(), emTeste: true })
    expect(detalhesDoAcessoEncerrado(venceu, 'EMPRESARIAL').emTeste).toBe(false)
  })

  it('só expira depois do instante do prazo', () => {
    expect(acessoExpirou(null)).toBe(false)
    expect(acessoExpirou(venceu, new Date(venceu.getTime() - 1))).toBe(false)
    expect(acessoExpirou(venceu, new Date(venceu.getTime() + 1))).toBe(true)
  })

  it('o aviso ao administrador diz o que a pessoa pediu e o prazo da LGPD na exportação', () => {
    const dados = { email: 'cliente@exemplo.com', empresa: 'Empresa X', companyId: 'c1', planCode: 'TESTE', acessoAte: venceu }
    const exportar = avisoDoPedidoDeAcessoEncerrado('exportar', dados)
    expect(exportar.texto).toContain('até 15 dias')
    expect(exportar.texto).toContain('cliente@exemplo.com')
    expect(exportar.resposta).toMatch(/cópia dos seus dados/)
    expect(avisoDoPedidoDeAcessoEncerrado('continuar', dados).assunto).toBe('Cliente com acesso encerrado quer continuar')
  })
})

describe('fim do teste grátis — o que a tela mostra', () => {
  const agora = new Date('2026-10-17T15:00:00Z')

  it('mostra até quando vai o teste e quantos dias faltam, contando o dia de Brasília', () => {
    expect(situacaoDoAcesso('2026-10-24T15:00:00.000Z', true, agora)).toMatchObject({
      texto: 'Teste grátis até 24/10 (faltam 7 dias)',
      dataCompleta: '24/10/2026',
      diasRestantes: 7,
      expirado: false,
      tom: 'neutral',
    })
    expect(situacaoDoAcesso('2026-10-18T14:00:00.000Z', true, agora)).toMatchObject({ texto: 'Teste grátis até 18/10 (falta 1 dia)', tom: 'danger' })
    expect(situacaoDoAcesso('2026-10-17T22:00:00.000Z', true, agora)?.texto).toBe('Teste grátis até 17/10 (termina hoje)')
    expect(situacaoDoAcesso('2026-10-20T15:00:00.000Z', false, agora)).toMatchObject({ texto: 'Acesso até 20/10 (faltam 3 dias)', tom: 'warn' })
  })

  it('23:30 de Brasília ainda é o mesmo dia, mesmo já sendo o dia seguinte em UTC', () => {
    expect(situacaoDoAcesso('2026-10-18T02:30:00.000Z', true, agora)?.texto).toBe('Teste grátis até 17/10 (termina hoje)')
  })

  it('vencido vira "terminou em"; sem prazo não mostra nada', () => {
    expect(situacaoDoAcesso('2026-10-16T15:00:00.000Z', true, agora)).toMatchObject({ texto: 'Teste grátis terminou em 16/10', expirado: true, tom: 'danger' })
    expect(situacaoDoAcesso(null, true, agora)).toBeNull()
    expect(situacaoDoAcesso('lixo', true, agora)).toBeNull()
  })

  it('WhatsApp só aparece com número configurado, sem dado pessoal no link', () => {
    expect(numeroDoWhatsApp('')).toBeNull()
    expect(numeroDoWhatsApp('123')).toBeNull()
    expect(numeroDoWhatsApp('+55 (61) 99999-0000')).toBe('5561999990000')
    const link = linkDoWhatsAppParaContinuar('5561999990000')
    expect(link).toMatch(/^https:\/\/wa\.me\/5561999990000\?text=/)
    expect(link).not.toContain('@')
  })
})
