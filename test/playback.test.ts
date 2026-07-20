import { assert, it } from "@effect/vitest"
import { Duration, Effect } from "effect"
import { TestClock } from "effect/testing"
import { Bible, Verse, defaultProgress } from "../src/domain.js"
import { startPlayback, stopPlayback } from "../src/playback.js"
import { makeReader } from "../src/reader.js"

const bible = new Bible({
  books: ["Genesis"],
  wordCount: 3,
  verses: [new Verse({ book: "Genesis", chapter: 1, verse: 1, text: "In the beginning" })],
})

it.effect("advances playback according to the Effect clock", () =>
  Effect.gen(function*() {
    const reader = yield* makeReader(bible, defaultProgress)
    const words: Array<string> = []
    const scope = yield* startPlayback(reader, (frame) => words.push(frame.word))

    yield* Effect.yieldNow
    assert.deepStrictEqual(words, ["In"])

    const current = yield* reader.current
    yield* TestClock.adjust(Duration.millis(current.delayMs))
    yield* Effect.yieldNow
    assert.deepStrictEqual(words, ["In", "the"])

    yield* stopPlayback(scope)
  }))
