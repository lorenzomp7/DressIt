"""Check MCP initialization and tool discovery without browser/model calls."""
import asyncio
import os
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def check(command, args, expected, env=None):
    params = StdioServerParameters(command=command, args=args, env=env)
    async with asyncio.timeout(30):
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                names = {tool.name for tool in (await session.list_tools()).tools}
                assert expected <= names, f'{command}: missing {expected - names}'
                print(f'OK {command}: initialized, tools {sorted(names)}')

async def main():
    await check('node', ['node_modules/playwriter/bin.js'], {'execute'})
    await check('.tools/venv/bin/python', ['scripts/agents/run-vibetest.py'], {'start', 'results'}, {
        **os.environ, 'GOOGLE_API_KEY': 'protocol-check-no-api-calls',
        'VIBETEST_MODEL': 'protocol-check-no-api-calls',
    })

asyncio.run(main())
