// ============================================================
// scripts/ci/auditoria-de-dependencias.mjs — Gate de auditoria do CI.
//
// Faz o papel de `npm audit --omit=dev --audit-level=high`, mas com uma
// lista de exceções: um aviso cujo único conserto é uma troca de major
// (quebra tudo) não pode travar o merge do resto do time até a migração
// ser feita com calma. Cada exceção é explícita, tem motivo e vira item
// de backlog — ver docs/SEGURANCA_AUDITORIA_2026-10.md.
//
// Qualquer vulnerabilidade high/critical de produção que NÃO esteja na
// lista continua derrubando o CI, como antes.
// ============================================================

import { execSync } from 'node:child_process'

// GHSA liberado -> motivo. Revisar a cada atualização de dependência.
const EXCECOES = {
  'GHSA-mrhx-c7xc-m3w5':
    'zod <4.6.6 (DoS por coleção gigante). Conserto só no zod 4 (major, quebra todos os schemas). Backlog: migrar para zod 4; entrada validada atrás de auth + rate-limit + limite de corpo.',
}

function rodarAuditoria() {
  try {
    return execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (err) {
    // npm audit sai com código != 0 quando acha vulnerabilidade; o JSON vem no stdout mesmo assim.
    if (err.stdout) return err.stdout.toString()
    throw err
  }
}

function ghsasDaVulnerabilidade(vuln) {
  return (vuln.via || [])
    .filter((v) => typeof v === 'object' && typeof v.url === 'string')
    .map((v) => v.url.split('/').pop())
    .filter(Boolean)
}

const relatorio = JSON.parse(rodarAuditoria())
const vulnerabilidades = relatorio.vulnerabilities || {}

const bloqueios = []
const liberadas = []

for (const [nome, vuln] of Object.entries(vulnerabilidades)) {
  if (vuln.severity !== 'high' && vuln.severity !== 'critical') continue
  const ghsas = ghsasDaVulnerabilidade(vuln)
  const soLiberadas = ghsas.length > 0 && ghsas.every((g) => g in EXCECOES)
  if (soLiberadas) {
    liberadas.push(`${nome} (${vuln.severity}): ${ghsas.join(', ')}`)
  } else {
    bloqueios.push(`${nome} (${vuln.severity}): ${ghsas.join(', ') || vuln.range}`)
  }
}

for (const l of liberadas) console.log(`[auditoria] ignorado por exceção: ${l}`)

if (bloqueios.length > 0) {
  console.error('\n[auditoria] vulnerabilidades graves de produção sem exceção:')
  for (const b of bloqueios) console.error(`  - ${b}`)
  console.error('\nCorrija as dependências (npm audit) ou registre a exceção com motivo em scripts/ci/auditoria-de-dependencias.mjs.')
  process.exit(1)
}

console.log(`[auditoria] OK — nenhuma vulnerabilidade high/critical de produção fora da lista de exceções (${Object.keys(EXCECOES).length}).`)
