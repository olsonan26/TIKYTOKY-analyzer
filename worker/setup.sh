#!/usr/bin/env sh
set -eu

# Native Linux / WSL2 setup. This does not modify a Windows Python environment.
worker_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
research_directory="$worker_directory/research-runtime"
if ! command -v uv >/dev/null 2>&1; then
    printf '%s\n' 'Install uv from https://docs.astral.sh/uv/getting-started/installation/ and reopen this terminal, then rerun setup.sh.' >&2
    exit 1
fi

python_path=${1:-}
if [ -z "$python_path" ]; then
    if ! python_path=$(uv python find 3.12 2>/dev/null); then
        printf '%s\n' 'Python 3.12 was not found. Run: uv python install 3.12. Then rerun setup.sh or pass its existing absolute executable path as the first argument.' >&2
        exit 1
    fi
fi
case "$python_path" in
    /*) ;;
    *) printf '%s\n' 'Pass an existing absolute Linux path to Python 3.12. Windows executables are not used by the WSL2 worker.' >&2; exit 1 ;;
esac
if [ ! -x "$python_path" ] || [ "$("$python_path" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')" != '3.12' ]; then
    printf '%s\n' 'Use an executable Python 3.12 path for both isolated worker runtimes.' >&2
    exit 1
fi
for media_tool in ffmpeg ffprobe; do
    if ! command -v "$media_tool" >/dev/null 2>&1; then
        printf '%s\n' "Missing $media_tool on the Linux PATH. Install your distribution's trusted FFmpeg package containing FFprobe, then rerun. See https://ffmpeg.org/download.html. This script does not install system packages." >&2
        exit 1
    fi
done

UV_CONCURRENT_DOWNLOADS=4
export UV_CONCURRENT_DOWNLOADS
printf '%s\n' 'Synchronizing the primary Python 3.12 worker environment...'
uv sync --project "$worker_directory" --python "$python_path"
printf '%s\n' 'Synchronizing the separate GPT Researcher / Crawl4AI environment...'
uv sync --project "$research_directory" --python "$python_path"

for runtime_python in "$worker_directory/.venv/bin/python" "$research_directory/.venv/bin/python"; do
    printf '%s\n' 'Installing Chromium for an isolated browser runtime...'
    if ! "$runtime_python" -m playwright install chromium; then
        printf '%s\n' 'Chromium installation failed. Follow the reported network or Linux library instructions. If Playwright reports missing system libraries, install its documented dependencies explicitly, then rerun; setup does not invoke sudo or apt.' >&2
        exit 1
    fi
done
if [ ! -e "$worker_directory/.env" ]; then
    cp "$worker_directory/.env.example" "$worker_directory/.env"
fi

printf '%s\n' \
    'Setup complete. No service, startup task, or cloud account was registered.' \
    'The worker reuses OPENROUTER_API_KEY from the repository .env.local; do not paste keys into terminal output.' \
    'First local transcription downloads the selected Whisper model into the worker cache. CPU/int8 with base is the default.' \
    'From the worker folder, start: ./.venv/bin/python -m tikytoky serve' \
    'The worker creates its pairing-token file automatically. Read it locally when pairing; setup does not print it.'
