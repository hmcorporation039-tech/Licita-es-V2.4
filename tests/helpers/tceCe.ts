import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PASTA_DO_TCE_CE = join(__dirname, '..', 'fixtures', 'tce-ce')

export function paginaDoTceCe(nome: string): string {
  return readFileSync(join(PASTA_DO_TCE_CE, nome), 'utf8')
}

export interface LinhaFalsa {
  idProcesso: number
  idLicitacao: number
  numero?: string
  municipio?: string
  objeto?: string
  publicado?: string
  abertura?: string
  reabertura?: string
  valor?: string
}

export function listaFalsa(linhas: LinhaFalsa[], ultimaPagina = 3): string {
  const corpo = linhas
    .map(
      (l) => `<tr>
        <td><a href="/index.php/licitacao/detalhes/proc/${l.idProcesso}/licit/${l.idLicitacao}">${l.numero ?? `${l.idLicitacao}/2026`}</a></td>
        <td>${l.municipio ?? 'FORTALEZA'}</td>
        <td>${l.objeto ?? `Aquisição número ${l.idLicitacao}`}</td>
        <td>${l.publicado ?? '10/10/2026'}</td>
        <td>${l.abertura ?? '05/11/2026'}<br /></td>
        <td>${l.reabertura ?? ''}<br /></td>
        <td><p style="white-space: nowrap; margin: 0">${l.valor ?? '1.000,00'}</p></td>
      </tr>`
    )
    .join('\n')
  return `<html><body>
    <table id="table" class="table tableLicitacoes"><thead><tr><th>Licitação</th></tr></thead><tbody>${corpo}</tbody></table>
    <nav><ul class="pagination">
      <li><a href="/index.php/licitacao/abertas/page/1/mun/000">1</a></li>
      <li><a href="/index.php/licitacao/abertas/page/${ultimaPagina}/mun/000">Última Página</a></li>
    </ul></nav>
  </body></html>`
}

export function erroHttp(status: number | undefined): Error {
  return Object.assign(new Error(status ? `HTTP ${status}` : 'socket hang up'), {
    isAxiosError: true,
    ...(status ? { response: { status } } : { code: 'ECONNRESET' }),
  })
}
