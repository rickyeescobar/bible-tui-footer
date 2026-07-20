import { assert, it } from "@effect/vitest"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as TestClock from "effect/testing/TestClock"
import { BibleLibrary } from "../src/bible.js"
import { BibleBook, BibleManifest, BookInfo, defaultProgress } from "../src/domain.js"
import { startPlayback, stopPlayback } from "../src/playback.js"
import { makeReader } from "../src/reader.js"

const genesis = new BookInfo({ name: "Genesis", verseOffset: 0, verseCount: 1, file: "books/0.json" })
const book = new BibleBook({ info: genesis, verses: [[1, 1, "In the beginning"]] })
const library = BibleLibrary.of({
  manifest: new BibleManifest({
    version: 1,
    books: [genesis],
    totalVerses: 1,
    wordCount: 3,
  }),
  loadBook: () => Effect.succeed(book),
})

it.effect("advances playback according to the Effect clock", () =>
  Effect.gen(function*() {
    const reader = yield* makeReader(library, defaultProgress)
    const words: Array<string> = []
    const scope = yield* startPlayback(reader, (frame) => words.push(frame.word), () => {})

    yield* Effect.yieldNow
    assert.deepStrictEqual(words, ["In"])

    const current = yield* reader.current
    yield* TestClock.adjust(Duration.millis(current.delayMs))
    yield* Effect.yieldNow
    assert.deepStrictEqual(words, ["In", "the"])

    yield* stopPlayback(scope)
  }))
