# Browser testing

Use `agent-browser` for web automation. It's a CLI tool that provides LLM-optimized snapshots with element refs - like a better Puppeteer for AI agents.

The core workflow is:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes

Run `agent-browser --help` for all commands.

Our app usually runs on http://localhost:5173 (dev) or http://pg.radio4000.com (prod).
