[CmdletBinding()]
param(
    [switch]$StartDocker,
    [ValidateRange(10, 240)][int]$StartupTimeoutSeconds = 120,
    [switch]$SkipHealthQuery
)

$ErrorActionPreference = 'Stop'
$workerRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$composePath = Join-Path $workerRoot 'compose.yml'
$dataRoot = Join-Path $workerRoot '.data'
$secretPath = Join-Path $dataRoot 'searxng.env'
$statusPath = Join-Path $dataRoot 'searxng-status.json'
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCommand) {
    throw 'Docker CLI was not found. Install or start your existing Docker Desktop setup; no machine configuration was changed.'
}

function Save-SearxStatus([hashtable]$Details) {
    New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
    $Details.observedAt = [DateTime]::UtcNow.ToString('o')
    $Details | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statusPath -Encoding utf8
}

function Test-DockerReady {
    $dockerOutput = & $dockerCommand.Source info --format '{{.ServerVersion}}' 2>&1
    return $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($dockerOutput | Out-String))
}

if (-not (Test-DockerReady)) {
    if ($StartDocker) {
        $desktopPath = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
        if (-not (Test-Path -LiteralPath $desktopPath -PathType Leaf)) {
            Save-SearxStatus @{ status = 'blocked'; stage = 'docker'; reason = 'Docker Desktop executable was not found.' }
            throw 'Docker Desktop executable was not found. Start your existing Docker engine manually.'
        }
        Write-Host 'Starting the installed Docker Desktop app. No service, WSL, or operating-system settings are changed.'
        Start-Process -FilePath $desktopPath -WindowStyle Hidden
        $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
        while ([DateTime]::UtcNow -lt $deadline -and -not (Test-DockerReady)) {
            Start-Sleep -Seconds 3
        }
    }
    if (-not (Test-DockerReady)) {
        Save-SearxStatus @{ status = 'blocked'; stage = 'docker'; reason = 'Docker engine did not become available. Docker Desktop may require a person to complete its startup, terms, or permissions.' }
        throw 'Docker engine is unavailable. Check Docker Desktop for startup, terms, or permission prompts, then rerun this script. No prompt was automatically accepted.'
    }
}

New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dataRoot 'searxng-cache') -Force | Out-Null
if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) {
    $secretBytes = New-Object byte[] 32
    $cryptoGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $cryptoGenerator.GetBytes($secretBytes) } finally { $cryptoGenerator.Dispose() }
    $localSecret = [Convert]::ToBase64String($secretBytes)
    [System.IO.File]::WriteAllText($secretPath, ('SEARXNG_SECRET=' + $localSecret + [Environment]::NewLine), (New-Object System.Text.UTF8Encoding($false)))
    Clear-Variable localSecret
    [Array]::Clear($secretBytes, 0, $secretBytes.Length)
}
# Validate quietly. Never print resolved Compose config; it includes the secret.
$secretContent = [System.IO.File]::ReadAllText($secretPath)
if ($secretContent -notmatch '(?m)^SEARXNG_SECRET=([A-Za-z0-9+/=]{40,})\s*$') {
    throw 'The private SearxNG environment file is invalid. Restore a strong secret in worker/.data/searxng.env; its contents were not printed.'
}
Clear-Variable secretContent

Write-Host 'Starting the private SearxNG service at http://127.0.0.1:8080 with JSON search enabled.'
& $dockerCommand.Source compose --env-file $secretPath -f $composePath up -d searxng
if ($LASTEXITCODE -ne 0) {
    Save-SearxStatus @{ status = 'failed'; stage = 'container'; reason = 'Docker Compose could not start the official SearxNG service.' }
    throw 'Docker Compose could not start SearxNG. Check image pull, port 8080, and Docker engine availability.'
}

$healthDeadline = [DateTime]::UtcNow.AddSeconds(90)
$healthy = $false
while ([DateTime]::UtcNow -lt $healthDeadline) {
    try {
        $healthResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/healthz' -TimeoutSec 5 -UseBasicParsing
        if ($healthResponse.StatusCode -eq 200) { $healthy = $true; break }
    } catch { Start-Sleep -Seconds 3 }
}
if (-not $healthy) {
    Save-SearxStatus @{ status = 'failed'; stage = 'http-health'; reason = 'Container started but HTTP health did not become ready.' }
    throw 'The SearxNG container started, but its HTTP health check did not become ready.'
}

$containerId = & $dockerCommand.Source compose --env-file $secretPath -f $composePath ps -q searxng
$imageId = (& $dockerCommand.Source inspect --format '{{.Image}}' $containerId).Trim()
$imageDigests = & $dockerCommand.Source image inspect --format '{{json .RepoDigests}}' $imageId
$result = @{ status = 'healthy'; stage = 'http-health'; endpoint = 'http://127.0.0.1:8080'; imageId = $imageId; imageDigests = ($imageDigests | ConvertFrom-Json); jsonSearchVerified = $false }

if (-not $SkipHealthQuery) {
    try {
        $queryResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/search?q=Crawl4AI+official+documentation&format=json&categories=general&safesearch=1' -TimeoutSec 45
        if ($null -eq $queryResponse.results) { throw 'No documented results field was returned.' }
        $result.jsonSearchVerified = $true
        $result.searchResultCount = @($queryResponse.results).Count
        $result.unresponsiveEngines = @($queryResponse.unresponsive_engines)
        Write-Host ('SearxNG JSON search responded: ' + $result.searchResultCount + ' results. Engine failures are recorded separately in worker/.data/searxng-status.json.')
    } catch {
        $result.status = 'degraded'
        $result.stage = 'json-search'
        $result.reason = 'HTTP health passed, but the JSON search query failed or timed out. Search engines may be unavailable.'
        Write-Warning $result.reason
    }
}
Save-SearxStatus $result
Write-Host 'Private SearxNG setup result saved. Set SEARXNG_URL=http://127.0.0.1:8080 for the worker.'

