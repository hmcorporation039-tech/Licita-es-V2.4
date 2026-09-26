import Link from 'next/link'

const PLATAFORMAS = [
  {
    nome: 'PNCP — Portal Nacional de Contratações Públicas',
    site: 'https://www.gov.br/pncp',
    cadastro: 'Não é necessário cadastro de fornecedor para consultar — a consulta é pública e gratuita.',
    lei: 'Lei nº 14.133/2021 (art. 174) — portal oficial de centralização e publicidade.',
    obs: 'Portal centralizador — não é onde a disputa acontece, só onde tudo é publicado (inclusive processos de estatais).',
  },
  {
    nome: 'Compras.gov.br (antigo Comprasnet) — Governo Federal',
    site: 'https://www.gov.br/compras',
    cadastro: 'Cadastro no SICAF, online pelo portal ou app, com CNPJ, contrato social e certidões.',
    lei: 'Lei nº 14.133/2021 para administração direta, autarquias e fundações federais.',
    obs: 'Desde nov/2025 também aceita dispensas de estatais federais sob a Lei nº 13.303/2016 — as duas leis convivem no mesmo portal.',
  },
  {
    nome: 'Licitações-e — Banco do Brasil',
    site: 'https://licitacoes-e2.bb.com.br',
    cadastro: 'Pré-cadastro online + comparecimento presencial a uma agência com contrato social, CNPJ e docs dos sócios.',
    lei: 'Lei nº 13.303/2016 combinada com o Regulamento próprio do BB, quando o BB compra para si mesmo.',
    obs: 'Também hospeda licitações de terceiros (prefeituras) — nesses casos vale a 14.133, não a 13.303.',
  },
  {
    nome: 'Licitações Caixa — Caixa Econômica Federal',
    site: 'https://www.licitacoes.caixa.gov.br',
    cadastro: 'Pré-cadastro no site + etapa presencial na agência mais próxima.',
    lei: 'Lei nº 13.303/2016 combinada com o Regulamento próprio da Caixa, quando compra para si mesma.',
    obs: 'Valores-limite de dispensa definidos pelo regulamento interno, diferentes da Lei 14.133/2021.',
  },
  {
    nome: 'BLL Compras — Bolsa de Licitações e Leilões',
    site: 'https://bll.org.br',
    cadastro: 'Cadastro gratuito e 100% online, com contrato social, CNPJ e docs dos representantes.',
    lei: 'Lei nº 14.133/2021 na grande maioria dos casos — contratada por prefeituras, câmaras e autarquias.',
    obs: 'Exceção: sociedade de economia mista municipal/estadual usando a BLL segue a Lei 13.303/2016 naquele processo.',
  },
  {
    nome: 'Licitanet',
    site: 'https://licitanet.com.br',
    cadastro: 'Cadastro online clicando em "Aderir"/"Fornecedor", com dados da empresa e segmentos de interesse.',
    lei: 'Lei nº 14.133/2021 — usada principalmente por municípios e órgãos estaduais.',
    obs: 'Cadastro pago, com planos conforme a forma de participação escolhida.',
  },
  {
    nome: 'BNC — Bolsa Nacional de Compras',
    site: 'https://bnc.org.br',
    cadastro: 'Cadastro gratuito pelo site (opção "Cadastro"), com Termo de Adesão assinado, contrato social e procuração.',
    lei: 'Lei nº 14.133/2021 — usada principalmente por prefeituras e órgãos municipais/estaduais.',
    obs: 'Cadastro gratuito, mas participar de pregões exige plano de cobrança.',
  },
  {
    nome: 'Portal de Compras Públicas',
    site: 'https://www.portaldecompraspublicas.com.br',
    cadastro: 'Cadastro online (CPF ou CNPJ), com envio de documentos de habilitação para validação.',
    lei: 'Lei nº 14.133/2021 — atende principalmente prefeituras, secretarias estaduais e consórcios públicos.',
    obs: 'Também compatível com entidades do terceiro setor, com regras próprias conforme o convênio.',
  },
]

const DISPENSA_PASSOS = [
  {
    titulo: '1. Acessar o portal do Comprasnet',
    texto: 'cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras',
  },
  {
    titulo: '2. Definir os parâmetros de pesquisa',
    texto: 'Situação: Em andamento · Etapa: Abertas para participação · Modalidade: Dispensa',
  },
  {
    titulo: '3. Analisar o resultado da pesquisa',
    texto:
      'Desconsiderar: propostas com prazo superior a 30/60 dias, datas anteriores à atual, eventos pendentes de publicação, compras revogadas ou suspensas.',
  },
  {
    titulo: '4. Consultar o objeto da compra',
    texto: 'Buscar por palavras-chave do seu ramo; usar "Mostrar detalhes da compra" para ver a descrição completa.',
  },
  {
    titulo: '5. Consultar os itens da compra',
    texto: 'Pelo ícone "Acompanhar Compra": itens, quantidade, valor estimado unitário e descrição detalhada.',
  },
  {
    titulo: '6. Consultar a documentação da contratação',
    texto:
      'Em "Documentos e demais informações da contratação no PNCP" → "Arquivos", localizar o Aviso de Contratação Direta e verificar valor, data da sessão, SRP, prazo de entrega, condições de pagamento e exigências técnicas.',
  },
]

const ERROS_COMUNS = [
  {
    titulo: 'Atestado técnico incompleto',
    texto: 'Atestados sem CNPJ do contratante ou sem contato para verificação são frequentemente rejeitados.',
  },
  {
    titulo: 'Planilha de custos incompatível',
    texto: 'Encargos sociais fora da convenção coletiva da categoria podem tornar a proposta inexequível aos olhos do pregoeiro.',
  },
  {
    titulo: 'Preço muito abaixo do estimado',
    texto: 'Propostas muito baixas sem justificativa técnica podem ser desclassificadas por presunção de inexequibilidade.',
  },
  {
    titulo: 'Benefícios ME/EPP',
    texto:
      'Empresas ME/EPP têm prioridade em empate ficto (até 5% acima da melhor proposta) e, em muitos casos, exclusividade até R$ 80 mil — confirme o enquadramento antes da estratégia.',
  },
]

export default function GuiaPage() {
  return (
    <div className="flex flex-col gap-10 pb-10">
      <section>
        <h1 className="text-xl font-semibold">Guia prático</h1>
        <p className="mt-1 text-sm text-slate-500">
          Baseado no checklist de documentação para licitações públicas (Lei nº 14.133/2021). Consulte o
          checklist interativo dentro de cada <Link href="/tenders" className="text-indigo-700 hover:underline">licitação</Link>.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Pontos de atenção — erros comuns</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ERROS_COMUNS.map((e) => (
            <div key={e.titulo} className="rounded border border-amber-300 bg-amber-50 p-4">
              <p className="font-medium text-amber-900">⚠ {e.titulo}</p>
              <p className="mt-1 text-sm text-amber-800">{e.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Como consultar dispensas eletrônicas no Comprasnet</h2>
        <ol className="flex flex-col gap-3">
          {DISPENSA_PASSOS.map((p) => (
            <li key={p.titulo} className="rounded border border-slate-200 bg-white p-4">
              <p className="font-medium">{p.titulo}</p>
              <p className="mt-1 text-sm text-slate-600">{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Principais plataformas de licitação</h2>
        <p className="mb-3 text-sm text-slate-500">
          A lei aplicável depende de quem compra, não da plataforma: órgãos da administração direta seguem a
          Lei 14.133/2021; estatais (Banco do Brasil, Caixa, Correios) seguem a Lei 13.303/2016 quando compram
          para si mesmas.
        </p>
        <div className="flex flex-col gap-3">
          {PLATAFORMAS.map((p) => (
            <div key={p.nome} className="rounded border border-slate-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{p.nome}</p>
                <a href={p.site} target="_blank" className="text-sm text-indigo-700 hover:underline">
                  {p.site.replace('https://', '')}
                </a>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-medium">Cadastro:</span> {p.cadastro}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-medium">Base legal:</span> {p.lei}
              </p>
              <p className="mt-1 text-sm text-slate-400">{p.obs}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
