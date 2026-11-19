// npm run extensao:pacote → dist/bela-na-disputa-<versão>.zip, pronto para a Chrome Web Store.
// Antes de gerar, confere o que a loja recusaria (descrição longa, localhost, arquivo faltando).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { montarPacote } from './lib/pacoteDaExtensao'

const raiz = join(__dirname, '..')
const { zip, versao, arquivos } = montarPacote(join(raiz, 'extensao-bela'))
mkdirSync(join(raiz, 'dist'), { recursive: true })
const destino = join(raiz, 'dist', `bela-na-disputa-${versao}.zip`)
writeFileSync(destino, zip)
console.log(`Pacote da extensão ${versao}: ${arquivos.length} arquivos, ${Math.round(zip.length / 1024)} KB`)
console.log(destino)
