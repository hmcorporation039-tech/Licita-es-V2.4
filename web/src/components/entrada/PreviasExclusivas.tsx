import type { ReactNode } from 'react'
import { Check, KeyRound, MessageCircle, PencilLine, MapPin, Lock } from 'lucide-react'
import { atraso, MolduraDeNotebook } from './PreviasDoTour'

// Prévias das seções "Só na Licita Bela" da página de entrada. Tudo ilustrativo, com
// dados fictícios: empresas, valores e cidades inventados.

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

export function PreviaPortalNaBela() {
  return (
    <Ilustrativo legenda="O portal da licitação aberto dentro da Licita Bela, ao lado do painel da Bela.">
      <MolduraDeNotebook endereco="licitabela.com.br/pregao">
        <div className="az-pnb">
          <div className="az-pnb-portal">
            <div className="az-pnb-barra">
              <Lock size={10} strokeWidth={2.5} />
              licitanet.com.br
            </div>
            <div className="az-pnb-sala">
              <small>Sala de disputa · item 1</small>
              <div className="az-pnb-linha">
                <span>Melhor lance</span>
                <b>R$ 3.112,00</b>
              </div>
              <div className="revela az-pnb-campo" style={atraso(900)}>
                <span>Seu lance</span>
                <b>3.096,44</b>
              </div>
              <span className="az-pnb-enviar">Enviar lance</span>
            </div>
          </div>
          <div className="az-pnb-painel">
            <strong>Bela</strong>
            <div className="revela az-pnb-margem" style={atraso(300)}>
              <small>Margem</small>
              <b>15,4%</b>
            </div>
            <span className="revela az-pnb-botao" style={atraso(600)}>
              <PencilLine size={11} strokeWidth={2.5} />
              Preencher R$ 3.096,44
            </span>
            <span className="revela az-pnb-botao az-pnb-botao-claro" style={atraso(750)}>
              <KeyRound size={11} strokeWidth={2.5} />
              Preencher meu login
            </span>
            <p>Quem envia é você.</p>
          </div>
        </div>
      </MolduraDeNotebook>
    </Ilustrativo>
  )
}

const DOCUMENTOS: Array<{ nome: string; estado: 'ok' | 'renovar' | 'falta'; nota: string }> = [
  { nome: 'CND Federal', estado: 'ok', nota: 'vale até 12/03' },
  { nome: 'FGTS (CRF)', estado: 'renovar', nota: 'vence 2 dias antes da sessão' },
  { nome: 'Balanço patrimonial', estado: 'ok', nota: 'no cofre' },
  { nome: 'Atestado de capacidade técnica', estado: 'falta', nota: 'exigido no item 8.4' },
]

export function PreviaHabilitacao() {
  return (
    <Ilustrativo legenda="Os documentos exigidos no edital, conferidos com o cofre da empresa na data da sessão.">
      <div className="az-cartao-previa az-hab">
        <div className="az-hab-topo">
          <small>Pregão 45/2026 · sessão em 18/11</small>
          <strong>Habilitação</strong>
        </div>
        <ul>
          {DOCUMENTOS.map((d, i) => (
            <li key={d.nome} className={`revela az-hab-item az-hab-${d.estado}`} style={atraso(150 + i * 150)}>
              <span className="az-hab-ponto" />
              <span className="az-hab-nome">
                {d.nome}
                <small>{d.nota}</small>
              </span>
            </li>
          ))}
        </ul>
        <p className="revela az-hab-resumo" style={atraso(900)}>
          Falta <b>1 documento</b> e <b>1</b> precisa renovar antes da sessão.
        </p>
      </div>
    </Ilustrativo>
  )
}

const GANHADORES: Array<{ empresa: string; obra: string; valor: string; lugar: string }> = [
  { empresa: 'Construtora Exemplo Ltda', obra: 'Reforma de escola municipal', valor: 'R$ 1,2 mi', lugar: 'a 12 km da sua base' },
  { empresa: 'Obras Modelo S.A.', obra: 'Pavimentação de vias urbanas', valor: 'R$ 3,8 mi', lugar: 'a 35 km da sua base' },
]

export function PreviaObrasEGanhadores() {
  return (
    <Ilustrativo legenda="Contratos recém-assinados no PNCP, no seu nicho e perto de você. Empresas fictícias.">
      <div className="az-cartao-previa az-obras">
        <div className="az-hab-topo">
          <small>Seus nichos: elétrica, pintura</small>
          <strong>Obras e ganhadores</strong>
        </div>
        <ul>
          {GANHADORES.map((g, i) => (
            <li key={g.empresa} className="revela az-obra" style={atraso(150 + i * 220)}>
              <span className="az-obra-valor">{g.valor}</span>
              <strong>{g.obra}</strong>
              <span>Ganhou: {g.empresa}</span>
              <span className="az-obra-lugar">
                <MapPin size={11} strokeWidth={2.5} />
                {g.lugar}
              </span>
            </li>
          ))}
        </ul>
        <span className="revela az-app-botao az-app-botao-cheio" style={atraso(800)}>
          <MessageCircle size={14} strokeWidth={2.5} />
          Mensagem pronta para o ganhador
        </span>
        <p className="az-app-nota">
          <Check size={11} strokeWidth={3} /> E os prestadores mais bem avaliados perto da obra.
        </p>
      </div>
    </Ilustrativo>
  )
}
