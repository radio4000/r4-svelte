# WebMCP

R4 registers browser-agent tools for channel discovery and player control. Unsupported browsers ignore the integration.

`src/lib/webmcp.ts` exposes `search_channels`, `play_channel`, `get_player_state`, and `control_player`. The app registers them once from the root layout and aborts their registrations when the layout unmounts.

For local testing, enable `chrome://flags/#enable-webmcp-testing`, relaunch Chrome, and open R4. Inspect and call the tools with Chrome's [Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/jbdchjihjckffmamieibhlkfkbhjggcf). The API is experimental; use `document.modelContext`, keep feature detection, and do not add a polyfill to the production bundle.
