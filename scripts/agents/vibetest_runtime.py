"""Compatibility adapters for the pinned, unmodified upstream Vibetest."""
import os
import shutil
import vibetest.agents as agents

OriginalSession = agents.BrowserSession

class ManagedSession(OriginalSession):
    async def aclose(self):
        # browser-use 0.13 exposes kill(); upstream still calls aclose().
        await self.kill()

def configure(model):
    original_google = agents.ChatGoogle
    def configured_google(*args, **kwargs):
        kwargs['model'] = model
        return original_google(*args, **kwargs)
    agents.ChatGoogle = configured_google
    agents.BrowserSession = ManagedSession
    executable = os.environ.get('VIBETEST_BROWSER_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
    if executable:
        original_profile = agents.BrowserProfile
        def configured_profile(*args, **kwargs):
            kwargs['executable_path'] = executable
            return original_profile(*args, **kwargs)
        agents.BrowserProfile = configured_profile
