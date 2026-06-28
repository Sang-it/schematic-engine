import { registerSchematicMatchers } from "../src/matchers"

// Importing this module registers the custom `toMatchSchematicSvg` matcher.
registerSchematicMatchers()

// A chip with one pin on each side, so a passive can be driven onto every edge.
export const CHIP_4_SIDES = `
  <chip
    name="U1"
    pinPosition={{ left: ["pin1"], right: ["pin2"], top: ["pin3"], bottom: ["pin4"] }}
    connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C", pin4: "net.D" }}
  />
`
