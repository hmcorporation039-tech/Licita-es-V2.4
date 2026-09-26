import fs from 'fs'

const CODIGO_UF_TO_SIGLA = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA',
  '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS',
  '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
}

function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const raw = fs.readFileSync('C:/Users/LABORA~1/AppData/Local/Temp/municipios.csv', 'utf-8')
const lines = raw.trim().split('\n').slice(1) // skip header

const out = []
for (const line of lines) {
  // CSV simples: nome pode conter vírgula? Verificado: nomes de município não têm vírgula neste dataset.
  const [codigoIbge, nome, lat, lng, , codigoUf] = line.split(',')
  const uf = CODIGO_UF_TO_SIGLA[codigoUf]
  if (!uf) {
    console.error('UF desconhecida para codigo_uf', codigoUf, 'linha:', line)
    continue
  }
  out.push([codigoIbge, uf, normalize(nome), parseFloat(lat), parseFloat(lng)])
}

console.log('total municipios:', out.length)
fs.writeFileSync('./src/lib/municipiosBrasil.json', JSON.stringify(out))
console.log('salvo em src/lib/municipiosBrasil.json')
