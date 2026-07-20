import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { BibleCommand, parseCommand } from "../src/command.js"

describe("parseCommand", () => {
  it.effect("parses bare verbs case-insensitively", () =>
    Effect.gen(function*() {
      assert.deepStrictEqual(yield* parseCommand("on"), BibleCommand.On())
      assert.deepStrictEqual(yield* parseCommand("OFF"), BibleCommand.Off())
      assert.deepStrictEqual(yield* parseCommand("Status"), BibleCommand.Status())
      assert.deepStrictEqual(yield* parseCommand(" restart "), BibleCommand.Restart())
    }))

  it.effect("parses a numeric speed", () =>
    Effect.gen(function*() {
      assert.deepStrictEqual(yield* parseCommand("speed 700"), BibleCommand.Speed({ wpm: 700 }))
    }))

  it.effect("fails a missing or malformed speed with usage", () =>
    Effect.gen(function*() {
      const missing = yield* Effect.flip(parseCommand("speed"))
      const malformed = yield* Effect.flip(parseCommand("speed fast"))
      assert.strictEqual(missing.message, "Usage: /bible speed <100-1200>")
      assert.strictEqual(malformed._tag, "UsageError")
    }))

  it.effect("keeps multi-word goto references intact", () =>
    Effect.gen(function*() {
      assert.deepStrictEqual(
        yield* parseCommand("goto Song of Solomon 1:1"),
        BibleCommand.Goto({ reference: "Song of Solomon 1:1" }),
      )
    }))

  it.effect("fails a missing goto reference with usage", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(parseCommand("goto"))
      assert.strictEqual(error.message, "Usage: /bible goto <book chapter:verse>")
    }))

  it.effect("fails empty input and unknown verbs with usage", () =>
    Effect.gen(function*() {
      const general = "Usage: /bible [on|off|speed <wpm>|goto <reference>|restart|status]"
      assert.strictEqual((yield* Effect.flip(parseCommand(""))).message, general)
      assert.strictEqual((yield* Effect.flip(parseCommand("   "))).message, general)
      assert.strictEqual((yield* Effect.flip(parseCommand("read faster"))).message, general)
    }))
})
