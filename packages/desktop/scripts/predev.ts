import { $ } from "bun"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { downloadCliToResources, windowsify } from "./utils"

const electron = join(
  dirname(fileURLToPath(import.meta.resolve("electron"))),
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
)
if (!(await Bun.file(electron).exists())) await $`bun run install-electron`

await $`bun ./scripts/copy-icons.ts ${process.env.OPENCODE_CHANNEL ?? "dev"}`

if (!(await Bun.file("../opencode/dist/node/node.js").exists())) await $`cd ../opencode && bun script/build-node.ts`
if (!(await Bun.file(windowsify("resources/opencode-cli")).exists())) await downloadCliToResources()
