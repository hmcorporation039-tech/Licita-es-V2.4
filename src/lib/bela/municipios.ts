import municipiosData from '../municipiosBrasil.json'

type LinhaDoMunicipio = [string, string, string, number, number]

const ufsPorNome = new Map<string, string[]>()

function registrar(nome: string, uf: string) {
  const ufs = ufsPorNome.get(nome)
  if (!ufs) ufsPorNome.set(nome, [uf])
  else if (!ufs.includes(uf)) ufs.push(uf)
}

for (const [, uf, bruto] of municipiosData as LinhaDoMunicipio[]) {
  const nome = bruto.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
  registrar(nome, uf)
  if (/[-’']/.test(nome)) registrar(nome.replace(/-/g, ' ').replace(/’/g, "'"), uf)
}

export const MAX_PALAVRAS_NO_NOME_DE_MUNICIPIO = Math.max(...[...ufsPorNome.keys()].map((n) => n.split(' ').length))

export function ufsDoMunicipio(nomeNormalizado: string): string[] {
  return ufsPorNome.get(nomeNormalizado.replace(/’/g, "'")) ?? []
}
