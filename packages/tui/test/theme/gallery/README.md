# TUI theme screenshot gallery

This gallery runs one repeatable OpenCode Drive workflow for every V1 theme in a directory. Each theme runs in
light and dark mode and produces a flat set of screenshots covering the home screen, markdown, permission prompt,
form prompt, and session switcher.

It expects `opencode-drive` to be installed globally and available on `PATH`.

The checked-in fixtures include selected built-in OpenCode themes and community themes from
[`vaprdev/opencode-themes`](https://github.com/vaprdev/opencode-themes). Theme-specific attribution and licenses
remain documented in that source repository.

## Run

Place theme JSON files in `themes/`, then run from the repository root:

```sh
bun packages/tui/test/theme/gallery/run.ts
```

Custom input and output directories can be passed as positional arguments:

```sh
bun packages/tui/test/theme/gallery/run.ts ./my-themes ./theme-screenshots
```

Output files are named `<theme>-<mode>-<state>.png` in one flat directory. Existing files with the same names are
overwritten. Runs are sequential so each isolated OpenCode Drive instance owns its own ports and artifacts.

The current TUI discovers V1 theme files and migrates them to V2 at runtime. Native V2 JSON files are reported as
unsupported and make the runner exit nonzero; they are not converted or silently rendered with a fallback theme.

Before changing the scenario, typecheck it with:

```sh
opencode-drive check packages/tui/test/theme/gallery/scenario.ts
```
