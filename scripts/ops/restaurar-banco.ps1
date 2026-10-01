<#
.SYNOPSIS
  Restaura um backup (.dump do backup-banco.ps1) num banco PostgreSQL.

.DESCRIPTION
  PADRÃO SEGURO: restaura em um banco LOCAL (localhost/127.0.0.1), por exemplo para
  conferir o backup ou recuperar dados. Restaurar em um banco REMOTO (a produção)
  exige -Producao e a frase de confirmação, e antes disso o script tira sozinho um
  backup do destino ("antes-da-restauracao"), para a restauração também ter volta.

  A restauração usa uma única transação (pg_restore -1): se qualquer comando falhar,
  NADA é alterado no destino.

.PARAMETER Arquivo       Caminho do .dump a restaurar.
.PARAMETER DestinoUrl    URL do banco de destino: postgresql://usuario:senha@host:porta/banco
.PARAMETER Substituir    Apaga e recria os objetos existentes no destino (pg_restore --clean).
                         Necessário ao restaurar sobre um banco que já tem dados.
.PARAMETER Producao      Permite destino remoto. Exige também -Confirmacao.
.PARAMETER Confirmacao   Digite exatamente: RESTAURAR PRODUCAO

.EXAMPLE
  # Conferir o backup num banco local descartável:
  restaurar-banco.ps1 -Arquivo C:\Licitações\Backups-Banco\railway_2026-10-01_1925.dump `
     -DestinoUrl postgresql://postgres@127.0.0.1:5432/teste_restauracao

.EXAMPLE
  # Recuperar a produção (só em emergência):
  restaurar-banco.ps1 -Arquivo ...\railway_....dump -DestinoUrl $env:BACKUP_DATABASE_URL `
     -Substituir -Producao -Confirmacao 'RESTAURAR PRODUCAO'
#>
param(
  [Parameter(Mandatory = $true)][string]$Arquivo,
  [Parameter(Mandatory = $true)][string]$DestinoUrl,
  [switch]$Substituir,
  [switch]$Producao,
  [string]$Confirmacao = ''
)

$ErrorActionPreference = 'Stop'

function Separar-Url([string]$url) {
  if ($url -notmatch '^postgres(?:ql)?://([^:@/]+)(?::([^@]*))?@([^:/]+)(?::(\d+))?/([^?]+)') {
    throw 'A URL do banco não está no formato postgresql://usuario:senha@host:porta/banco'
  }
  [pscustomobject]@{
    Usuario = [uri]::UnescapeDataString($Matches[1])
    Senha   = if ($Matches[2]) { [uri]::UnescapeDataString($Matches[2]) } else { '' }
    Host    = $Matches[3]
    Porta   = if ($Matches[4]) { $Matches[4] } else { '5432' }
    Banco   = $Matches[5]
  }
}

function Achar-Ferramenta([string]$nome) {
  $cmd = Get-Command $nome -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  # Procura nas versões instaladas, da mais nova para a mais antiga. (Curinga no meio do
  # caminho + -Filter não expande no PowerShell 5.1, por isso listamos as pastas.)
  $raiz = 'C:\Program Files\PostgreSQL'
  if (Test-Path -LiteralPath $raiz) {
    foreach ($v in (Get-ChildItem -LiteralPath $raiz -Directory | Sort-Object { [int]($_.Name -replace '\D', '0') } -Descending)) {
      $c = Join-Path $v.FullName "bin\$nome.exe"
      if (Test-Path -LiteralPath $c) { return $c }
    }
  }
  throw "$nome não encontrado. Instale o cliente do PostgreSQL."
}

if (-not (Test-Path -LiteralPath $Arquivo)) { throw "Arquivo não encontrado: $Arquivo" }
$d = Separar-Url $DestinoUrl
$pgRestore = Achar-Ferramenta 'pg_restore'
$psql = Achar-Ferramenta 'psql'
$ehLocal = $d.Host -in @('localhost', '127.0.0.1', '::1')

# ---- Trava de segurança para destino remoto (produção) ----
if (-not $ehLocal) {
  if (-not $Producao) {
    throw "O destino '$($d.Host)' é REMOTO. Para restaurar em produção use -Producao -Confirmacao 'RESTAURAR PRODUCAO'. Para só conferir o backup, restaure num banco local."
  }
  if ($Confirmacao -ne 'RESTAURAR PRODUCAO') {
    throw "Confirmação incorreta. Digite exatamente: -Confirmacao 'RESTAURAR PRODUCAO'"
  }
  Write-Host 'Destino REMOTO confirmado. Tirando um backup do destino antes de restaurar...'
  $env:BACKUP_DATABASE_URL = $DestinoUrl
  & (Join-Path $PSScriptRoot 'backup-banco.ps1') -Rotulo 'antes-da-restauracao' | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível tirar o backup de segurança do destino. Restauração cancelada.' }
}

Write-Host "Restaurando '$Arquivo' em $($d.Host):$($d.Porta)/$($d.Banco) ..."
$env:PGPASSWORD = $d.Senha
$env:PGCONNECT_TIMEOUT = '30'
try {
  $args = @('-h', $d.Host, '-p', $d.Porta, '-U', $d.Usuario, '-d', $d.Banco, '--no-owner', '--no-privileges', '--no-password', '-1')
  if ($Substituir) { $args += @('--clean', '--if-exists') }
  $args += $Arquivo
  & $pgRestore @args
  if ($LASTEXITCODE -ne 0) { throw "pg_restore falhou (código $LASTEXITCODE). Nada foi alterado no destino (transação única)." }

  $consulta = "select 'usuarios='||(select count(*) from users)||' empresas='||(select count(*) from companies)||' licitacoes='||(select count(*) from tenders)||' monitorados='||(select count(*) from monitored_items)||' migrations='||(select count(*) from _prisma_migrations)"
  $resumo = & $psql -h $d.Host -p $d.Porta -U $d.Usuario -d $d.Banco -X -tA -c $consulta
  Write-Host "Restauração concluída. Conferência: $resumo"
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:\BACKUP_DATABASE_URL -ErrorAction SilentlyContinue
}
