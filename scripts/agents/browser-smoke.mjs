import assert from 'node:assert/strict';

export async function run({ page, url }) {
  const user = { id: 'qa-user', email: 'qa@example.invalid', displayName: 'QA', isAdmin: false };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // The frontend is real; API replies are fixtures. No production/model calls.
  await page.route('**/*', async route => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.origin === new URL(url).origin) return route.continue();
    const path = target.pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let status = 200;
    let body;
    if (path === '/health') body = { ok: true };
    else if (path === '/auth/login') body = { token: 'synthetic-qa-token', user };
    else if (path === '/auth/me') body = { user };
    else if (path === '/items') body = { items: [] };
    else if (path === '/outfits/suggest') {
      status = 503; body = { error: 'AI non disponibile (fixture QA)' };
    } else throw new Error(`Unexpected external request: ${target.origin}${path}`);
    return route.fulfill({ status, headers, json: body });
  });
  await page.goto(url);
  await page.waitForURL('**/login/');
  await page.getByRole('button', { name: 'Non hai un account? Registrati' }).click();
  await page.getByPlaceholder('Come ti chiami? (opzionale)').waitFor();
  await page.getByRole('button', { name: 'Hai già un account? Accedi' }).click();
  await page.getByPlaceholder('Email', { exact: true }).fill(user.email);
  await page.getByPlaceholder('Password (min. 8 caratteri)').fill('synthetic-test-password');
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.getByRole('heading', { name: 'Il tuo armadio' }).waitFor();
  await page.getByText('Il tuo armadio è vuoto', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Il tuo armadio' }).waitFor();
  await page.getByRole('link', { name: 'Aggiungi il primo capo' }).click();
  await page.getByRole('button', { name: 'Scatta foto' }).waitFor();
  await page.getByRole('button', { name: 'Dalla galleria' }).waitFor();
  assert.equal(await page.locator('input[type=file][capture=environment]').count(), 1);
  await page.goto(`${url}/assistant/`);
  await page.getByRole('button', { name: 'Meteo attivo' }).click();
  await page.getByPlaceholder('Es. cosa mi metto per un colloquio?').fill('Outfit per ufficio');
  await page.getByRole('button', { name: 'Invia', exact: true }).click();
  await page.getByText('AI non disponibile (fixture QA)', { exact: true }).waitFor();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Horizontal overflow at ${width}px`);
  }
  await page.goto(url);
  await page.getByRole('button', { name: 'Esci', exact: true }).click();
  await page.waitForURL('**/login/');
  assert.equal(await page.evaluate(() => localStorage.getItem('dressit.token')), null);
  assert.deepEqual(errors, []);
  console.log('DRESSIT_BROWSER_OK: route guard, registration toggle, login, reload, wardrobe, upload UI, AI error, mobile/desktop layout, logout. API mocked.');
}
