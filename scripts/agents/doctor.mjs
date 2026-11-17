import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
let missing = 0;
function check(label, ok) {
  console.log(`${ok ? 'OK' : 'MISSING'} ${label}`);
  if (!ok) missing++;
}
function available(command, args = ['--version']) {
  return spawnSync(command, args, { stdio: 'ignore', timeout: 15000 }).status === 0;
}
check('Node >=22', Number(process.versions.node.split('.')[0]) >= 22);
check('agent-skills submodule', existsSync('tools/agent-skills/skills/frontend-ui-engineering/SKILL.md'));
check('Vibetest submodule', existsSync('tools/vibetest-use/vibetest/mcp_server.py'));
check('Playwriter npm package', existsSync('node_modules/playwriter/package.json'));
check('Gemini CLI npm package', existsSync('node_modules/@google/gemini-cli/package.json'));
check('Vibetest Python imports', available('.tools/venv/bin/python', ['-c', 'import vibetest.agents; import vibetest.mcp_server']));
check('Vibetest GOOGLE_API_KEY (value hidden)', Boolean(process.env.GOOGLE_API_KEY));
check('Vibetest VIBETEST_MODEL', Boolean(process.env.VIBETEST_MODEL));
check('container-use binary', available('container-use'));
check('Docker daemon', available('docker', ['info']));
console.log('Chrome extension connection, model access and Gemini CLI login require separate runtime checks.');
process.exitCode = missing ? 1 : 0;
