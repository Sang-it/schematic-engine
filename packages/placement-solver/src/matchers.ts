import { expect } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"

function snapshotFile(testPath: string, name: string): string {
  return join(dirname(testPath), "__snapshots__", `${name}.snap.svg`)
}

/**
 * Custom matcher: compare an SVG string against an on-disk snapshot.
 *
 *   expect(svg).toMatchSchematicSvg(import.meta.path, "rc-low-pass")
 *
 * - First run (no snapshot) writes the file and passes.
 * - Later runs fail if the SVG changed.
 * - Set BUN_UPDATE_SNAPSHOTS=1 to overwrite snapshots (e.g. after changing the
 *   placement algorithm) instead of failing.
 */
export function registerSchematicMatchers(): void {
  // Cast: bun's expect.extend typing is stricter than our matcher shape.
  ;(
    expect as unknown as { extend: (m: Record<string, unknown>) => void }
  ).extend({
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
        return {
          pass: true,
          message: () => `schematic snapshot written: ${file}`,
        }
      }

      const expected = readFileSync(file, "utf8")
      const pass = expected === received
      return {
        pass,
        message: () =>
          pass
            ? `schematic matches snapshot ${file}`
            : `schematic SVG differs from snapshot ${file}\n` +
              `Run with BUN_UPDATE_SNAPSHOTS=1 to update it.`,
      }
    },
  })
}

declare module "bun:test" {
  interface Matchers<T> {
    toMatchSchematicSvg(testPath: string, name?: string): T
  }
}
