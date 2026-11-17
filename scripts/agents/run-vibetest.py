"""Run pinned upstream Vibetest with a configurable model instead of retired defaults."""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[2] / '.env.agents', override=False)
if not os.environ.get('GOOGLE_API_KEY') and os.environ.get('GEMINI_API_KEY'):
    os.environ['GOOGLE_API_KEY'] = os.environ['GEMINI_API_KEY']
if not os.environ.get('GOOGLE_API_KEY'):
    sys.exit('Set GOOGLE_API_KEY in the MCP client environment (never commit it).')
model = os.environ.get('VIBETEST_MODEL')
if not model:
    sys.exit('Set VIBETEST_MODEL to a Gemini model available to your account.')

from vibetest_runtime import configure
configure(model)
from vibetest.mcp_server import run
# Upstream writes reports relative to cwd; keep them out of the source tree.
reports = Path(__file__).resolve().parents[2] / '.tools' / 'reports'
reports.mkdir(parents=True, exist_ok=True)
os.chdir(reports)
run()
