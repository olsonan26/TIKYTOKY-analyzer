[CmdletBinding()]
param(
    # Optional absolute path to a Python 3.12 executable. No Windows py launcher is used.
    [string]$PythonPath = ''
)

$ErrorActionPreference = 'Stop'
$workerDirectory = [System.IO.Path]::GetFullPath($PSScriptRoot)
$researchDirectory = Join-Path $workerDirectory 'research-runtime'
$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uvCommand) {
    throw 'Install uv from https://docs.astral.sh/uv/getting-started/installation/ and reopen this terminal, then rerun setup.ps1.'
}

if (-not $PythonPath) {
    $pythonCandidates = @(& $uvCommand.Source python find 3.12 2>$null)
    if ($LASTEXITCODE -ne 0 -or $pythonCandidates.Count -eq 0) {
        throw 'Python 3.12 was not found. Run: uv python install 3.12. Then rerun setup.ps1, or pass -PythonPath with an existing Python 3.12 executable.'
    }
    $PythonPath = $pythonCandidates[-1].Trim()
}
if (-not [System.IO.Path]::IsPathRooted($PythonPath) -or -not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) {
    throw 'PythonPath must be an existing absolute path to a Python 3.12 executable.'
}
$PythonPath = (Resolve-Path -LiteralPath $PythonPath).Path
$pythonVersion = & $PythonPath -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>$null
if ($LASTEXITCODE -ne 0 -or $pythonVersion -ne '3.12') {
    throw 'Use a Python 3.12 executable for both isolated worker runtimes.'
}

$missingTools = @('ffmpeg', 'ffprobe') | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) }
if ($missingTools.Count -gt 0) {
    throw ('Missing local media tools: ' + ($missingTools -join ', ') + '. Install a trusted FFmpeg build containing FFprobe, add its bin folder to PATH, reopen this terminal, and rerun. See https://ffmpeg.org/download.html. This script does not install system packages.')
}

$previousDownloads = $env:UV_CONCURRENT_DOWNLOADS
$env:UV_CONCURRENT_DOWNLOADS = '4'
try {
    Write-Host 'Synchronizing the primary Python 3.12 worker environment...'
    & $uvCommand.Source sync --project $workerDirectory --python $PythonPath
    if ($LASTEXITCODE -ne 0) { throw 'Primary worker dependency synchronization failed. Review the package error above and rerun; the research runtime has not been synchronized.' }

    Write-Host 'Synchronizing the separate GPT Researcher / Crawl4AI environment...'
    & $uvCommand.Source sync --project $researchDirectory --python $PythonPath
    if ($LASTEXITCODE -ne 0) { throw 'Research-runtime dependency synchronization failed. Review the package error above and rerun.' }

    $primaryPython = Join-Path $workerDirectory '.venv\Scripts\python.exe'
    $researchPython = Join-Path $researchDirectory '.venv\Scripts\python.exe'
    foreach ($runtimePython in @($primaryPython, $researchPython)) {
        if (-not (Test-Path -LiteralPath $runtimePython -PathType Leaf)) { throw 'An isolated Python executable was not created by uv.' }
        Write-Host 'Installing Chromium for an isolated browser runtime...'
        & $runtimePython -m playwright install chromium
        if ($LASTEXITCODE -ne 0) { throw 'Playwright Chromium installation failed. Review its network or platform-dependency message above and rerun setup.' }
    }

    $workerEnvironment = Join-Path $workerDirectory '.env'
    if (-not (Test-Path -LiteralPath $workerEnvironment)) {
        Copy-Item -LiteralPath (Join-Path $workerDirectory '.env.example') -Destination $workerEnvironment
    }
    Write-Host 'Setup complete. No service, startup task, or cloud account was registered.'
    Write-Host 'The worker reuses OPENROUTER_API_KEY from the repository .env.local; do not paste keys into terminal output.'
    Write-Host 'First local speech transcription downloads the selected Whisper model into the worker cache. CPU/int8 with base is the default.'
    Write-Host 'From the worker folder, start: .\.venv\Scripts\python.exe -m tikytoky serve'
    Write-Host 'The worker creates its pairing-token file automatically. Read it locally when pairing; setup does not print it.'
} finally {
    if ($null -eq $previousDownloads) { Remove-Item Env:UV_CONCURRENT_DOWNLOADS -ErrorAction SilentlyContinue }
    else { $env:UV_CONCURRENT_DOWNLOADS = $previousDownloads }
}
