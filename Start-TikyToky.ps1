[CmdletBinding()]
param([int]$Port=4199,[switch]$NoBrowser,[switch]$Production)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$workerRoot=Join-Path $projectRoot 'worker'
$workerPython=Join-Path $workerRoot '.venv\Scripts\python.exe'
$nodeCommand=Get-Command node -ErrorAction Stop
if(-not(Test-Path -LiteralPath $workerPython)){throw 'Run worker/setup.ps1 to install the isolated worker runtimes first.'}
if(-not(Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/next/dist/bin/next'))){throw 'Run npm ci from the repository root first.'}
if(-not(Test-Path -LiteralPath (Join-Path $projectRoot '.env.local'))){throw 'Copy .env.example to .env.local and add your OpenRouter key first.'}
$runtime=Join-Path $workerRoot '.data'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
function Is-Ready([string]$Url){try{$response=Invoke-WebRequest -Uri $Url -TimeoutSec 2 -UseBasicParsing;return $response.StatusCode -eq 200}catch{return $false}}
if(-not(Is-Ready 'http://127.0.0.1:8765/health')){
    Start-Process -FilePath $workerPython -ArgumentList @('-m','tikytoky','serve') -WorkingDirectory $workerRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'worker.out.log') -RedirectStandardError (Join-Path $runtime 'worker.err.log') | Out-Null
}
$dashboard="http://localhost:$Port"
$dashboardProbe="http://127.0.0.1:$Port/api/status"
if(-not(Is-Ready $dashboardProbe)){
    $next=Join-Path $projectRoot 'node_modules\next\dist\bin\next'
    $mode=if($Production){'start'}else{'dev'}
    if($Production -and -not(Test-Path -LiteralPath (Join-Path $projectRoot '.next/BUILD_ID'))){throw 'Run npm run build before using -Production. Also configure APP_PASSWORD in .env.local.'}
    $arguments='"'+$next+'" '+$mode+' --hostname 127.0.0.1 --port '+$Port
    Start-Process -FilePath $nodeCommand.Source -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'dashboard.out.log') -RedirectStandardError (Join-Path $runtime 'dashboard.err.log') | Out-Null
}
for($attempt=0;$attempt -lt 60;$attempt++){
    if((Is-Ready $dashboardProbe) -and (Is-Ready 'http://127.0.0.1:8765/health')){break}
    Start-Sleep -Milliseconds 500
}
if(-not(Is-Ready $dashboardProbe)){throw "Dashboard did not start. Review worker/.data/dashboard.err.log."}
if(-not(Is-Ready 'http://127.0.0.1:8765/health')){throw 'Worker did not start. Review worker/.data/worker.err.log.'}
Write-Host "Dashboard: $dashboard"
Write-Host 'Worker: http://127.0.0.1:8765'
Write-Host 'Pair in Autonomous research using the private token in worker/.data/worker-token.txt. No provider key is displayed.'
if(-not $NoBrowser){Start-Process $dashboard | Out-Null}
