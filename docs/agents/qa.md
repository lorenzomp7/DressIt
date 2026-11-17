# DressIt browser QA

Target: local frontend http://localhost:3000 and test API http://localhost:4000.
Use a disposable account, synthetic clothing photos, and a development database.

## Playwriter

Install the Chrome extension linked by https://github.com/remorses/playwriter and enable it on a test tab.
Connect through the configured MCP server. Create a new page and keep it in session state.
Use desktop and mobile viewport sizes; inspect console errors and failed API calls.

Check these flows, recording expected/actual results and reproduction steps:
1. Anonymous visit to `/` redirects to login. Switch between login/register forms; verify required fields and server errors.
2. Register a disposable user, reload, and verify the session persists.
3. Upload a synthetic garment from gallery; verify progress, resulting card, and editable attributes. Reject a non-clothing image cleanly.
4. Filter the wardrobe, open a garment, edit it and reload; verify persisted values.
5. Ask for an office outfit with and without geolocation. Verify the displayed garments belong to this account. Test an unavailable AI response.
6. Mark an outfit as worn and check state after reload. Delete only disposable fixtures.
7. Verify narrow-screen navigation, keyboard focus, and absence of horizontal overflow.
8. With two disposable users, verify one cannot retrieve/change the other's item IDs. Check non-admin access to admin API is denied.
9. Manually check camera capture and PWA installation on actual Android/iOS; desktop emulation does not prove these work.

## Vibetest

Run the setup in development-tools.md and configure GOOGLE_API_KEY and VIBETEST_MODEL.
Call MCP `start` with the local URL, `num_agents: 1`, `headless: true`; then call `results` with its test ID.
This is exploratory QA, not a replacement for deterministic regression tests.
The upstream start API has no custom scenario/credential parameter: authenticated journeys above must be exercised with Playwriter or explicit regression tests.
Agent/model calls can incur costs. Reports are local under `.tools/reports/`.

## Automated runtime smoke test

`npm run agent:test:browser` runs Playwriter against the static frontend in an
isolated headless browser and then starts/stops Vibetest's browser engine.
It creates its own local static server and uses synthetic API fixtures, without
creating accounts or calling Gemini. GitHub Actions runs this on a capable host;
passing it does not prove real API, AI recognition, camera capture, or PWA installation.
