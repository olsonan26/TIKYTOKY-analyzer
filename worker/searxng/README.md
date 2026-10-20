# Private SearxNG service

This optional service enriches the existing TIKYTOKY research job. It does not add another user-facing research application and is not required for supplied video evidence.

From the repository root on the existing Windows Docker Desktop installation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\worker\searxng-start.ps1 -StartDocker
```

The script can launch the already installed Docker Desktop app. It does not install Docker, change services or WSL, accept terms, or approve permission prompts. If Docker requires a person to complete startup, the script records a blocked result. Complete that existing Docker setup, then rerun the script.

The official `docker.io/searxng/searxng` image binds only to `127.0.0.1:8080`. JSON and HTML formats are enabled. A cryptographically random secret is generated once into the gitignored `worker/.data/searxng.env`; never publish this file or resolved `docker compose config` output. Cache and health/search observations also remain in `worker/.data/`.

Set `SEARXNG_URL=http://127.0.0.1:8080` in the worker environment. If the main worker itself runs in a compose network, configure the service hostname instead; loopback points to the current container. Do not expose this service publicly without a separate deployment review.

The image defaults to the official `latest` tag. The actual image ID and repository digest are recorded after startup in `worker/.data/searxng-status.json`; set `SEARXNG_IMAGE` to a reviewed `docker.io/searxng/searxng@sha256:...` digest for repeatable future starts.

`/healthz` success only establishes HTTP readiness. The startup script separately queries `/search?...&format=json`, records result count and unresponsive engines, and reports degraded search when that query fails. A zero-result response or a failed upstream search engine is not replaced with invented sources.

To stop the service without removing its cache or secret:

```powershell
docker compose --env-file .\worker\.data\searxng.env -f .\worker\compose.yml stop searxng
```

SearxNG is an unmodified separate service under **AGPL-3.0-or-later**. Its source, license, and installation documentation remain available from the upstream project:

- [Source at the inspected revision](https://github.com/searxng/searxng/tree/81371861f67226091d1c4df2e3908a11d3b54eb9)
- [AGPL license](https://github.com/searxng/searxng/blob/81371861f67226091d1c4df2e3908a11d3b54eb9/LICENSE)
- [Official container instructions](https://docs.searxng.org/admin/installation-docker.html)

Retain upstream notices and evaluate its AGPL obligations when distributing or changing the service.
