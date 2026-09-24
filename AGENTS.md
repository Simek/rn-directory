# AGENTS.md

## Project overview

`rn-directory` is a Bun-based TypeScript CLI for proposing packages to [React Native Directory](https://reactnative.directory).
It can collect package metadata interactively or automatically, validate bundle information, and use the GitHub CLI to create a fork and pull request.

## Repository layout

- `index.ts` - CLI entry point, command dispatch, help handling, and top-level error handling.
- `commands/` - User-facing command handlers:
  - `submit.ts` - Interactive submission flow.
  - `autoSubmit.ts` - Automatic submission flow for the current package.
  - `checkBundle.ts` - Bundle configuration and contents checks.
  - `help.ts` - CLI usage output.
- `commands/common/` - Shared checks, actions, constants, and temporary-file handling used by commands.
- `types.ts` - Shared TypeScript types.
- `utils.ts` - Shared validation and utility functions.
- `package.json` - Bun package metadata, executable entry point, and scripts.
- `.oxlintrc.json` and `.oxfmtrc.json` - Lint and formatting rules.

## Development setup

Use Bun (version `1.4` or newer) and the GitHub CLI. Install dependencies before making changes:

```sh
bun install
```

For local executable testing, link the package:

```sh
bun run dev:prepare
```

The CLI can then be invoked as `rn-directory <command>`. The main commands are `submit`, `autoSubmit`, `checkBundle`, and `help`; `--help` and `-h` are also supported.

## Validation commands

Run the project's checks before submitting changes:

```sh
bun run lint
```

This runs type-aware Oxlint followed by Oxfmt check mode. To apply the repository's automatic fixes and formatting:

```sh
bun run lint:fix
```

There is currently no automated test script in `package.json`. When changing CLI behavior, manually exercise the affected command with a development build or linked executable, including its success and error paths.

## Coding conventions

- Keep code TypeScript and preserve the strict settings in `tsconfig.json`.
- Use Bun APIs and the existing project dependencies rather than introducing a Node-specific runtime dependency.
- Follow Oxfmt: two-space indentation, single quotes, a 120-column print width, and trailing commas where configured.
- Keep imports ordered by the Oxfmt configuration and use inline type imports where required by Oxlint.
- Prefer existing helpers in `utils.ts` and `commands/common/` over duplicating validation, filesystem, or GitHub CLI logic.
- Preserve explicit error reporting. Do not swallow command failures or turn invalid input into a successful submission.
- Keep user-facing prompts and messages clear and consistent with the existing `@clack/prompts` and `picocolors` usage.

## CLI and integration considerations

- Submission actions can create forks and pull requests through the GitHub CLI; do not trigger real submissions during routine validation.
- Validate repository, package, URL, and bundle inputs using the existing checks before calling external services.
- Keep temporary files and generated metadata out of the repository. Respect the ignore patterns in `commands/common/constants.ts`.
- When adding a command, wire it into the `commands` map in `index.ts`, add it to the interactive selector, and update `commands/help.ts` and `README.md`.
- Avoid changing the submission payload shape without checking the types, formatting pipeline, and React Native Directory expectations.hange workflow

## Change workflow

1. Read the affected command and any shared helper it uses.
2. Make the smallest change that addresses the behavior.
3. Run `bun run lint`.
4. Manually exercise changed CLI paths without creating a real pull request.
5. Update `README.md` when user-facing commands, prerequisites, or workflows change.
