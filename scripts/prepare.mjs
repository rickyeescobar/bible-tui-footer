// Dev-only hook: patches tsgo for typechecking. Pi installs this package with
// `npm install --omit=dev`; without devDependencies there is nothing to prepare.
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
try {
  require.resolve("@effect/tsgo/package.json")
} catch {
  process.exit(0)
}

const result = spawnSync("effect-tsgo", ["patch"], {
  stdio: "inherit",
  shell: process.platform === "win32",
})
process.exit(result.status ?? 1)
