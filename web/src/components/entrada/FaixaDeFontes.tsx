import PausarLetreiro from './PausarLetreiro'
import { fontesNaFaixa, plataformasNaFaixa } from '@/lib/fontes'

interface FonteOficial {
  nome: string
  descricao: string
  logo?: { src: string; largura: number; altura: number; alturaNaFaixa: number }
  comNome?: boolean
}

export const FONTES_OFICIAIS: FonteOficial[] = [
  { nome: 'PNCP', descricao: 'Portal Nacional de Contratações Públicas', logo: { src: '/fontes/pncp.svg', largura: 154, altura: 152, alturaNaFaixa: 30 }, comNome: true },
  { nome: 'SESC', descricao: 'Serviço Social do Comércio', logo: { src: '/fontes/sesc.png', largura: 99, altura: 50, alturaNaFaixa: 30 } },
  { nome: 'SENAI', descricao: 'Serviço Nacional de Aprendizagem Industrial', logo: { src: '/fontes/senai.svg', largura: 136, altura: 36, alturaNaFaixa: 28 } },
  { nome: 'SESI', descricao: 'Serviço Social da Indústria', logo: { src: '/fontes/sesi.svg', largura: 97, altura: 36, alturaNaFaixa: 28 } },
  { nome: 'SENAC', descricao: 'Serviço Nacional de Aprendizagem Comercial', logo: { src: '/fontes/senac.png', largura: 153, altura: 90, alturaNaFaixa: 32 } },
  { nome: 'SEST SENAT', descricao: 'Serviço Social do Transporte e Serviço Nacional de Aprendizagem do Transporte', logo: { src: '/fontes/sest-senat.svg', largura: 299, altura: 56, alturaNaFaixa: 26 } },
  { nome: 'Querido Diário', descricao: 'Diários oficiais dos municípios', logo: { src: '/fontes/querido-diario.svg', largura: 119, altura: 36, alturaNaFaixa: 30 } },
  { nome: 'Novacap', descricao: 'Companhia Urbanizadora da Nova Capital, Brasília/DF' },
  { nome: 'FIEG', descricao: 'Federação das Indústrias do Estado de Goiás' },
  { nome: 'Infraero', descricao: 'Empresa Brasileira de Infraestrutura Aeroportuária' },
  { nome: 'Diários municipais', descricao: 'Diários oficiais das associações de municípios (SIGPub)' },
  { nome: 'TCE-CE', descricao: 'Portal de Licitações dos Municípios do Ceará' },
  { nome: 'TCE-PI', descricao: 'Mural de Licitações do Tribunal de Contas do Piauí' },
  { nome: 'TCE-TO', descricao: 'SICAP-LCO, licitações dos municípios do Tocantins' },
  { nome: 'TCE-RS', descricao: 'LicitaCon, dados abertos do Tribunal de Contas do Rio Grande do Sul' },
  { nome: 'FAMEM', descricao: 'Diário Oficial dos Municípios do Maranhão (FAMEM)' },
]

const ID_DO_LETREIRO = 'letreiro-das-fontes'

function Marca({ fonte }: { fonte: FonteOficial }) {
  if (!fonte.logo) {
    return (
      <span className="az-letreiro-texto" title={fonte.descricao}>
        {fonte.nome}
      </span>
    )
  }
  const { src, largura, altura, alturaNaFaixa } = fonte.logo
  return (
    <span className="az-letreiro-marca" title={fonte.descricao}>
      <img src={src} alt={`Logo do ${fonte.nome}`} width={Math.round((largura * alturaNaFaixa) / altura)} height={alturaNaFaixa} decoding="async" className="az-letreiro-logo" />
      {fonte.comNome && (
        <span aria-hidden className="az-letreiro-texto">
          {fonte.nome}
        </span>
      )}
    </span>
  )
}

const numeroBr = (valor: number) => valor.toLocaleString('pt-BR')

function Letreiro({ fontes }: { fontes: FonteOficial[] }) {
  const total = fontes.length
  return (
    <div id={ID_DO_LETREIRO} className="az-letreiro">
      <ul className="az-letreiro-trilho">
        {[...fontes, ...fontes].map((fonte, i) => (
          <li key={`${fonte.nome}-${i}`} aria-hidden={i >= total || undefined} className={i >= total ? 'az-letreiro-copia' : undefined}>
            <Marca fonte={fonte} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function FaixaDeFontes({
  marcas,
  plataformas,
  principaisPlataformas,
}: {
  marcas?: string[] | null
  plataformas?: number | null
  principaisPlataformas?: string[] | null
}) {
  const doPncp = plataformasNaFaixa(plataformas, principaisPlataformas)
  const fontes = doPncp ? fontesNaFaixa(FONTES_OFICIAIS.filter((f) => f.nome !== 'PNCP'), marcas) : fontesNaFaixa(FONTES_OFICIAIS, marcas)
  return (
    <section aria-labelledby="fontes-titulo" className="az-fontes az-escuro">
      <div className="az-conteiner az-fontes-topo">
        <div>
          <h2 id="fontes-titulo">Fontes oficiais que a Licita Bela acompanha</h2>
          <p>Todo dia a Licita Bela lê estes portais e junta tudo numa lista só, pelo prazo mais próximo.</p>
        </div>
        <PausarLetreiro alvo={ID_DO_LETREIRO} />
      </div>
      {doPncp && (
        <div className="az-conteiner az-fontes-pncp">
          <p>
            Licitações publicadas no <b>PNCP</b> por <b>{numeroBr(doPncp.total)} {doPncp.total === 1 ? 'portal ou sistema de compras' : 'portais e sistemas de compras'}</b>
            {doPncp.nomes.length > 0 ? `, como ${doPncp.nomes.join(', ')}…` : '.'}
          </p>
          <p className="az-fontes-proprias">+ fontes próprias:</p>
        </div>
      )}
      <Letreiro fontes={fontes} />
      <p className="az-conteiner az-fontes-aviso">
        {doPncp
          ? 'Logotipos das fontes públicas de dados acompanhadas pela Licita Bela. Os portais citados são os sistemas de origem que o próprio PNCP informa em cada licitação: a Licita Bela lê essas licitações no PNCP e não tem integração direta nem vínculo com esses portais ou com os órgãos.'
          : 'Logotipos das fontes públicas de dados acompanhadas pela Licita Bela. A Licita Bela não tem vínculo com esses órgãos.'}
      </p>
    </section>
  )
}
