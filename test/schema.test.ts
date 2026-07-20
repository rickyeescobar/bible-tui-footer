import { NodeFileSystem } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Equal, FileSystem } from "effect"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { loadBible } from "../src/bible.js"
import { SavedProgress, defaultProgress } from "../src/domain.js"
import { loadProgress, saveProgress } from "../src/progress.js"

const makeTemporaryFile = Effect.fn("makeTemporaryFile")(function*(name: string) {
  const fs = yield* FileSystem.FileSystem
  const directory = yield* fs.makeTempDirectoryScoped({
    directory: tmpdir(),
    prefix: "bible-tui-footer-test-",
  })
  return join(directory, name)
})

const withFileSystem = <A, E, R>(effect: Effect.Effect<A, E, R | FileSystem.FileSystem>) =>
  effect.pipe(Effect.provide(NodeFileSystem.layer))

describe("Schema validation", () => {
  it.effect("rejects compact Bible data with an invalid book index", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* makeTemporaryFile("bible.json")
      yield* fs.writeFileString(
        path,
        JSON.stringify({ books: ["Genesis"], verses: [[1, 1, 1, "In the beginning"]] }),
      )
      const exit = yield* Effect.exit(loadBible(path))
      assert.strictEqual(exit._tag, "Failure")
    }).pipe(
      Effect.scoped,
      withFileSystem,
    ))

  it.effect("falls back to defaults for malformed progress", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* makeTemporaryFile("progress.json")
      yield* fs.writeFileString(path, JSON.stringify({ enabled: "yes", wpm: -1 }))
      const progress = yield* loadProgress(path)
      assert.isTrue(Equal.equals(progress, defaultProgress))
    }).pipe(
      Effect.scoped,
      withFileSystem,
    ))

  it.effect("round-trips schema-backed progress", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* makeTemporaryFile("progress.json")
      const expected = new SavedProgress({
        enabled: true,
        verseIndex: 10,
        wordIndex: 3,
        wordsRead: 99,
        wpm: 600,
      })

      yield* saveProgress(path, expected)
      const actual = yield* loadProgress(path)
      const entries = yield* fs.readDirectory(dirname(path))

      assert.isTrue(Equal.equals(actual, expected))
      assert.deepStrictEqual(entries, ["progress.json"])
    }).pipe(
      Effect.scoped,
      withFileSystem,
    ))
})
