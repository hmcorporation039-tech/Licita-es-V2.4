import { ExternalLink, TriangleAlert } from 'lucide-react'
import { PageHeader, TextLink, cx } from '@/components/ui'

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

const DISPENSA_PASSOS: { titulo: string; texto: string; link?: string }[] = [
  {
    titulo: 'Acessar o portal do Comprasnet',
    texto: 'Área pública de compras do Comprasnet, sem login:',
    link: 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras',
  },
  {
    titulo: 'Definir os parâmetros de pesquisa',
    texto: 'Situação: Em andamento · Etapa: Abertas para participação · Modalidade: Dispensa',
  },
  {
    titulo: 'Analisar o resultado da pesquisa',
    texto:
      'Desconsiderar: propostas com prazo superior a 30/60 dias, datas anteriores à atual, eventos pendentes de publicação, compras revogadas ou suspensas.',
  },
  {
    titulo: 'Consultar o objeto da compra',
    texto: 'Buscar por palavras-chave do seu ramo; usar "Mostrar detalhes da compra" para ver a descrição completa.',
  },
  {
    titulo: 'Consultar os itens da compra',
    texto: 'Pelo ícone "Acompanhar Compra": itens, quantidade, valor estimado unitário e descrição detalhada.',
  },
  {
    titulo: 'Consultar a documentação da contratação',
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

function LinkExterno({ href, rotulo, className }: { href: string; rotulo: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        'inline-flex max-w-full items-center gap-1 self-start break-words font-mono text-accent underline decoration-accent-line underline-offset-[3px] hover:decoration-accent',
        className,
      )}
    >
      <span className="min-w-0 break-words">{rotulo}</span>
      <ExternalLink size={12} className="shrink-0" aria-hidden />
      <span className="sr-only"> (abre em nova aba)</span>
    </a>
  )
}

export default function GuiaPage() {
  return (
    <>
      <PageHeader
        title="Guia prático"
        description={
          <>
            Baseado no checklist de documentação para licitações públicas (Lei nº 14.133/2021). Consulte o checklist interativo dentro de cada{' '}
            <TextLink href="/tenders">licitação</TextLink>.
          </>
        }
      />

      <div className="flex max-w-prose flex-col gap-10 pb-10 text-base leading-relaxed text-ink-2">
        <section aria-labelledby="guia-erros" className="flex flex-col gap-3">
          <h2 id="guia-erros" className="text-lg font-semibold text-ink">
            Pontos de atenção — erros comuns
          </h2>
          <ul className="flex flex-col divide-y divide-line-soft rounded border border-line bg-surface">
            {ERROS_COMUNS.map((e) => (
              <li key={e.titulo} className="flex gap-3 px-4 py-3.5">
                <TriangleAlert size={16} strokeWidth={2} className="mt-1 shrink-0 text-warn" aria-hidden />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-semibold text-ink">{e.titulo}</p>
                  <p>{e.texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="guia-dispensas" className="flex flex-col gap-3">
          <h2 id="guia-dispensas" className="text-lg font-semibold text-ink">
            Como consultar dispensas eletrônicas no Comprasnet
          </h2>
          <ol className="flex flex-col divide-y divide-line-soft rounded border border-line bg-surface">
            {DISPENSA_PASSOS.map((p, i) => (
              <li key={p.titulo} className="flex gap-4 px-4 py-3.5">
                <span aria-hidden className="w-6 shrink-0 pt-px font-mono text-sm font-medium text-muted">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-semibold text-ink">
                    <span className="sr-only">{i + 1}. </span>
                    {p.titulo}
                  </p>
                  <p>{p.texto}</p>
                  {p.link && <LinkExterno href={p.link} rotulo={new URL(p.link).hostname} className="text-sm" />}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="guia-plataformas" className="flex flex-col gap-3">
          <h2 id="guia-plataformas" className="text-lg font-semibold text-ink">
            Principais plataformas de licitação
          </h2>
          <p>
            A lei aplicável depende de quem compra, não da plataforma: órgãos da administração direta seguem a Lei 14.133/2021; estatais (Banco do
            Brasil, Caixa, Correios) seguem a Lei 13.303/2016 quando compram para si mesmas.
          </p>
          <ul className="flex flex-col divide-y divide-line-soft rounded border border-line bg-surface">
            {PLATAFORMAS.map((p) => (
              <li key={p.nome} className="flex flex-col gap-2 px-4 py-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <h3 className="font-semibold text-ink">{p.nome}</h3>
                  <LinkExterno href={p.site} rotulo={p.site.replace('https://', '')} className="shrink-0 text-xs" />
                </div>
                <dl className="flex flex-col gap-1.5 text-sm">
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="shrink-0 text-xs font-medium text-muted sm:w-20 sm:pt-0.5">Cadastro</dt>
                    <dd>{p.cadastro}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="shrink-0 text-xs font-medium text-muted sm:w-20 sm:pt-0.5">Base legal</dt>
                    <dd>{p.lei}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="shrink-0 text-xs font-medium text-muted sm:w-20 sm:pt-0.5">Observação</dt>
                    <dd className="text-muted">{p.obs}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
