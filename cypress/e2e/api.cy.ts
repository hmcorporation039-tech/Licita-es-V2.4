// ============================================================
// cypress/e2e/api.cy.ts — Testes da API REST (auth, monitored-items,
// rematch, matches, tenders) rodando contra o banco real (Railway)
// ============================================================

const uniqueEmail = () => `cypress-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
const TEST_PASSWORD = 'CypressTest123!'

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` }
}

// Não existe mais autocadastro aberto — todo usuário de teste é criado
// pelo admin seedado via `npx ts-node scripts/createAdmin.ts` (ver
// cypress.config.ts pras credenciais).
function loginAsAdmin() {
  return cy
    .request('POST', '/api/auth/login', {
      email: Cypress.env('ADMIN_EMAIL'),
      password: Cypress.env('ADMIN_PASSWORD'),
    })
    .then((res) => res.body.token as string)
}

function createTestUser() {
  return loginAsAdmin().then((adminToken) => {
    const email = uniqueEmail()
    return cy
      .request({
        method: 'POST',
        url: '/api/admin/users',
        headers: authHeaders(adminToken),
        body: { email, password: TEST_PASSWORD, name: 'Cypress Tester' },
      })
      .then(() =>
        cy.request('POST', '/api/auth/login', { email, password: TEST_PASSWORD }).then((loginRes) => ({
          userId: loginRes.body.user.id as string,
          token: loginRes.body.token as string,
        }))
      )
  })
}

// Roda uma vez antes de tudo — garante que existe pelo menos uma licitação
// "notebook" determinística (não depende do que o PNCP publicou recentemente).
before(() => {
  cy.task('seedFixtureTenders')
})

describe('API — health', () => {
  it('responde ok', () => {
    cy.request('/api/health').its('body').should('deep.equal', { ok: true })
  })
})

describe('API — autenticação', () => {
  it('rejeita requisição sem token (401)', () => {
    cy.request({ url: '/api/monitored-items', failOnStatusCode: false }).then((res) => {
      expect(res.status).to.eq(401)
    })
  })

  it('rejeita login com senha errada', () => {
    createTestUser().then(({ userId }) => {
      cy.request({
        method: 'POST',
        url: '/api/auth/login',
        body: { email: `nao-existe-${userId}@example.com`, password: 'errada' },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(401)
      })
    })
  })

  it('usuário comum não consegue criar outro usuário (403)', () => {
    createTestUser().then(({ token }) => {
      cy.request({
        method: 'POST',
        url: '/api/admin/users',
        headers: authHeaders(token),
        body: { email: uniqueEmail(), password: TEST_PASSWORD },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(403)
      })
    })
  })

  it('admin consegue criar usuário com prazo de acesso e ele expira corretamente', () => {
    loginAsAdmin().then((adminToken) => {
      const email = uniqueEmail()
      cy.request({
        method: 'POST',
        url: '/api/admin/users',
        headers: authHeaders(adminToken),
        body: { email, password: TEST_PASSWORD, diasValidade: 5 },
      }).then((res) => {
        expect(res.status).to.eq(201)
        expect(res.body.accessExpiresAt).to.be.a('string')
        const expiresAt = new Date(res.body.accessExpiresAt).getTime()
        const fiveDaysFromNow = Date.now() + 5 * 24 * 60 * 60 * 1000
        expect(Math.abs(expiresAt - fiveDaysFromNow)).to.be.lessThan(60_000)
      })
    })
  })
})

describe('API — fluxo completo de usuário e item monitorado', () => {
  let token: string
  let otherToken: string
  let itemId: string
  let matchId: string

  it('cria dois usuários (um para teste de ownership)', () => {
    createTestUser().then((u) => {
      token = u.token
    })
    createTestUser().then((u) => {
      otherToken = u.token
    })
  })

  it('rejeita item monitorado sem keywords/catmat/catser', () => {
    cy.then(() =>
      cy.request({
        method: 'POST',
        url: '/api/monitored-items',
        headers: authHeaders(token),
        body: { name: 'Item vazio' },
        failOnStatusCode: false,
      })
    ).then((res) => {
      expect(res.status).to.eq(400)
    })
  })

  it('cria um item monitorado com a keyword "notebook"', () => {
    cy.then(() =>
      cy.request({
        method: 'POST',
        url: '/api/monitored-items',
        headers: authHeaders(token),
        body: { name: 'Notebooks para o escritório', keywords: ['notebook'] },
      })
    ).then((res) => {
      expect(res.status).to.eq(201)
      expect(res.body.name).to.eq('Notebooks para o escritório')
      expect(res.body.keywords).to.deep.equal(['notebook'])
      itemId = res.body.id
    })
  })

  it('lista os itens monitorados do usuário', () => {
    cy.then(() => cy.request({ url: '/api/monitored-items', headers: authHeaders(token) })).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body).to.be.an('array')
      expect(res.body.map((i: { id: string }) => i.id)).to.include(itemId)
    })
  })

  it('busca o item monitorado por id', () => {
    cy.then(() => cy.request({ url: `/api/monitored-items/${itemId}`, headers: authHeaders(token) })).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.id).to.eq(itemId)
    })
  })

  it('atualiza o item monitorado', () => {
    cy.then(() =>
      cy.request({
        method: 'PATCH',
        url: `/api/monitored-items/${itemId}`,
        headers: authHeaders(token),
        body: { name: 'Notebooks e periféricos' },
      })
    ).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.name).to.eq('Notebooks e periféricos')
    })
  })

  it('outro usuário não consegue editar o item (403)', () => {
    cy.then(() =>
      cy.request({
        method: 'PATCH',
        url: `/api/monitored-items/${itemId}`,
        headers: authHeaders(otherToken),
        body: { name: 'Hackeado' },
        failOnStatusCode: false,
      })
    ).then((res) => {
      expect(res.status).to.eq(403)
    })
  })

  it('roda o rematch e encontra licitações já coletadas', () => {
    cy.then(() =>
      cy.request({ method: 'POST', url: `/api/monitored-items/${itemId}/rematch`, headers: authHeaders(token) })
    ).then((res) => {
      expect(res.status).to.eq(200)
      // A base já tem licitações reais do PNCP contendo "notebook" no objeto
      expect(res.body.matchesFound).to.be.greaterThan(0)
    })
  })

  it('lista os matches do usuário e encontra o match recém-criado', () => {
    cy.then(() => cy.request({ url: '/api/matches', headers: authHeaders(token) })).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.items).to.be.an('array')
      expect(res.body.total).to.be.greaterThan(0)
      const match = res.body.items.find((m: { monitoredItemId: string }) => m.monitoredItemId === itemId)
      expect(match, 'match do item recém-criado deve aparecer no feed').to.exist
      expect(match.tender).to.have.property('objeto')
      matchId = match.id
    })
  })

  it('marca o match como lido', () => {
    cy.then(() =>
      cy.request({ method: 'PATCH', url: `/api/matches/${matchId}`, headers: authHeaders(token), body: { read: true } })
    ).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.read).to.eq(true)
    })
  })

  it('feed de matches não-lidos não inclui mais esse match', () => {
    cy.then(() => cy.request({ url: '/api/matches?unreadOnly=true', headers: authHeaders(token) })).then((res) => {
      const ids = res.body.items.map((m: { id: string }) => m.id)
      expect(ids).to.not.include(matchId)
    })
  })

  it('outro usuário não consegue deletar o item (403)', () => {
    cy.then(() =>
      cy.request({
        method: 'DELETE',
        url: `/api/monitored-items/${itemId}`,
        headers: authHeaders(otherToken),
        failOnStatusCode: false,
      })
    ).then((res) => {
      expect(res.status).to.eq(403)
    })
  })

  it('deleta o item monitorado', () => {
    cy.then(() =>
      cy.request({ method: 'DELETE', url: `/api/monitored-items/${itemId}`, headers: authHeaders(token) })
    ).then((res) => {
      expect(res.status).to.eq(204)
    })
  })

  it('item deletado não é mais encontrado', () => {
    cy.then(() =>
      cy.request({ url: `/api/monitored-items/${itemId}`, headers: authHeaders(token), failOnStatusCode: false })
    ).then((res) => {
      expect(res.status).to.eq(404)
    })
  })
})

describe('API — feed público de licitações', () => {
  let token: string

  it('setup: cria usuário', () => {
    createTestUser().then((u) => {
      token = u.token
    })
  })

  it('lista licitações paginadas', () => {
    cy.then(() => cy.request({ url: '/api/tenders?page=1&pageSize=5', headers: authHeaders(token) })).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.items).to.have.length(5)
      expect(res.body.total).to.be.greaterThan(0)
    })
  })

  it('filtra por UF', () => {
    cy.then(() =>
      cy.request({ url: '/api/tenders?uf=SP&page=1&pageSize=10', headers: authHeaders(token) })
    ).then((res) => {
      expect(res.status).to.eq(200)
      res.body.items.forEach((t: { uf: string }) => expect(t.uf).to.eq('SP'))
    })
  })

  it('busca uma licitação específica com seus itens', () => {
    cy.then(() => cy.request({ url: '/api/tenders?page=1&pageSize=1', headers: authHeaders(token) })).then((listRes) => {
      const id = listRes.body.items[0].id
      cy.request({ url: `/api/tenders/${id}`, headers: authHeaders(token) }).then((res) => {
        expect(res.status).to.eq(200)
        expect(res.body.id).to.eq(id)
        expect(res.body).to.have.property('items')
      })
    })
  })

  it('404 para licitação inexistente', () => {
    cy.then(() =>
      cy.request({
        url: '/api/tenders/00000000-0000-0000-0000-000000000000',
        headers: authHeaders(token),
        failOnStatusCode: false,
      })
    ).then((res) => {
      expect(res.status).to.eq(404)
    })
  })
})

describe('API — checklist de habilitação por licitação', () => {
  let token: string
  let tenderId: string

  it('setup: cria usuário', () => {
    createTestUser().then((u) => {
      token = u.token
    })
  })

  it('setup: pega uma licitação real', () => {
    cy.then(() => cy.request({ url: '/api/tenders?page=1&pageSize=1', headers: authHeaders(token) })).then((res) => {
      tenderId = res.body.items[0].id
    })
  })

  it('rejeita sem token (401)', () => {
    cy.then(() =>
      cy.request({ url: `/api/tenders/${tenderId}/checklist`, failOnStatusCode: false })
    ).then((res) => {
      expect(res.status).to.eq(401)
    })
  })

  it('404 para licitação inexistente', () => {
    cy.then(() =>
      cy.request({
        url: '/api/tenders/00000000-0000-0000-0000-000000000000/checklist',
        headers: authHeaders(token),
        failOnStatusCode: false,
      })
    ).then((res) => {
      expect(res.status).to.eq(404)
    })
  })

  it('cria o checklist a partir do template na primeira consulta', () => {
    cy.then(() => cy.request({ url: `/api/tenders/${tenderId}/checklist`, headers: authHeaders(token) })).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.items).to.be.an('array').with.length.greaterThan(20)
      expect(res.body.items[0]).to.include.keys('id', 'section', 'label', 'checked', 'custom')
      expect(res.body.items.every((i: { checked: boolean }) => i.checked === false)).to.eq(true)
    })
  })

  it('não recria o checklist numa segunda consulta (mesmo id)', () => {
    let firstId: string
    cy.then(() => cy.request({ url: `/api/tenders/${tenderId}/checklist`, headers: authHeaders(token) }))
      .then((res) => {
        firstId = res.body.id
        return cy.request({ url: `/api/tenders/${tenderId}/checklist`, headers: authHeaders(token) })
      })
      .then((res) => {
        expect(res.body.id).to.eq(firstId)
      })
  })

  it('marca itens e adiciona um item customizado', () => {
    cy.then(() => cy.request({ url: `/api/tenders/${tenderId}/checklist`, headers: authHeaders(token) })).then((getRes) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = getRes.body.items.map((i: any, idx: number) => (idx === 0 ? { ...i, checked: true } : i))
      items.push({
        id: 'custom-1',
        section: 'Documentos Adicionais do Seu Edital',
        label: 'Certidão específica exigida neste edital',
        checked: false,
        custom: true,
      })
      return cy.request({ method: 'PUT', url: `/api/tenders/${tenderId}/checklist`, headers: authHeaders(token), body: { items } })
    }).then((putRes) => {
      expect(putRes.status).to.eq(200)
      expect(putRes.body.items).to.have.length.greaterThan(20)
      expect(putRes.body.items[0].checked).to.eq(true)
      const custom = putRes.body.items.find((i: { id: string }) => i.id === 'custom-1')
      expect(custom, 'item customizado deve estar salvo').to.exist
    })
  })

  it('reflete o estado salvo numa consulta seguinte', () => {
    cy.then(() => cy.request({ url: `/api/tenders/${tenderId}/checklist`, headers: authHeaders(token) })).then((res) => {
      expect(res.body.items[0].checked).to.eq(true)
      expect(res.body.items.some((i: { id: string }) => i.id === 'custom-1')).to.eq(true)
    })
  })
})

describe('API — filtro de raio de distância', () => {
  let token: string
  let itemId: string

  it('setup: cria usuário', () => {
    createTestUser().then((u) => {
      token = u.token
    })
  })

  it('rejeita raioKm sem cidade de referência', () => {
    cy.then(() =>
      cy.request({
        method: 'POST',
        url: '/api/monitored-items',
        headers: authHeaders(token),
        body: { name: 'Serviço local', keywords: ['limpeza'], raioKm: 100 },
        failOnStatusCode: false,
      })
    ).then((res) => {
      expect(res.status).to.eq(400)
    })
  })

  it('rejeita cidade de referência inexistente', () => {
    cy.then(() =>
      cy.request({
        method: 'POST',
        url: '/api/monitored-items',
        headers: authHeaders(token),
        body: {
          name: 'Serviço local',
          keywords: ['limpeza'],
          raioKm: 100,
          origemMunicipio: 'CidadeQueNaoExisteXYZ',
          origemUf: 'BA',
        },
        failOnStatusCode: false,
      })
    ).then((res) => {
      expect(res.status).to.eq(400)
    })
  })

  it('cria item com raio de distância e geocodifica a cidade de referência', () => {
    cy.then(() =>
      cy.request({
        method: 'POST',
        url: '/api/monitored-items',
        headers: authHeaders(token),
        body: {
          name: 'Serviço de limpeza local',
          keywords: ['limpeza'],
          raioKm: 150,
          origemMunicipio: 'Juazeiro',
          origemUf: 'BA',
        },
      })
    ).then((res) => {
      expect(res.status).to.eq(201)
      expect(res.body.raioKm).to.eq(150)
      expect(res.body.origemMunicipio).to.eq('Juazeiro')
      expect(res.body.origemUf).to.eq('BA')
      // A geocodificação deve ter preenchido lat/lng a partir da base do IBGE
      expect(res.body.origemLat).to.be.a('number')
      expect(res.body.origemLng).to.be.a('number')

      itemId = res.body.id

      // O rematch deve rodar sem erro respeitando o filtro de raio (não afirmamos
      // um número exato de matches — depende dos dados coletados no momento)
      cy.request({ method: 'POST', url: `/api/monitored-items/${itemId}/rematch`, headers: authHeaders(token) }).then(
        (rematchRes) => {
          expect(rematchRes.status).to.eq(200)
          expect(rematchRes.body).to.have.property('matchesFound')
        }
      )
    })
  })

  it('edita só o raio, mantendo a cidade de referência já cadastrada', () => {
    cy.then(() =>
      cy.request({ method: 'PATCH', url: `/api/monitored-items/${itemId}`, headers: authHeaders(token), body: { raioKm: 300 } })
    ).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.raioKm).to.eq(300)
      expect(res.body.origemMunicipio).to.eq('Juazeiro')
      expect(res.body.origemLat).to.be.a('number')
    })
  })

  it('remove o filtro de raio explicitamente (raioKm: null)', () => {
    cy.then(() =>
      cy.request({ method: 'PATCH', url: `/api/monitored-items/${itemId}`, headers: authHeaders(token), body: { raioKm: null } })
    ).then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body.raioKm).to.be.null
      expect(res.body.origemLat).to.be.null
      expect(res.body.origemLng).to.be.null
    })
  })
})

describe('API — filtro de modalidades', () => {
  let token: string

  it('setup: cria usuário', () => {
    createTestUser().then((u) => {
      token = u.token
    })
  })

  it('rejeita modalidade inválida', () => {
    cy.then(() =>
      cy.request({
        method: 'POST',
        url: '/api/monitored-items',
        headers: authHeaders(token),
        body: { name: 'Item', keywords: ['notebook'], modalidades: ['MODALIDADE_INVENTADA'] },
        failOnStatusCode: false,
      })
    ).then((res) => {
      expect(res.status).to.eq(400)
    })
  })

  it('encontra o match quando a modalidade do item bate com a da licitação', () => {
    cy.then(() =>
      cy.request({
        method: 'POST',
        url: '/api/monitored-items',
        headers: authHeaders(token),
        body: {
          name: 'Notebooks — só dispensa sem disputa',
          keywords: ['notebook'],
          modalidades: ['DISPENSA_SEM_DISPUTA'],
        },
      })
    )
      .then((res) => {
        const itemId = res.body.id
        return cy.request({ method: 'POST', url: `/api/monitored-items/${itemId}/rematch`, headers: authHeaders(token) })
      })
      .then((rematchRes) => {
        expect(rematchRes.status).to.eq(200)
        expect(rematchRes.body.matchesFound).to.be.greaterThan(0)
      })
  })

  it('não encontra o match quando a modalidade do item não bate com a da licitação', () => {
    cy.then(() =>
      cy.request({
        method: 'POST',
        url: '/api/monitored-items',
        headers: authHeaders(token),
        body: {
          name: 'Notebooks — só concurso (não deve bater)',
          keywords: ['notebook'],
          modalidades: ['CONCURSO'],
        },
      })
    )
      .then((res) => {
        const itemId = res.body.id
        return cy.request({ method: 'POST', url: `/api/monitored-items/${itemId}/rematch`, headers: authHeaders(token) })
      })
      .then((rematchRes) => {
        expect(rematchRes.status).to.eq(200)
        expect(rematchRes.body.matchesFound).to.eq(0)
      })
  })
})
