import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as FileSystem from "effect/FileSystem"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { makeBibleLibrary } from "../src/bible.js"
import { SavedProgress, defaultProgress } from "../src/domain.js"
import { loadProgress, saveProgress } from "../src/progress.js"

const makeTemporaryDirectory = Effect.fn("makeTemporaryDirectory")(function*() {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.makeTempDirectoryScoped({
    directory: tmpdir(),
    prefix: "bible-tui-footer-test-",
  })
})

const withFileSystem = <A, E, R>(effect: Effect.Effect<A, E, R | FileSystem.FileSystem>) =>
  effect.pipe(Effect.provide(NodeFileSystem.layer))

describe("Schema validation", () => {
  it.effect("rejects book data that does not match its manifest", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* makeTemporaryDirectory()
      yield* fs.makeDirectory(join(directory, "books"))
      yield* fs.writeFileString(join(directory, "manifest.json"), JSON.stringify({
        version: 1,
        wordCount: 3,
        totalVerses: 1,
        books: [{ name: "Genesis", verseOffset: 0, verseCount: 1, file: "books/0.json" }],
      }))
      yield* fs.writeFileString(join(directory, "books/0.json"), JSON.stringify({
        bookIndex: 1,
        verses: [[1, 1, "In the beginning"]],
      }))

      const library = yield* makeBibleLibrary(directory)
      const exit = yield* Effect.exit(library.loadBook(0))
      assert.strictEqual(exit._tag, "Failure")
    }).pipe(
      Effect.scoped,
      withFileSystem,
    ))

  it.effect("falls back to defaults for malformed progress", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* makeTemporaryDirectory()
      const path = join(directory, "progress.json")
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
      const directory = yield* makeTemporaryDirectory()
      const path = join(directory, "progress.json")
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
