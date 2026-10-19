import type { CSSProperties, ReactNode } from 'react'
import { Check, FileText, FolderLock, Gavel, LayoutList, Mic, Star, TriangleAlert, Building2 } from 'lucide-react'
import NumeroQueSobe from './NumeroQueSobe'

export function atraso(ms: number): CSSProperties {
  return { '--atraso': `${ms}ms` } as CSSProperties
}

export function MolduraDeCelular({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`az-celular ${className ?? ''}`}>
      <div className="az-celular-tela">{children}</div>
    </div>
  )
}

export function MolduraDeNotebook({ children, endereco }: { children: ReactNode; endereco: string }) {
  return (
    <div className="az-notebook">
      <div className="az-notebook-tampa">
        <div className="az-notebook-barra">
          <span className="az-notebook-luzes" />
          <span className="az-notebook-endereco">{endereco}</span>
        </div>
        <div className="az-notebook-tela">{children}</div>
      </div>
      <div className="az-notebook-base" />
    </div>
  )
}

function Ilustrativo({ children, legenda }: { children: ReactNode; legenda: string }) {
  return (
    <figure className="az-previa">
      <div aria-hidden className="az-previa-palco">
        {children}
      </div>
      <figcaption className="az-previa-legenda">
        <span className="az-selo-ilustrativo">Exemplo ilustrativo</span>
        {legenda}
      </figcaption>
    </figure>
  )
}

const LATERAL: Array<{ nome: string; icone: typeof LayoutList }> = [
  { nome: 'Licitações', icone: LayoutList },
  { nome: 'Escolhidas', icone: Star },
  { nome: 'Pregão com a Bela', icone: Gavel },
  { nome: 'Documentos', icone: FolderLock },
  { nome: 'Empresa', icone: Building2 },
]

function Lateral({ ativo }: { ativo: string }) {
  return (
    <div className="az-app-lateral">
      <span className="az-app-marca">
        Licita <span>Bela</span>
      </span>
      {LATERAL.map(({ nome, icone: Icone }) => (
        <span key={nome} className={nome === ativo ? 'az-app-lateral-ativo' : undefined}>
          <Icone size={13} strokeWidth={2.25} />
          {nome}
        </span>
      ))}
    </div>
  )
}

const FALA_DA_BELA = '“Bela, licitação de estrutura metálica no DF”'
const ATRASO_POR_PALAVRA_MS = 80
const INICIO_DA_FALA_MS = 400
const FIM_DA_FALA_MS = INICIO_DA_FALA_MS + FALA_DA_BELA.split(' ').length * ATRASO_POR_PALAVRA_MS

const RESULTADOS_DA_BELA = [
  { prazo: 'encerra amanhã', urgente: true, objeto: 'Estrutura metálica para cobertura de quadra', orgao: 'Órgão distrital · Brasília/DF', fonte: 'PNCP' },
  { prazo: 'encerra em 4 dias', urgente: false, objeto: 'Galpão em estrutura metálica para depósito', orgao: 'Empresa pública · Brasília/DF', fonte: 'Novacap' },
  { prazo: 'encerra em 12 dias', urgente: false, objeto: 'Manutenção de estruturas e serralheria', orgao: 'Sistema S · Taguatinga/DF', fonte: 'Sistema S' },
]

export function PreviaEncontrar() {
  return (
    <Ilustrativo legenda="Busca falada com a Bela, no celular.">
      <MolduraDeCelular className="az-celular-tour">
        <div className="az-app-celular">
          <div className="az-app-celular-topo">
            <small>Falar com a Bela</small>
            <strong>Diga o que procura</strong>
          </div>
          <div className="az-app-celular-corpo">
            <div className="az-fala">
              <span className="revela-pop az-fala-microfone" style={atraso(150)}>
                <Mic size={16} strokeWidth={2.5} />
              </span>
              <p>
                {FALA_DA_BELA.split(' ').map((palavra, i) => (
                  <span key={i} className="revela-palavra" style={atraso(INICIO_DA_FALA_MS + i * ATRASO_POR_PALAVRA_MS)}>
                    {palavra}{' '}
                  </span>
                ))}
              </p>
            </div>
            <div className="az-entendi">
              <span className="revela-palavra" style={atraso(FIM_DA_FALA_MS)}>
                Entendi:
              </span>
              {['estrutura metálica', 'DF', 'abertas'].map((tag, i) => (
                <span key={tag} className="revela-pop az-chip-app" style={atraso(FIM_DA_FALA_MS + 120 + i * 110)}>
                  {tag}
                </span>
              ))}
            </div>
            <ul className="az-app-cartoes">
              {RESULTADOS_DA_BELA.map((r, i) => (
                <li key={r.objeto} className="revela az-app-cartao" style={atraso(FIM_DA_FALA_MS + 500 + i * 160)}>
                  <b>{r.objeto}</b>
                  <span>{r.orgao}</span>
                  <span className="az-app-cartao-rodape">
                    <em className={r.urgente ? 'az-prazo az-prazo-danger' : 'az-prazo az-prazo-warn'}>{r.prazo}</em>
                    <span className="az-fonte-tag">{r.fonte}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </MolduraDeCelular>
    </Ilustrativo>
  )
}

export function PreviaAnalisar() {
  return (
    <Ilustrativo legenda="Resumo do edital e alerta de cláusula, no computador.">
      <MolduraDeNotebook endereco="Licita Bela · Resumo do edital">
        <div className="az-app-notebook">
          <Lateral ativo="Escolhidas" />
          <div className="az-app-principal">
            <div className="az-app-cabecalho revela">
              <small>Pregão eletrônico · Estrutura metálica para cobertura</small>
              <strong>Resumo do edital</strong>
            </div>
            <dl className="az-app-indicadores">
              <div className="revela" style={atraso(120)}>
                <dt>Valor estimado</dt>
                <dd>R$ 412.600,00</dd>
              </div>
              <div className="revela" style={atraso(200)}>
                <dt>Sessão pública</dt>
                <dd>em 9 dias úteis</dd>
              </div>
              <div className="revela" style={atraso(280)}>
                <dt>Habilitação</dt>
                <dd>7 de 9 no cofre</dd>
                <span className="az-app-barra">
                  <span className="revela-traco" style={atraso(700)} />
                </span>
              </div>
            </dl>
            <p className="revela az-app-exigencias" style={atraso(360)}>
              <b>Exigências principais:</b> atestado de capacidade técnica, registro no CREA, balanço patrimonial.
            </p>
            <div className="revela-direita az-app-alerta" style={atraso(600)}>
              <div className="az-app-alerta-topo">
                <TriangleAlert size={16} strokeWidth={2.5} />
                <b>Atestado com 80% da quantidade</b>
                <span className="revela-pop az-chip-alta" style={atraso(1150)}>
                  Alta
                </span>
              </div>
              <p>O edital pede atestado de 80% do quantitativo. A lei admite exigir até 50%.</p>
              <div className="az-app-alerta-rodape">
                <span>Lei 14.133/2021, art. 67, §2º</span>
                <span className="revela az-app-botao" style={atraso(1400)}>
                  Gerar impugnação
                </span>
              </div>
            </div>
          </div>
        </div>
      </MolduraDeNotebook>
    </Ilustrativo>
  )
}

const CUSTOS = [
  { rotulo: 'Material e fabricação', valor: 'R$ 2.180,00' },
  { rotulo: 'Frete', valor: 'R$ 96,40' },
  { rotulo: 'Impostos estimados', valor: 'R$ 344,25' },
  { rotulo: 'Custo por unidade', valor: 'R$ 2.620,65', destaque: true },
  { rotulo: 'Preço mínimo (margem 15%)', valor: 'R$ 3.083,12' },
  { rotulo: 'Preço proposto · margem 22,5%', valor: 'R$ 3.380,00', destaque: true },
]

const DOCUMENTOS = ['Proposta comercial', 'Declarações do edital', 'Pedido de impugnação']
const TRACOS_DA_PAGINA = ['74%', '100%', '100%', '86%', '100%', '62%']

export function PreviaPreparar() {
  return (
    <Ilustrativo legenda="Estudo de custos e documentos no papel timbrado.">
      <MolduraDeNotebook endereco="Licita Bela · Estudo de custos">
        <div className="az-app-notebook">
          <Lateral ativo="Documentos" />
          <div className="az-app-principal az-app-duas-colunas">
            <div className="az-app-bloco revela">
              <div className="az-app-cabecalho">
                <small>Item 1 · preço por unidade</small>
                <strong>Estudo de custos</strong>
              </div>
              <dl className="az-app-custos">
                {CUSTOS.map((c, i) => (
                  <div key={c.rotulo} className={`revela ${c.destaque ? 'az-app-custo-destaque' : ''}`} style={atraso(150 + i * 80)}>
                    <dt>{c.rotulo}</dt>
                    <dd>{c.valor}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="az-app-bloco revela" style={atraso(250)}>
              <div className="az-app-cabecalho">
                <small>No papel timbrado da sua empresa</small>
                <strong>Documentos prontos</strong>
              </div>
              <div className="az-app-documentos">
                <div className="revela-pagina az-folha" style={atraso(500)}>
                  <span className="az-folha-timbre">
                    <span className="revela-pop" style={atraso(900)} />
                    <span>
                      <b>SUA EMPRESA LTDA</b>
                      <small>CNPJ 00.000.000/0001-00</small>
                    </span>
                  </span>
                  {TRACOS_DA_PAGINA.map((largura, i) => (
                    <span key={i} className="revela-traco az-folha-linha" style={{ ...atraso(1000 + i * 110), width: largura }} />
                  ))}
                </div>
                <ul>
                  {DOCUMENTOS.map((d, i) => (
                    <li key={d} className="revela" style={atraso(700 + i * 160)}>
                      <FileText size={13} strokeWidth={2.25} />
                      <span>{d}</span>
                      <em>PDF</em>
                      <em>DOCX</em>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </MolduraDeNotebook>
    </Ilustrativo>
  )
}

export function PreviaDisputar() {
  return (
    <Ilustrativo legenda="Pregão com a Bela, no celular.">
      <MolduraDeCelular className="az-celular-tour">
        <div className="az-app-celular">
          <div className="az-app-celular-topo">
            <small>Item 1 · estrutura metálica</small>
            <strong>Pregão com a Bela</strong>
            <span className="az-app-disputa">Disputa aberta</span>
          </div>
          <div className="az-app-celular-corpo">
            <div className="revela az-margem">
              <small>Margem dentro do desejado</small>
              <NumeroQueSobe valor={15.4} casas={1} sufixo="%" atrasoMs={250} className="az-margem-numero" />
              <span>margem no lance sugerido</span>
            </div>
            <dl className="az-lances">
              <div className="revela" style={atraso(200)}>
                <dt>Melhor lance</dt>
                <dd>R$ 3.112,00</dd>
              </div>
              <div className="revela" style={atraso(320)}>
                <dt>Seu mínimo</dt>
                <dd>R$ 3.083,12</dd>
              </div>
            </dl>
            <p className="revela az-sugestao" style={atraso(1200)}>
              Sugiro cobrir com <b>R$ 3.096,44</b>.
            </p>
            <span className="revela az-app-botao az-app-botao-cheio" style={atraso(1400)}>
              <Check size={14} strokeWidth={3} />
              Dei este lance
            </span>
            <p className="az-app-nota">A Bela sugere; quem dá o lance é você.</p>
            <span className="revela az-app-documento" style={atraso(1650)}>
              <FileText size={13} strokeWidth={2.25} />
              Proposta readequada
              <em>PDF</em>
            </span>
          </div>
        </div>
      </MolduraDeCelular>
    </Ilustrativo>
  )
}
