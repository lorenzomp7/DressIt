# DressIt

Work on `main_claude` for the integration work requested by the owner.
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

Run `npm run verify` (API/web typechecks and builds, then the API tests in `apps/api/test/`)
after installing each app's dependencies. API tests alone: `npm test`. Add a test for every API behavior change.
For browser checks use the scenarios in `docs/agents/qa.md`. Report actual results and distinguish mock, local, and production tests.
Never use production wardrobes or real photos for exploratory agent tests. Use disposable test accounts and fixtures.
Never include API keys, JWTs, photos, or browser sessions in commits or QA reports.

## Gemini API

Before any change to `apps/api/src/services/ai.ts` (photo tagging, stylist, model or SDK settings)
read `.claude/skills/gemini-api-dev/SKILL.md` (official Google skill, origin in its `SOURCE.md`)
and fetch the hosted doc page it points to for the feature you touch.
- The app calls `ai.models.generateContent` (`@google/genai` 2.x) with `responseJsonSchema` built
  from zod and `thinkingConfig.thinkingLevel`. The skill favours the Interactions API and SDK 3.x:
  migrating is a separate task; do it only when the owner asks (see `references/migration.md`).
- The model comes from `GEMINI_MODEL` (`apps/api/src/config.ts`, `deploy/compose.yml`,
  deploy variable `GEMINI_MODEL`). Before changing the default, check the name against the
  skill's current-model list and the hosted docs; never pick a model the skill marks as legacy.
- Report whether a check used the real API with a test account or the mock (`GEMINI_BASE_URL`).

## Isolated work

When container-use is available, create one environment per concurrent task using its MCP tools.
Inside it use Node 22 and a separate development database. Install app dependencies there.
Never share a mutable Postgres database between agents. Do not run the deploy workflows (GitHub Pages, Oracle VM) or change secrets as part of setup.
Review the resulting branch/diff before integrating it into the user's branch.
