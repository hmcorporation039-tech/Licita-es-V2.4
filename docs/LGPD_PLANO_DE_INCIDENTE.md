# Plano de resposta a incidente de segurança com dados pessoais

Base: LGPD, art. 48, e Resolução CD/ANPD 15/2024. Versão de 21/10/2026.

## Quem faz o quê

| Papel | Pessoa | Contato |
|---|---|---|
| Responsável pela resposta e encarregado | Márcio Henrique | suporte@licitabela.com.br |
| Decisão pela empresa | Sócios da H&M Engenharia e Tecnologia LTDA | — |
| Apoio jurídico | Advogado da empresa | a definir |

## O que é incidente

Qualquer acesso não autorizado, vazamento, perda, alteração ou destruição de dados pessoais. Exemplos:

- conta de cliente acessada por outra pessoa;
- dados de uma empresa aparecendo para outra;
- chave de API, senha do banco ou arquivo de backup exposto;
- PC dos backups perdido ou furtado;
- fornecedor (Railway, Vercel, Resend, Upstash) avisando de incidente.

## Passo a passo

### 1. Conter (na primeira hora)
- Anotar data, hora e como o problema foi descoberto.
- Cortar o acesso indevido:
  - revogar as sessões da conta afetada (troca de senha invalida todas);
  - desativar a conta pelo admin, se for o caso;
  - tirar a funcionalidade do ar.
- Trocar o que pode ter vazado: `JWT_SECRET` (desloga todo mundo), senha do banco no Railway, chaves do Resend, Anthropic, Google e Upstash.
- Não apagar logs nem dados: eles são a prova.

### 2. Avaliar (até 24 horas)
- Quais dados foram atingidos, de quantas empresas e pessoas, desde quando.
- Usar a trilha de auditoria (`audit_logs`) e os logs do Railway e da Vercel.
- **Há risco ou dano relevante aos titulares?** Sinais:
  - dados sensíveis, financeiros (dados bancários), documentos de identificação, CPF ou senhas;
  - muitos titulares;
  - possibilidade de fraude ou dano à reputação.

### 3. Comunicar (até 3 dias úteis do conhecimento, se houver risco ou dano relevante)
- **ANPD:** formulário de comunicação de incidente no site da ANPD (gov.br/anpd).
- **Titulares:** e-mail a cada pessoa afetada, em linguagem simples, com:
  - o que aconteceu e quando;
  - quais dados foram atingidos;
  - o que já fizemos;
  - o que a pessoa deve fazer (trocar senha, atenção a golpes);
  - o contato do encarregado.
- Se o incidente veio de um fornecedor, guardar o aviso dele como prova.

### 4. Corrigir e registrar
- Corrigir a causa: código, configuração ou fornecedor.
- Registrar o incidente na tabela abaixo, **mesmo que não tenha sido comunicado** (a resolução exige o registro por 5 anos).
- Revisar este plano e o registro das operações.

## Modelo de aviso ao cliente

> **Assunto:** Aviso de segurança sobre a sua conta na Licita Bela
>
> Olá, [nome]. Em [data], identificamos [o que aconteceu, em uma frase]. Os dados envolvidos foram [lista]. Já [o que fizemos]. Recomendamos que você [o que fazer]. Se tiver dúvidas, fale com o nosso encarregado de dados pelo e-mail suporte@licitabela.com.br. Pedimos desculpas pelo transtorno.
>
> Equipe Licita Bela · H&M Engenharia e Tecnologia LTDA

## Registro de incidentes

| Data | O que aconteceu | Dados e titulares | Risco relevante? | Comunicado à ANPD e titulares? | Medidas |
|---|---|---|---|---|---|
| — | Nenhum incidente até 21/10/2026 | — | — | — | — |
