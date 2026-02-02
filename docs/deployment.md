## Deployment & CI

After running `bun run build` you have everything inside the `./dist` folder to deploy to any static webhost.

For this repository, Cloudflare is configured to deploy for us:

- pushes to main go to https://pg.radio4000.com
- pull requests (non-draft) get their own, unique URL

Run `bun run check` to format and lint the entire code base.
Run `bun run knip` for additional reports on unused code etc.
Run `bun run types` to let Svelte check the project.
Run `bun run test` to run our tests.
Run `bun update -i` to interactively decide which dependencies to update, if any.
