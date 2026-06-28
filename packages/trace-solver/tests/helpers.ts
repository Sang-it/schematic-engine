import { expect } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"

// Self-contained copy of placement-solver's snapshot matcher so the package is
// decoupled. expect(svg).toMatchSchematicSvg(import.meta.path[, name]).
function snapshotFile(testPath: string, name: string): string {
  return join(dirname(testPath), "__snapshots__", `${name}.snap.svg`)
}

;(expect as unknown as { extend: (m: Record<string, unknown>) => void }).extend(
  {
    toMatchSchematicSvg(
      this: unknown,
      received: unknown,
      testPath: string,
      name?: string,
    ) {
      if (typeof received !== "string") {
        return {
          pass: false,
          message: () => "toMatchSchematicSvg expects an SVG string",
        }
      }
      const snapName =
        name ?? basename(testPath).replace(/\.test\.[tj]sx?$/, "")
      const file = snapshotFile(testPath, snapName)
      const shouldUpdate = Boolean(process.env.BUN_UPDATE_SNAPSHOTS)

      if (shouldUpdate || !existsSync(file)) {
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, received)
        return { pass: true, message: () => `snapshot written: ${file}` }
      }

      const expected = readFileSync(file, "utf8")
      const pass = expected === received
      return {
        pass,
        message: () =>
          pass
            ? `schematic matches snapshot ${file}`
            : `schematic SVG differs from snapshot ${file}\nRun with BUN_UPDATE_SNAPSHOTS=1 to update it.`,
      }
    },
  },
)

declare module "bun:test" {
  interface Matchers<T> {
    toMatchSchematicSvg(testPath: string, name?: string): T
  }
}
