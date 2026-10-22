# Meus Portais, automação e lance automático — desenho antes do código

Funcionalidade pedida pelo sócio (modelo Effecti). Márcio autorizou em 22/10, com
o advogado, guardar as credenciais dos portais **no servidor** — isto **supera** a
regra antiga de "senha nunca no servidor" do `docs/ROBO_DE_PREGAO.md`, só para a
parte de credenciais. As demais regras do robô continuam valendo (confirmação de
lance quando couber, nunca burlar CAPTCHA, respeitar vedação do edital).

Este documento é o projeto da parte sensível. A parte de documentos (habilitação)
está em `docs/MEUS_DOCUMENTOS.md`.

## Princípio de segurança (inegociável)

Guardar senha de portal de cliente é o maior risco do sistema, ainda mais depois do
incidente do Railway (21/10). O desenho assume que **o banco pode vazar** e mesmo
assim as senhas não podem abrir.

- **Cifragem com chave fora do banco.** AES-256-GCM. A chave-mestra fica em
  variável de ambiente isolada (`CREDENCIAIS_PORTAL_CHAVE`), nunca no banco, nunca
  em log, nunca no cliente. Vazar só o banco não abre nada.
- **Chave rotacionável.** Suporte a duas chaves (atual + anterior) para trocar sem
  derrubar: ao ler com a anterior, regrava com a atual.
- **Nunca em texto puro em lugar nenhum:** nem em log, nem em resposta de API, nem
  em mensagem de erro. A API devolve só metadados (portal, login mascarado, status,
  último teste), nunca a senha.
- **Decifra só no momento do uso**, em memória, e descarta. A senha não transita
  para o navegador.
- **Consentimento LGPD** explícito por portal (texto + versão + data), revogável; ao
  revogar, a credencial é apagada.
- **Auditoria** de tudo que a Bela faz no portal (ver `audit_logs`): entrar, navegar,
  lance, erro — com data, hora, portal e licitação.
- **Isolamento por empresa**: uma empresa nunca lê credencial de outra (todas as
  consultas filtram por `companyId`, como o resto do sistema).

## 1. Cofre de credenciais ("Meus Portais")

### Banco (migration aditiva, escrita à mão)
```
model PortalCredencial {
  id             String   @id @default(uuid())
  companyId      String   @map("company_id")
  portal         String            // 'COMPRASNET' | 'PCP' | 'BLL' | 'LICITACOES_E' | ...
  login          String            // identificador do cliente no portal (não é segredo)
  senhaCifrada   Bytes    @map("senha_cifrada")   // AES-256-GCM: iv || tag || ciphertext
  chaveVersao    Int      @map("chave_versao") @default(1)
  consentimentoEm   DateTime? @map("consentimento_em")
  consentimentoTexto String? @map("consentimento_texto")
  ultimoTesteEm  DateTime? @map("ultimo_teste_em")
  ultimoTesteOk  Boolean?  @map("ultimo_teste_ok")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  company        Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  @@unique([companyId, portal])
  @@map("portal_credenciais")
}
```

### Serviço de cifragem (`src/services/cofreDeCredenciais.ts`)
- `cifrar(texto)` / `decifrar(blob, versao)` com AES-256-GCM, chave de
  `CREDENCIAIS_PORTAL_CHAVE` (e `CREDENCIAIS_PORTAL_CHAVE_ANTERIOR` para rotação).
- Nunca registra o texto; erros não incluem o conteúdo.

### API (`src/api/routes/meusPortais.ts`, atrás de `requireAuth`)
- `GET /` lista as credenciais da empresa (sem a senha: portal, login mascarado,
  status, último teste).
- `POST /` cadastra/atualiza (portal, login, senha, aceite do termo) — cifra e grava;
  exige `consentimentoEm`.
- `POST /:id/testar` tenta um login de validação e grava `ultimoTesteOk`.
- `DELETE /:id` apaga (e revoga o consentimento).
- Rate limit próprio; auditoria em toda escrita.

## 2. Atuação da Bela no portal

- Um **adaptador por portal** (`src/services/portais/<portal>.ts`) com uma interface
  comum: `entrar(credencial)`, `acharLicitacao(...)`, `lerMelhorLance(...)`,
  `darLance(valor)`. Começar por 1 portal (o mais usado pelos clientes) e crescer.
- **Matriz de capacidade por portal**: cada adaptador declara se o portal permite
  automação e se tem CAPTCHA/2FA no login. Onde **tem CAPTCHA ou veta robô**, a Bela
  **não** tenta logar sozinha: ela avisa e sugere o lance, e o cliente confirma
  (fallback manual — exatamente o que o spec pede).
- Toda ação vai para `audit_logs` (portal, licitação, ação, hora).
- Execução: processo/worker dedicado, isolado, com timeout e limite de tentativas.

## 3. Lance automático com piso

- Config por licitação (reaproveita `pregao_acompanhamentos`): `intervaloEntreLancesSeg`,
  `pisoDoLance` (valor mínimo aceitável), `automatico` (on/off).
- Motor de lance (puro, testável): dado melhor lance atual, piso, intervalo e
  decremento → decide o próximo lance **nunca abaixo do piso**. Ao chegar no piso,
  **trava**, não dá mais lance e avisa.
- **Pausa/cancela a qualquer momento** pelo cliente.
- Respeita o intervalo mínimo do portal e a `vedacaoARobo` do edital (já detectada).
- Onde o portal não permite automação: só sugere, cliente confirma.
- Tudo auditado; o cliente recebe aviso ao travar no piso e ao encerrar.

## Ordem de construção (segura)

1. **Parte 4 — Meus Documentos** (sem risco; começa já). Ver `docs/MEUS_DOCUMENTOS.md`.
2. **Cofre de credenciais** (modelo + cifragem + API + termo LGPD + testar/excluir),
   com **revisão de segurança** antes de ir a produção. Sem automação ainda.
3. **1 adaptador de portal** + leitura da disputa (read-only) para validar login e
   leitura, com o cliente acompanhando.
4. **Lance automático com piso**, primeiro com confirmação, depois automático com a
   trava do piso, respeitando a matriz de capacidade e a vedação do edital.

## Verificação

- Cifragem: testes de ida e volta, rotação de chave, e de que a senha nunca aparece
  em log/resposta/erro.
- Motor de lance: testes do piso (nunca abaixo), trava, intervalo, pausa.
- Adaptador de portal: testado contra o portal real com o cliente (não dá para
  testar sem conta real).
- Revisão de segurança (a skill `security-review`) antes de cada ida a produção.
