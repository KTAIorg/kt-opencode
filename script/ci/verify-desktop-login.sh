#!/usr/bin/env bash
set -euo pipefail

# Reuse each package's isolated test harness. No production credential is needed.
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
(
  cd packages/core
  bun run test test/ktai/desktop-login.test.ts
  bun run typecheck
)
(
  cd packages/server
  bun run test test/ktai-desktop.test.ts
  bun run typecheck
)
(
  cd packages/desktop
  bun run test src/main/lifecycle/desktop-login.test.ts
  bun run typecheck
)
