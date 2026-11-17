# Development tools

These integrations run on a developer machine or an agent host, not in the deployed PWA/API.

## Setup

```bash
git submodule update --init --recursive
npm ci
npm ci --prefix apps/api
npm ci --prefix apps/web
npm run check
```

The root npm lock pins Playwriter and Gemini CLI. Git submodules pin the complete
agent-skills and Vibetest repositories, including their licenses and references.
Update pins deliberately and review upstream changes.

## agent-skills

AGENTS.md routes project work to the pinned workflows. For native Codex plugin discovery:

```bash
codex plugin marketplace add ./tools/agent-skills
codex plugin add agent-skills@agent-skills
```

For Claude Code: `claude --plugin-dir ./tools/agent-skills`.
This configures the local client; committing a repository cannot enable plugins in ChatGPT automatically.

## Playwriter

`npm run agent:browser` starts the MCP server; `npm run agent:browser:cli -- --help`
uses CLI mode. Install/enable the Chrome extension described in the upstream README.
Follow qa.md for DressIt-specific checks. A connected browser is required for execution.

## Vibetest

Requires Python 3.11+, uv, and Chromium system libraries.

```bash
npm run agent:vibetest:setup
export GOOGLE_API_KEY='your-local-key'
export VIBETEST_MODEL='model-available-to-your-account'
npm run agent:vibetest
```

The launcher overrides upstream's hardcoded experimental/legacy Gemini models for both
exploration and report summarization. No model request happens on server startup.
Dependency versions are frozen in tools/vibetest-requirements.txt.
If Chromium reports missing OS libraries, install them with Playwright's documented
`install-deps chromium` command on the host.

## container-use

Requires Docker running and the container-use binary. Follow
https://github.com/dagger/container-use for the host-specific installation.
The MCP configuration uses the documented `container-use stdio` entrypoint.
Follow AGENTS.md for separate environments/databases and review of agent branches.
The existing docker-compose.yml supplies development Postgres; it is not the container-use server.

## Gemini CLI

`npm run agent:gemini` launches the pinned CLI with GEMINI.md project context.
Authenticate locally with your own account; CLI quotas/billing are separate from
DressIt's Gemini API calls. Never commit authentication files.

## MCP clients

`.mcp.json` configures compatible clients when launched from the repository root.
For Codex, merge `.config/codex-agents.toml` into your client's configuration.
Pass GOOGLE_API_KEY and VIBETEST_MODEL through the client environment; no secrets
are stored in these files. Enable only servers whose host prerequisites are installed.

## Catalogs and excluded libraries

- https://github.com/punkpeye/awesome-mcp-servers is a discovery catalog, not an app dependency.
- The quoted awesome-ai-plugins name does not identify a unique owner/repository; no unverified package is installed.
- LibSignal, darts and Syncfusion Flutter examples do not fit DressIt's current stack/features.
- MiMo-Code is an optional alternative agent; it adds no required DressIt capability and is not installed.

## Runtime verification

GitHub Actions now exercises both runtimes on pushes to `main_chatgpt`:
- Playwriter drives Chromium through the real DressIt frontend. API replies are fixtures;
  route guards, session reload, upload controls, AI error display, responsive layout and logout are checked.
- Vibetest starts and closes its actual Browser Use Chromium session. The adapter fixes
  upstream's obsolete `aclose()` call so sessions are cleaned up with `kill()`.
- container-use creates an isolated Node 22 environment and runs a command inside it.

Run locally with `npm run agent:test:browser` after building the frontend, or
`npm run agent:container:setup` then `npm run agent:test:container` on a Docker host.
The installer pins container-use v0.4.2 and verifies the upstream archive checksum.
`.container-use/environment.json` sets Node 22 as the base image.

For model calls, copy `.env.agents.example` to `.env.agents` on your own host and set
GEMINI_API_KEY and VIBETEST_MODEL. Vibetest also accepts GOOGLE_API_KEY from the environment.
Both launchers load the ignored local file; credentials never go into MCP configuration.
Gemini CLI can alternatively authenticate interactively with your Google account.
Automated CI checks do not authenticate Google or spend model credits.
