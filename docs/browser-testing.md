If the system has `agent-browser` installed as well as Chromium,
you can use it to get a text view of websites.

Our app usually runs on http://localhost:5173 (dev) or http://pg.radio4000.com (prod).

Usage: https://raw.githubusercontent.com/vercel-labs/agent-browser/refs/heads/main/README.md

```bash
agent-browser open example.com
agent-browser snapshot                    # Get accessibility tree with refs
agent-browser click @e2                   # Click by ref from snapshot
agent-browser fill @e3 "test@example.com" # Fill by ref
agent-browser get text @e1                # Get text by ref
agent-browser screenshot page.png
agent-browser close
```
