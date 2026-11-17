# DressIt

Work on `main_chatgpt` for the integration work requested by the owner.
PWA: `apps/web` (Next.js/React); API: `apps/api` (Fastify/Postgres/Gemini).

## Development workflow

The upstream engineering workflows are pinned in `tools/agent-skills`.
Initialize them with `git submodule update --init --recursive`.
Read only the relevant `skills/<name>/SKILL.md` and its references as needed:
- frontend-ui-engineering for UI work;
- api-and-interface-design and security-and-hardening for API/auth changes;
- debugging-and-error-recovery for failures;
- code-review-and-quality before delivering a change.
The user's scope and authorization take precedence. Do not preload the whole pack.

Run `npm run check` for API/web typechecks and builds after installing each app's dependencies.
For browser checks use the scenarios in `docs/agents/qa.md`. Report actual results and distinguish mock, local, and production tests.
Never use production wardrobes or real photos for exploratory agent tests. Use disposable test accounts and fixtures.
Never include API keys, JWTs, photos, or browser sessions in commits or QA reports.

## Isolated work

When container-use is available, create one environment per concurrent task using its MCP tools.
Inside it use Node 22 and a separate development database. Install app dependencies there.
Never share a mutable Postgres database between agents. Do not run Render deployment or change secrets as part of setup.
Review the resulting branch/diff before integrating it into the user's branch.
