import { assert, it } from "@effect/vitest"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as TestClock from "effect/testing/TestClock"
import { Bible, defaultProgress } from "../src/domain.js"
import { startPlayback, stopPlayback } from "../src/playback.js"
import { makeReader } from "../src/reader.js"

const bible = new Bible({
  books: ["Genesis"],
  wordCount: 3,
  verses: [[0, 1, 1, "In the beginning"]],
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
