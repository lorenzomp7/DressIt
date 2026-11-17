"""Run pinned upstream Vibetest with a configurable model instead of retired defaults."""
import os
import sys
from pathlib import Path

if not os.environ.get('GOOGLE_API_KEY'):
    sys.exit('Set GOOGLE_API_KEY in the MCP client environment (never commit it).')
model = os.environ.get('VIBETEST_MODEL')
if not model:
    sys.exit('Set VIBETEST_MODEL to a Gemini model available to your account.')

import vibetest.agents as agents
original = agents.ChatGoogle

def configured_google(*args, **kwargs):
    kwargs['model'] = model
    return original(*args, **kwargs)

agents.ChatGoogle = configured_google
from vibetest.mcp_server import run
# Upstream writes reports relative to cwd; keep them out of the source tree.
reports = Path(__file__).resolve().parents[2] / '.tools' / 'reports'
reports.mkdir(parents=True, exist_ok=True)
os.chdir(reports)
run()
