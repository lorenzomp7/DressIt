"""Exercise browser/container runtimes. No model calls or user credentials."""
import asyncio
import functools
import http.server
import json
from pathlib import Path
import sys
import threading
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[2]

def text(result):
    value = '\n'.join(c.text for c in result.content if c.type == 'text')
    if result.isError:
        raise RuntimeError(value)
    return value

async def browser():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT/'apps/web/out'))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}'
    try:
        async with stdio_client(StdioServerParameters(command='node', args=['node_modules/playwriter/bin.js'])) as (r,w):
            async with ClientSession(r,w) as client:
                await client.initialize()
                print(text(await client.call_tool('session_new', {'browser': 'headless', 'tabGroup': 'dressit'})))
                try:
                    text(await client.call_tool('execute', {'code': 'state.page = await context.newPage();', 'timeout': 20000}))
                    code = f'const qa = await import("./scripts/agents/browser-smoke.mjs"); await qa.run({{page: state.page, url: {json.dumps(url)}}});'
                    result = text(await client.call_tool('execute', {'code': code, 'timeout': 60000}))
                    assert 'DRESSIT_BROWSER_OK' in result, result
                    print(result)
                finally:
                    text(await client.call_tool('session_delete', {'closeTabs': True}))
        # Verify Vibetest's actual browser session lifecycle as well, without LLM calls.
        from vibetest_runtime import ManagedSession
        from browser_use import BrowserProfile
        session = ManagedSession(browser_profile=BrowserProfile(headless=True, user_data_dir=None))
        try:
            await session.start()
            assert await session.get_current_page() is not None
            print('VIBETEST_BROWSER_OK: Chromium started and page created; no model calls.')
        finally:
            await session.aclose()
    finally:
        server.shutdown()
        server.server_close()

async def container():
    params = StdioServerParameters(command='.tools/bin/container-use', args=['stdio'])
    async with stdio_client(params) as (r,w):
        async with ClientSession(r,w) as client:
            await client.initialize()
            source = str(ROOT)
            created = text(await client.call_tool('environment_create', {
                'environment_source': source, 'title': 'DressIt runtime check',
                'explanation': 'Verify isolated Node 22 development environment',
            }))
            environment = json.loads(created)['id']
            result = text(await client.call_tool('environment_run_cmd', {
                'environment_source': source, 'environment_id': environment,
                'command': 'node -e \'if (process.versions.node.split(".")[0] !== "22") process.exit(1); console.log("DRESSIT_CONTAINER_OK")\'',
                'explanation': 'Verify Node 22 executes inside the isolated container',
            }))
            assert 'DRESSIT_CONTAINER_OK' in result, result
            print(result)

if __name__ == '__main__':
    import os
    os.chdir(ROOT)
    if sys.argv[1:] not in [['browser'], ['container']]:
        sys.exit('Usage: check-runtime.py browser|container')
    async def main():
        async with asyncio.timeout(600):
            await (browser() if sys.argv[1] == 'browser' else container())
    asyncio.run(main())
