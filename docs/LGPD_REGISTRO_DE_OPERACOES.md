# Registro das operações de tratamento de dados pessoais (LGPD, art. 37)

- **Controladora:** H&M Engenharia e Tecnologia LTDA, CNPJ 04.003.376/0001-00, Brasília/DF.
- **Produto:** Licita Bela (www.licitabela.com.br).
- **Encarregado:** Márcio Henrique, suporte@licitabela.com.br.
- **Versão:** 21/10/2026. Revisar a cada mudança que crie, altere ou elimine um tratamento, e no mínimo a cada 6 meses.

## 1. Titulares

| Titular | Quem é |
|---|---|
| Usuário dono | Pessoa que cria a conta em nome da empresa |
| Usuário convidado | Colaborador convidado pelo dono |
| Responsável legal | Pessoa indicada pela empresa cliente para assinar propostas e declarações |
| Pessoas nos documentos do cofre | Sócios, responsáveis técnicos e outras pessoas citadas nas certidões e atestados enviados pelo cliente |
| Fornecedor vencedor pessoa física | Pessoa física que venceu item de licitação publicada no PNCP |
| Visitante do site | Quem acessa a página de vendas ou o cadastro |

## 2. Operações

| # | Operação | Dados pessoais | Finalidade | Base legal (art. 7) | Onde fica | Operadores | Prazo de guarda |
|---|---|---|---|---|---|---|---|
| 1 | Cadastro e login | Nome, e-mail, hash da senha, CPF ou CNPJ, telefone opcional, data e versão do aceite | Criar e manter a conta, autenticar | Execução de contrato (V) | Postgres (Railway) | Railway | Enquanto a conta existir; até 15 dias após pedido de exclusão |
| 2 | Confirmação de e-mail e recuperação de senha | E-mail, hash do código ou do token | Provar o controle do e-mail, recuperar acesso | Execução de contrato (V) | Postgres; envio pelo Resend | Railway, Resend | Código 15 min; link 60 min; convite 72 h |
| 3 | Dados da empresa | Endereço, e-mail e telefone da empresa, nome, CPF e cargo do responsável legal, dados bancários, logomarca | Preencher propostas e declarações | Execução de contrato (V) | Postgres | Railway | Enquanto a conta existir |
| 4 | Cofre de documentos | Arquivos PDF/JPG/PNG enviados pelo cliente (podem conter dados de sócios e responsáveis técnicos), nome, tipo e validade | Organizar a habilitação e avisar vencimentos | Execução de contrato (V) | Postgres (bytea) | Railway | Enquanto a conta existir |
| 5 | Uso da plataforma | Itens monitorados, matches, licitações escolhidas, estudos de custos, planos de disputa e lances, notificações, uso de IA | Prestar o serviço | Execução de contrato (V) | Postgres; filas no Upstash | Railway, Upstash | Enquanto a conta existir |
| 6 | Avisos por e-mail | E-mail, nome, licitações do cliente | Resumo diário, lembrete de prazo, documento vencendo, licitação alterada, acesso encerrado | Execução de contrato (V) | Resend | Resend | Registro do envio enquanto a conta existir |
| 7 | Segurança e auditoria | Id e e-mail de quem agiu, empresa, ação, IP, navegador, data | Prevenir fraude, investigar incidentes, cumprir o Marco Civil | Obrigação legal (II) e legítimo interesse (IX) | Postgres | Railway | Mínimo de 6 meses; anonimizado após 5 anos ou na exclusão da conta |
| 8 | Prevenção de abuso no cadastro | CPF/CNPJ (um teste por documento), IP (limite de tentativas e verificação anti-robô) | Impedir testes repetidos e cadastro automatizado | Legítimo interesse (IX) | Postgres; memória do servidor; Cloudflare quando ativado | Railway, Cloudflare | Enquanto a conta existir; IP do limitador por 15 min |
| 9 | Origem do cadastro | Parâmetros UTM, termo e UF pesquisados na página inicial | Medir de onde vêm os clientes e criar o primeiro item monitorado | Legítimo interesse (IX) | Postgres; armazenamento local do navegador | Railway | Enquanto a conta existir |
| 10 | Consulta de CEP | CEP digitado | Preencher o endereço | Execução de contrato (V) | Não é guardado pela consulta | ViaCEP, BrasilAPI | Sem guarda |
| 11 | Análise de edital por IA | Nenhum dado do cliente. Só o texto público do edital | Resumo do edital | Não se aplica (dado público, sem dado do cliente) | Postgres | Anthropic, Google | Enquanto a licitação existir; o texto guardado para a conversa é apagado 30 dias após o encerramento |
| 12 | Voz da Bela | Áudio falado pelo usuário | Transformar a fala em texto no pregão | Execução de contrato (V) | Não é guardado pela Licita Bela; processado pelo navegador | Google, quando o navegador é o Chrome | Sem guarda pela Licita Bela |
| 13 | Resultado de licitações | Nome, CNPJ e porte do vencedor; CPF mascarado quando pessoa física | Mostrar resultado e preços vencedores | Legítimo interesse (IX) sobre dado tornado público pelo órgão (art. 7, § 4º) | Postgres | Railway | Enquanto a licitação existir |
| 14 | Backups do banco | Tudo o que está no banco | Recuperar dados após falha | Legítimo interesse (IX) e segurança (art. 46) | PC do Márcio, disco C: criptografado com BitLocker | — | Até 90 dias; os mais antigos vão para a lixeira a cada backup novo |
| 15 | Sessão no navegador | Token de sessão, id, e-mail e nome do usuário, preferência de voz, UTM | Manter o usuário conectado | Execução de contrato (V) | Armazenamento local do navegador do usuário | — | Até sair da conta ou limpar o navegador; sessão vale 7 dias |
| 16 | Pedidos de titular | E-mail, empresa, motivo | Atender acesso, correção, exclusão e portabilidade | Obrigação legal (II) | Postgres; alerta ao administrador | Railway, Resend | Registro do pedido anonimizado após a exclusão |
| 17 | Notificações no celular | Endereço de entrega do navegador, chaves de criptografia da inscrição, tipo de aparelho, preferências por aviso | Avisar sobre licitações novas, prazos e alterações quando o usuário ativa no aparelho | Execução de contrato (V) | Postgres; serviço de push do navegador | Railway; Google, Apple, Mozilla ou Microsoft (push do navegador) | Até desativar, sair da conta no aparelho, 5 falhas seguidas ou recusa do serviço de push |
| 18 | Conversa com o edital | Pergunta digitada pelo usuário, resposta da IA, autor e data | Responder dúvidas sobre os documentos da licitação, com a página citada | Execução de contrato (V) | Postgres (só a empresa do usuário vê) | Railway; Google (Gemini recebe o texto do edital e a pergunta) | Enquanto a conta existir; apagada com a exclusão da empresa e incluída na exportação de dados |
| 19 | Chamados de suporte | Relato e mensagens, tipo, autor, última tela, navegador, horário, versão e códigos dos erros recentes | Atender o cliente e corrigir falhas | Execução de contrato (V) | Postgres (o cliente vê os próprios; o dono vê os da empresa; o admin vê todos, com auditoria) | Railway; Resend (aviso da resposta por e-mail) | Até 1 ano depois de resolvido; apagado com a exclusão da empresa e incluído na exportação de dados |
| 20 | Registro de erros do sistema | Mensagem e local do erro, rota sem consulta, navegador, código de rastreio, usuário e empresa | Segurança e correção de falhas | Legítimo interesse (IX) | Postgres (só o admin) | Railway | 30 dias; usuário e empresa desligados na exclusão |

## 3. Operadores e transferência internacional

| Operador | O que recebe | País | Instrumento |
|---|---|---|---|
| Railway | Banco de dados e servidores | EUA | Termos e DPA do fornecedor (aceitar e arquivar) |
| Vercel | Hospedagem do site, logs de acesso | EUA | Termos e DPA do fornecedor (aceitar e arquivar) |
| Upstash | Filas de tarefas | EUA/UE | Termos e DPA do fornecedor (aceitar e arquivar) |
| Resend | E-mail, nome e conteúdo dos avisos | EUA | Termos e DPA do fornecedor (aceitar e arquivar) |
| Cloudflare | IP na verificação anti-robô, quando ativada | Global | Termos e DPA do fornecedor (aceitar e arquivar) |
| Anthropic | Texto público de editais | EUA | Termos comerciais da API (sem dado pessoal do cliente) |
| Google | Texto público de editais e perguntas da conversa com o edital; áudio da voz quando o navegador é o Chrome | Global | Termos da API Gemini; política do navegador |
| ViaCEP, BrasilAPI | CEP | Brasil | Serviço público, sem dado identificador |
| Serviços de push (Google FCM, Apple, Mozilla, Microsoft) | Endereço de entrega e mensagem criptografada de ponta a ponta (o serviço não lê o conteúdo) | Global | Termos do navegador; só quando o usuário ativa |
| Asaas (quando ligar a cobrança) | Dados de pagamento e do pagador | Brasil | Contrato do intermediador |

**Pendente:** confirmar com o advogado se os DPAs dos fornecedores atendem à Resolução CD/ANPD 19/2024 (cláusulas-padrão contratuais) ou se é preciso aditivo.

## 4. Medidas de segurança (art. 46)

- Senhas com bcrypt (custo 10), mínimo de 10 caracteres, login em tempo constante.
- Confirmação de e-mail obrigatória; códigos e tokens guardados só como hash.
- Sessão JWT de 7 dias, revogável no logout, na troca de senha e na desativação.
- Limite de tentativas por IP e por conta; e-mails descartáveis recusados.
- HTTPS com HSTS, CSP, X-Frame-Options DENY e Referrer-Policy no-referrer.
- Isolamento por empresa em toda consulta, coberto por testes de integração.
- Trilha de auditoria de ações sensíveis e de toda consulta do administrador aos dados de uma empresa.
- Backups no disco criptografado com BitLocker (conferido em 21/10/2026), em pasta acessível só à conta do Márcio, ao SISTEMA e aos administradores (conferido em 21/10/2026), com guarda de até 90 dias.
- Acesso ao banco de produção só pelo arquivo de credencial local, sem leitura do conteúdo pelo assistente de código.

## 5. Direitos do titular: como são atendidos

| Direito | Como |
|---|---|
| Confirmação e acesso | Menu Conta › baixar meus dados; o restante pelo e-mail do encarregado |
| Correção | Menus Conta e Empresa |
| Exclusão | Dono: menu Conta › pedir exclusão (até 15 dias). Convidado: menu Conta › excluir meus dados. Demais titulares: e-mail do encarregado |
| Portabilidade | Exportação em JSON; arquivos do cofre pelo e-mail do encarregado |
| Oposição a avisos | Preferências de e-mail, link de descadastro em cada aviso e preferências de notificação no celular (menu Conta) |
| Informação sobre compartilhamento | Política de Privacidade, seção 3 |

**Prazo interno de resposta:** 15 dias corridos a partir do pedido.
