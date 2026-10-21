import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  TIPOS_DE_AVISO,
  cabecalhosDeDescadastro,
  lerTokenDeDescadastro,
  linksDeDescadastro,
  tokenDeDescadastro,
} from '../src/lib/descadastro'
import { emailDaMarca } from '../src/lib/emailDaMarca'
import { montarEmailDoResumoDiario, type LicitacaoDoResumo } from '../src/services/emailService'

const SEGREDO = 'segredo-de-teste-com-tamanho-bom'
const USUARIO = '6f1c2b8e-3a4d-4c5e-9f00-112233445566'

describe('token de descadastro', () => {
  it('válido: devolve o usuário e o tipo de aviso', () => {
    for (const tipo of TIPOS_DE_AVISO) {
      const token = tokenDeDescadastro(USUARIO, tipo, SEGREDO)!
      expect(lerTokenDeDescadastro(token, SEGREDO)).toEqual({ userId: USUARIO, tipo })
    }
  })

  it('adulterado: trocar o conteúdo ou a assinatura invalida o token', () => {
    const token = tokenDeDescadastro(USUARIO, 'resumo-diario', SEGREDO)!
    const [conteudo, assinatura] = token.split('.')
    const outroConteudo = Buffer.from(`d1:outro-usuario:resumo-diario`).toString('base64url')
    expect(lerTokenDeDescadastro(`${outroConteudo}.${assinatura}`, SEGREDO)).toBeNull()
    const outroTipo = Buffer.from(`d1:${USUARIO}:aviso-de-documento`).toString('base64url')
    expect(lerTokenDeDescadastro(`${outroTipo}.${assinatura}`, SEGREDO)).toBeNull()
    const primeira = assinatura[0] === 'A' ? 'B' : 'A'
    expect(lerTokenDeDescadastro(`${conteudo}.${primeira}${assinatura.slice(1)}`, SEGREDO)).toBeNull()
    expect(lerTokenDeDescadastro(token, 'outro-segredo-com-tamanho-bom')).toBeNull()
    expect(lerTokenDeDescadastro('', SEGREDO)).toBeNull()
    expect(lerTokenDeDescadastro('sem-ponto', SEGREDO)).toBeNull()
    expect(lerTokenDeDescadastro(123, SEGREDO)).toBeNull()
    expect(lerTokenDeDescadastro('a'.repeat(400), SEGREDO)).toBeNull()
  })

  it('tipo errado: assinatura certa com tipo que não existe é recusada', () => {
    const conteudo = Buffer.from(`d1:${USUARIO}:propaganda`).toString('base64url')
    const assinatura = createHmac('sha256', `descadastro:${SEGREDO}`).update(conteudo).digest('base64url')
    expect(lerTokenDeDescadastro(`${conteudo}.${assinatura}`, SEGREDO)).toBeNull()
  })

  it('sem segredo configurado não gera nem aceita token', () => {
    expect(tokenDeDescadastro(USUARIO, 'resumo-diario', '')).toBeNull()
    const token = tokenDeDescadastro(USUARIO, 'resumo-diario', SEGREDO)!
    expect(lerTokenDeDescadastro(token, '')).toBeNull()
    expect(linksDeDescadastro(USUARIO, 'resumo-diario', {} as NodeJS.ProcessEnv)).toBeUndefined()
  })

  it('links apontam para a página e para o POST de um clique, e os cabecalhos seguem a RFC 8058', () => {
    const links = linksDeDescadastro(USUARIO, 'lembrete-de-prazo', { JWT_SECRET: SEGREDO, APP_URL: 'https://www.licitabela.com.br/' } as NodeJS.ProcessEnv)!
    expect(links.pagina).toMatch(/^https:\/\/www\.licitabela\.com\.br\/descadastro\?t=/)
    expect(links.umClique).toMatch(/^https:\/\/www\.licitabela\.com\.br\/descadastro\/um-clique\?t=/)
    const token = decodeURIComponent(new URL(links.pagina).searchParams.get('t')!)
    expect(lerTokenDeDescadastro(token, SEGREDO)).toEqual({ userId: USUARIO, tipo: 'lembrete-de-prazo' })
    expect(cabecalhosDeDescadastro(links)).toEqual({
      'List-Unsubscribe': `<${links.umClique}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
    expect(cabecalhosDeDescadastro(undefined)).toBeUndefined()
  })
})

describe('rodapé do e-mail', () => {
  const base = { previa: 'Prévia', titulo: 'Título', motivo: 'Você recebeu este aviso por um motivo.' }

  it('sem link de descadastro o rodapé fica como era', () => {
    const html = emailDaMarca(base)
    expect(html).not.toContain('Descadastrar')
    expect(html).toContain('Você recebeu este aviso por um motivo.<br>Licita Bela')
  })

  it('com link mostra "Descadastrar" apontando para a página', () => {
    const html = emailDaMarca({ ...base, descadastro: 'https://www.licitabela.com.br/descadastro?t=abc.def' })
    expect(html).toContain('Não quer mais receber este tipo de e-mail?')
    expect(html).toContain('href="https://www.licitabela.com.br/descadastro?t=abc.def"')
  })

  it('link que não é http(s) é ignorado', () => {
    expect(emailDaMarca({ ...base, descadastro: 'javascript:alert(1)' })).not.toContain('Descadastrar')
  })

  it('o resumo diário leva o link no rodapé e os cabeçalhos quando recebe os links', () => {
    const licitacao: LicitacaoDoResumo = {
      tenderId: 't1',
      objeto: 'Compra de cimento',
      fonte: 'PNCP',
      orgao: 'Prefeitura',
      municipio: 'Anápolis',
      uf: 'GO',
      encerramentoAt: null,
      aberturaAt: null,
      itens: ['Cimento'],
      tenderMatchIds: ['m1'],
      dentroDeObraCompleta: false,
    }
    const env = { APP_URL: 'https://www.licitabela.com.br', JWT_SECRET: SEGREDO } as NodeJS.ProcessEnv
    const links = linksDeDescadastro(USUARIO, 'resumo-diario', env)
    const comLink = montarEmailDoResumoDiario([licitacao], env, links)
    expect(comLink.html).toContain('Descadastrar')
    expect(comLink.cabecalhos?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    const semLink = montarEmailDoResumoDiario([licitacao], env)
    expect(semLink.html).not.toContain('Descadastrar')
    expect(semLink.cabecalhos).toBeUndefined()
  })
})
