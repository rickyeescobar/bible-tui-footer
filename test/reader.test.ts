import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { Bible, defaultProgress } from "../src/domain.js"
import { makeReader } from "../src/reader.js"

const bible = new Bible({
  books: ["Genesis", "John"],
  wordCount: 8,
  verses: [
    [0, 1, 1, "In the beginning"],
    [1, 1, 1, "In the beginning was the Word"],
  ],
})

describe("Reader", () => {
  it.effect("advances through words and verses", () =>
    Effect.gen(function*() {
      const reader = yield* makeReader(bible, defaultProgress)
      assert.strictEqual((yield* reader.current).word, "In")
      assert.strictEqual((yield* reader.advance).word, "the")
      assert.strictEqual((yield* reader.advance).word, "beginning")
      const nextVerse = yield* reader.advance
      assert.strictEqual(nextVerse.reference, "John 1:1")
      assert.strictEqual(nextVerse.word, "In")
    }))

  it.effect("navigates by Bible reference", () =>
    Effect.gen(function*() {
      const reader = yield* makeReader(bible, defaultProgress)
      const frame = yield* reader.goto("john 1:1")
      assert.strictEqual(frame.reference, "John 1:1")
    }))

  it.effect("clamps configured speed", () =>
    Effect.gen(function*() {
      const reader = yield* makeReader(bible, defaultProgress)
      assert.strictEqual(yield* reader.setWpm(50), 100)
      assert.strictEqual(yield* reader.setWpm(2_000), 1_200)
    }))
})
