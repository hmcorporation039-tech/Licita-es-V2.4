<#
.SYNOPSIS
  Backup completo do banco PostgreSQL (formato pg_dump -Fc), com verificação e rotação.

.DESCRIPTION
  Faz o backup pela URL pública do banco (TCP Proxy do Railway), confere que o arquivo
  é legível (pg_restore -l), e mantém só os N mais recentes. Nunca altera o banco.

  A URL de conexão NÃO fica no repositório. Defina de uma destas formas:
    1) variável de ambiente  BACKUP_DATABASE_URL
    2) arquivo  scripts\ops\.env.backup  (ignorado pelo git) com a linha:
         BACKUP_DATABASE_URL=postgresql://postgres:SENHA@host.proxy.rlwy.net:PORTA/railway

  O arquivo gerado contém hashes de senha e dados de clientes: guarde em pasta protegida
  e nunca o envie para o git.

.PARAMETER Pasta   Onde gravar os backups (padrão: C:\Licitações\Backups-Banco).
.PARAMETER Manter  Quantos backups manter (padrão: 14). Os mais antigos são apagados.
.PARAMETER Rotulo  Texto no nome do arquivo (ex.: antes-do-deploy).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\ops\backup-banco.ps1 -Rotulo antes-do-deploy
#>
param(
  [string]$Pasta = 'C:\Licitações\Backups-Banco',
  [int]$Manter = 14,
  [string]$Rotulo = ''
)

$ErrorActionPreference = 'Stop'

function Ler-UrlDeConexao {
  if ($env:BACKUP_DATABASE_URL) { return $env:BACKUP_DATABASE_URL }
  $arq = Join-Path $PSScriptRoot '.env.backup'
  if (Test-Path -LiteralPath $arq) {
    $linha = Get-Content -LiteralPath $arq | Where-Object { $_ -match '^\s*BACKUP_DATABASE_URL\s*=' } | Select-Object -First 1
    if ($linha) { return ($linha -replace '^\s*BACKUP_DATABASE_URL\s*=\s*', '').Trim().Trim('"') }
  }
  throw 'URL do banco não encontrada. Defina BACKUP_DATABASE_URL ou crie scripts\ops\.env.backup (veja a ajuda do script).'
}

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
  throw "$nome não encontrado. Instale o cliente do PostgreSQL (mesma versão principal do servidor ou mais nova)."
}

$conn = Separar-Url (Ler-UrlDeConexao)
$pgDump = Achar-Ferramenta 'pg_dump'
$pgRestore = Achar-Ferramenta 'pg_restore'

New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
$sufixo = if ($Rotulo) { "_$Rotulo" } else { '' }
$arquivo = Join-Path $Pasta ("{0}_{1:yyyy-MM-dd_HHmm}{2}.dump" -f $conn.Banco, (Get-Date), $sufixo)

Write-Host "Banco: $($conn.Host):$($conn.Porta)/$($conn.Banco)  (somente leitura)"
Write-Host "Gerando: $arquivo"

$env:PGPASSWORD = $conn.Senha
$env:PGCONNECT_TIMEOUT = '30'
try {
  & $pgDump -h $conn.Host -p $conn.Porta -U $conn.Usuario -d $conn.Banco -Fc -Z 6 --no-password -f $arquivo
  if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou (código $LASTEXITCODE)." }

  # Um backup que não abre não vale nada: confere o índice do arquivo.
  $itens = & $pgRestore -l $arquivo
  if ($LASTEXITCODE -ne 0) { throw 'O arquivo gerado não é um backup válido (pg_restore -l falhou).' }
  $tabelas = ($itens | Select-String 'TABLE DATA').Count
  $tamanho = (Get-Item -LiteralPath $arquivo).Length
  if ($tamanho -lt 10240 -or $tabelas -lt 1) { throw "Backup suspeito: $tamanho bytes, $tabelas tabelas com dados." }
}
catch {
  if (Test-Path -LiteralPath $arquivo) { Remove-Item -LiteralPath $arquivo -Force }
  Write-Error $_
  exit 1
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host ("OK: {0:N1} MB, {1} tabelas com dados, índice legível." -f ($tamanho / 1MB), $tabelas)

# Rotação: apaga os mais antigos além de -Manter (só os deste banco).
$todos = Get-ChildItem -LiteralPath $Pasta -Filter "$($conn.Banco)_*.dump" | Sort-Object LastWriteTime -Descending
$apagar = $todos | Select-Object -Skip $Manter
foreach ($f in $apagar) { Remove-Item -LiteralPath $f.FullName -Force; Write-Host "Removido (rotação): $($f.Name)" }
Write-Host "Backups mantidos: $([Math]::Min($todos.Count, $Manter))"
Write-Output $arquivo
