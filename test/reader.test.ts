import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { BibleLibrary } from "../src/bible.js"
import { BibleBook, BibleManifest, BookInfo, defaultProgress } from "../src/domain.js"
import { makeReader } from "../src/reader.js"

const genesis = new BookInfo({ name: "Genesis", verseOffset: 0, verseCount: 1, file: "books/0.json" })
const john = new BookInfo({ name: "John", verseOffset: 1, verseCount: 1, file: "books/1.json" })
const books = [
  new BibleBook({ info: genesis, verses: [[1, 1, "In the beginning"]] }),
  new BibleBook({ info: john, verses: [[1, 1, "In the beginning was the Word"]] }),
]
const library = BibleLibrary.of({
  manifest: new BibleManifest({
    version: 1,
    books: [genesis, john],
    totalVerses: 2,
    wordCount: 8,
  }),
  loadBook: (bookIndex) => Effect.succeed(books[bookIndex]!),
})

describe("Reader", () => {
  it.effect("advances through words and lazily loaded books", () =>
    Effect.gen(function*() {
      const reader = yield* makeReader(library, defaultProgress)
      assert.strictEqual((yield* reader.current).word, "In")
      assert.strictEqual((yield* reader.advance).word, "the")
      assert.strictEqual((yield* reader.advance).word, "beginning")
      const nextVerse = yield* reader.advance
      assert.strictEqual(nextVerse.reference, "John 1:1")
      assert.strictEqual(nextVerse.word, "In")
    }))

  it.effect("navigates by Bible reference", () =>
    Effect.gen(function*() {
      const reader = yield* makeReader(library, defaultProgress)
      const frame = yield* reader.goto("john 1:1")
      assert.strictEqual(frame.reference, "John 1:1")
    }))

  it.effect("clamps configured speed", () =>
    Effect.gen(function*() {
      const reader = yield* makeReader(library, defaultProgress)
      assert.strictEqual(yield* reader.setWpm(50), 100)
      assert.strictEqual(yield* reader.setWpm(2_000), 1_200)
    }))
})
