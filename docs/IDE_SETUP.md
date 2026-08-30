# IDE Setup

Editor configuration for working productively in this repo. Pairs with the local-setup steps in the [root README](../README.md#getting-started) and the workflow/style guidance in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## VS Code (recommended)

### Extensions

| Extension | ID | Why |
|---|---|---|
| ESLint | `dbaeumer.vscode-eslint` | Surfaces lint errors inline, matches the root `eslint.config.js` used by `npm run lint` |
| Prettier | `esbenp.prettier-vscode` | Auto-formats on save using this repo's `.prettierrc` |
| Tailwind CSS IntelliSense | `bradlc.vscode-tailwindcss` | Class autocomplete/hover for `apps/web` |
| MongoDB for VS Code | `mongodb.mongodb-vscode` | Browse collections/run queries against your local dev database without leaving the editor |
| Docker | `ms-azuretools.vscode-docker` | Manage the `docker-compose.dev.yml`/`docker-compose.yml` containers from the editor |
| EditorConfig for VS Code | `editorconfig.editorconfig` | Respects `.editorconfig` if present, for consistent whitespace across editors |

Install all at once from the integrated terminal:

```bash
code --install-extension dbaeumer.vscode-eslint \
     --install-extension esbenp.prettier-vscode \
     --install-extension bradlc.vscode-tailwindcss \
     --install-extension mongodb.mongodb-vscode \
     --install-extension ms-azuretools.vscode-docker \
     --install-extension editorconfig.editorconfig
```

### Workspace settings

Create `.vscode/settings.json` (not committed — it's per-developer) with:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "eslint.workingDirectories": [
    { "mode": "auto" }
  ],
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

This mirrors what `npm run format` (Prettier) and `npm run lint` (ESLint) already enforce in CI — formatting and fixable lint issues on save just means you see them before pushing instead of after CI fails.

`.prettierrc` (repo root) already sets the actual style rules (2-space indent, single quotes, semicolons, 100-char print width, `prettier-plugin-tailwindcss` for class sorting) — you don't need to duplicate any of that in your editor settings, just point the editor at it.

### Debugging the API

Create `.vscode/launch.json` to attach the debugger to the API in dev mode:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug API (apps/api)",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev", "--workspace=api"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

Set breakpoints directly in `apps/api/src/**/*.ts` — `ts-node-dev` (used by `npm run dev --workspace=api`) serves source maps so breakpoints hit the TypeScript source, not compiled output.

## Other editors

- **WebStorm/IntelliJ**: enable the built-in ESLint and Prettier integrations (Settings → Languages & Frameworks → JavaScript), point Prettier at the repo's `.prettierrc`, and enable "Run on save" for both.
- **Neovim**: use `null-ls`/`conform.nvim` (or `efm-langserver`) wired to `eslint_d` and `prettierd`, both of which will pick up the repo's `eslint.config.js` and `.prettierrc` automatically.

Whatever editor you use, `npm run lint`, `npm run format`, and `npm run typecheck` at the repo root are the source of truth — editor integration is a convenience, not a substitute for running them (or letting the pre-commit hook run them) before pushing.
