import Image from 'next/image'
import Link from 'next/link'
import { useId, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import NavegacaoPublica from '@/components/NavegacaoPublica'

export interface DestaqueDoPainel {
  texto: ReactNode
  detalhe?: ReactNode
}

const FALA_PADRAO = 'Estou aqui para te ajudar a achar as licitações certas.'

function Anel({ classe }: { classe: string }) {
  return <span aria-hidden className={`pb-anel ${classe}`} />
}

function PainelDaBela({ fala, destaques }: { fala: ReactNode; destaques?: DestaqueDoPainel[] }) {
  return (
    <aside className="pb-painel" aria-label="Recado da Bela, assistente da Licita Bela">
      <Anel classe="pb-anel-a" />
      <Anel classe="pb-anel-b" />
      <figure className="pb-bela">
        <Image
          src="/bela/bela-640.webp"
          alt=""
          width={640}
          height={605}
          sizes="(min-width: 1024px) 460px, 64px"
          loading="eager"
          className="pb-bela-foto"
        />
      </figure>
      <p className="pb-fala">
        <span className="pb-fala-autora">Bela</span>
        <span className="pb-fala-texto">{fala}</span>
      </p>
      {destaques && destaques.length > 0 && (
        <ul className="pb-destaques">
          {destaques.map((d, i) => (
            <li key={i} className="pb-destaque">
              <span className="pb-destaque-icone" aria-hidden>
                <Check size={14} strokeWidth={3.5} />
              </span>
              <span>
                {d.texto}
                {d.detalhe && <span className="pb-destaque-detalhe"> {d.detalhe}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

export function PublicCard({
  title,
  description,
  children,
  fala = FALA_PADRAO,
  destaques,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  fala?: ReactNode
  destaques?: DestaqueDoPainel[]
}) {
  const tituloId = useId()
  return (
    <div className="pb-acesso">
      <PainelDaBela fala={fala} destaques={destaques} />
      <section className="pb-cartao" aria-labelledby={tituloId}>
        <div className="pb-cartao-cabeca">
          <h1 id={tituloId} className="pb-titulo">
            {title}
          </h1>
          {description && <div className="pb-descricao">{description}</div>}
        </div>
        <div className="pb-cartao-corpo">{children}</div>
      </section>
    </div>
  )
}

export function PublicProse({ titulo, rotulo, children }: { titulo: ReactNode; rotulo?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="pb-faixa">
        <Anel classe="pb-anel-a" />
        <div className="pb-conteiner">
          <div className="pb-faixa-conteudo">
            {rotulo && <p className="pb-faixa-rotulo">{rotulo}</p>}
            <h1>{titulo}</h1>
          </div>
        </div>
      </div>
      <article className="pb-documento">{children}</article>
    </>
  )
}

export function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#conteudo" className="pb-pular">
        Pular para o conteúdo
      </a>
      <header className="pb-topo">
        <div className="pb-conteiner pb-topo-linha">
          <Link href="/" className="pb-marca" aria-label="Licita Bela, página inicial">
            Licita <span>Bela</span>
          </Link>
          <NavegacaoPublica />
        </div>
      </header>
      <main id="conteudo" className="pb-principal">
        {children}
      </main>
      <footer className="pb-rodape">
        <div className="pb-conteiner pb-rodape-grade">
          <p className="pb-marca">
            Licita <span>Bela</span>
          </p>
          <p>© Licita Bela · H&amp;M Engenharia e Tecnologia LTDA · CNPJ 04.003.376/0001-00 · Brasília/DF</p>
          <nav aria-label="Documentos legais" className="pb-rodape-links">
            <Link href="/termos">Termos de Uso</Link>
            <Link href="/privacidade">Política de Privacidade</Link>
          </nav>
        </div>
      </footer>
    </>
  )
}
