param([int]$Port = 4173)
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else {
  Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
}
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js 24 or later is required.' }
Push-Location $PSScriptRoot
try { $env:PORT = "$Port"; & $nodePath --env-file-if-exists=.env server/index.mjs }
finally { Pop-Location }
