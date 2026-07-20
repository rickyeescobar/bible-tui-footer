import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BibleLibrary } from "../src/bible.js"
import { FooterController, makeController, type CommandHooks } from "../src/controller.js"
import { BibleBook, BibleManifest, BookInfo, type RSVPFrame } from "../src/domain.js"
import { loadProgress } from "../src/progress.js"

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

const makeTestController = Effect.fn("makeTestController")(function*() {
  const fs = yield* FileSystem.FileSystem
  const directory = yield* fs.makeTempDirectoryScoped({
    directory: tmpdir(),
    prefix: "bible-tui-footer-test-",
  })
  const statePath = join(directory, "progress.json")
  const controller = yield* makeController(statePath).pipe(
    Effect.provideService(BibleLibrary, library),
  )
  return { controller, statePath }
})

const makeCommandHooks = (confirm = true) => {
  const frames: Array<RSVPFrame> = []
  let hidden = 0
  const hooks: CommandHooks = {
    confirmRestart: Effect.sync(() => confirm),
    onFrame: (frame) => {
      frames.push(frame)
    },
    onHide: () => {
      hidden++
    },
  }
  return { hooks, frames, hiddenCount: () => hidden }
}

const withFileSystem = <A, E, R>(effect: Effect.Effect<A, E, R | FileSystem.FileSystem>) =>
  effect.pipe(Effect.provide(NodeFileSystem.layer))

describe("FooterController", () => {
  it.effect("reports status", () =>
    Effect.gen(function*() {
      const { controller } = yield* makeTestController()
      const { hooks } = makeCommandHooks()
      const notice = yield* controller.handleCommand("status", hooks)
      assert.isTrue(Option.isSome(notice))
      assert.strictEqual(Option.getOrThrow(notice).message, "On · Genesis 1:1 · 450 WPM · 0 words read")
    }).pipe(Effect.scoped, withFileSystem))

  it.effect("sets speed and persists it", () =>
    Effect.gen(function*() {
      const { controller, statePath } = yield* makeTestController()
      const { hooks } = makeCommandHooks()
      const notice = yield* controller.handleCommand("speed 700", hooks)
      assert.strictEqual(Option.getOrThrow(notice).message, "Bible TUI Footer speed set to 700 WPM")
      assert.strictEqual((yield* loadProgress(statePath)).wpm, 700)
    }).pipe(Effect.scoped, withFileSystem))

  it.effect("rejects a malformed speed", () =>
    Effect.gen(function*() {
      const { controller } = yield* makeTestController()
      const { hooks } = makeCommandHooks()
      const notice = yield* controller.handleCommand("speed fast", hooks)
      assert.strictEqual(Option.getOrThrow(notice).severity, "error")
    }).pipe(Effect.scoped, withFileSystem))

  it.effect("moves with goto, emits the frame, and persists", () =>
    Effect.gen(function*() {
      const { controller, statePath } = yield* makeTestController()
      const { hooks, frames } = makeCommandHooks()
      const notice = yield* controller.handleCommand("goto John 1:1", hooks)
      assert.strictEqual(Option.getOrThrow(notice).message, "Bible TUI Footer moved to John 1:1")
      assert.strictEqual(frames[0]?.reference, "John 1:1")
      assert.strictEqual((yield* loadProgress(statePath)).verseIndex, 1)
    }).pipe(Effect.scoped, withFileSystem))

  it.effect("fails goto for an unknown passage", () =>
    Effect.gen(function*() {
      const { controller } = yield* makeTestController()
      const { hooks } = makeCommandHooks()
      const exit = yield* Effect.exit(controller.handleCommand("goto Mark 1:1", hooks))
      assert.strictEqual(exit._tag, "Failure")
    }).pipe(Effect.scoped, withFileSystem))

  it.effect("disables and hides with off", () =>
    Effect.gen(function*() {
      const { controller, statePath } = yield* makeTestController()
      const { hooks, hiddenCount } = makeCommandHooks()
      yield* controller.handleCommand("off", hooks)
      assert.strictEqual(hiddenCount(), 1)
      assert.isFalse((yield* loadProgress(statePath)).enabled)
    }).pipe(Effect.scoped, withFileSystem))

  it.effect("leaves position unchanged when restart is declined", () =>
    Effect.gen(function*() {
      const { controller } = yield* makeTestController()
      const declined = makeCommandHooks(false)
      yield* controller.handleCommand("goto John 1:1", declined.hooks)
      const notice = yield* controller.handleCommand("restart", declined.hooks)
      assert.isTrue(Option.isNone(notice))
      const status = yield* controller.handleCommand("status", declined.hooks)
      assert.include(Option.getOrThrow(status).message, "John 1:1")
    }).pipe(Effect.scoped, withFileSystem))

  it.effect("restarts at Genesis 1:1 when confirmed", () =>
    Effect.gen(function*() {
      const { controller, statePath } = yield* makeTestController()
      const { hooks, frames } = makeCommandHooks()
      yield* controller.handleCommand("goto John 1:1", hooks)
      const notice = yield* controller.handleCommand("restart", hooks)
      assert.strictEqual(Option.getOrThrow(notice).message, "Bible TUI Footer restarted at Genesis 1:1")
      assert.strictEqual(frames.at(-1)?.reference, "Genesis 1:1")
      assert.strictEqual((yield* loadProgress(statePath)).verseIndex, 0)
    }).pipe(Effect.scoped, withFileSystem))

  it.effect("resolves its state path from XDG_STATE_HOME configuration", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped({
        directory: tmpdir(),
        prefix: "bible-tui-footer-test-",
      })
      const { hooks } = makeCommandHooks()

      yield* Effect.gen(function*() {
        const controller = yield* FooterController
        yield* controller.handleCommand("speed 700", hooks)
      }).pipe(
        Effect.provide(FooterController.layer.pipe(
          Layer.provide(Layer.succeed(BibleLibrary)(library)),
          Layer.provide(ConfigProvider.layer(
            ConfigProvider.fromUnknown({ XDG_STATE_HOME: directory }),
          )),
        )),
      )

      const statePath = join(directory, "bible-tui-footer", "progress.json")
      assert.strictEqual((yield* loadProgress(statePath)).wpm, 700)
    }).pipe(Effect.scoped, withFileSystem))

  it.effect("mounts playback when enabled and skips when disabled", () =>
    Effect.gen(function*() {
      const { controller } = yield* makeTestController()
      const mounted: Array<RSVPFrame> = []
      const playbackHooks = {
        onMount: (initial: RSVPFrame) => {
          mounted.push(initial)
        },
        onFrame: () => {},
        onError: () => {},
      }

      yield* controller.start(playbackHooks)
      assert.strictEqual(mounted.length, 1)
      assert.strictEqual(mounted[0]?.reference, "Genesis 1:1")
      yield* controller.stop

      const { hooks } = makeCommandHooks()
      yield* controller.handleCommand("off", hooks)
      yield* controller.start(playbackHooks)
      assert.strictEqual(mounted.length, 1)
    }).pipe(Effect.scoped, withFileSystem))
})
