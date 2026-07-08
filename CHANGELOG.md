# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v2.20] - 2026-07-08

### Added
- 🛡️ **System fallback LLM**: `/api/llm-default` endpoint returns default config
  metadata (no apiKey leak) so the client can transparently fall back to a
  system-provided model when the user has not configured their own key.
- 🛡️ **Server-side env fallback**: `__system_default__` placeholder in
  `generate.js` / `expandL3.js` / `llm.js#testLLM` triggers automatic
  injection of `HEXAI_API_KEY` / `HEXAI_BASE_URL` / `HEXAI_MODEL` from `.env`.
- 🎨 **Client fallback UX**:
  - Top-level badge `🛡️ 兜底 <model>` when no user API key is configured.
  - `AIConfig` panel shows a green "系统兜底 LLM" card with a
    "一键应用兜底" button.
  - `onGenerate` no longer errors out when the user has no key — it
    silently uses the system fallback.
- 🐳 **Docker deployment**:
  - Multi-stage `Dockerfile` (node:20-alpine + tini + curl for healthcheck).
  - `.dockerignore` to keep images lean.
  - `docker-compose.yml` with healthcheck, env wiring, port mapping.
  - `.env.docker.example` template.
  - `DOCKER.md` deployment / upgrade / troubleshooting guide.
- 🏷️ GitHub release badges in `README.md`.
- ⚖️ `LICENSE` (MIT).
- ⚙️ `.github/workflows/ci.yml`:
  - Lint & smoke job (npm ci + vite build + node --check on every push/PR).
  - Docker buildx job that publishes multi-arch image (`linux/amd64`,
    `linux/arm64`) to `ghcr.io/<owner>/sow-wbs` with `latest` / `vX.Y.Z` /
    `sha-xxxxxxx` tags, plus provenance + SBOM.

### Changed
- Frontend now consumes `fetchDefaultLLM()` on mount to display fallback state.

## [v2.14] - earlier

- SOW → WBS 智能拆解系统 v2.14
