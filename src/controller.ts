import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Semaphore from "effect/Semaphore"
import { homedir } from "node:os"
import { join } from "node:path"
import { BibleLibrary } from "./bible.js"
import type { RSVPFrame } from "./domain.js"
import type { BibleDataError, ProgressError, ReaderError } from "./errors.js"
import { startPlayback, stopPlayback, type PlaybackScope } from "./playback.js"
import { loadProgress, saveProgress } from "./progress.js"
import { makeReader } from "./reader.js"

/** A user-facing notification for the host to display. */
export interface Notice {
  readonly message: string
  readonly severity: "info" | "warning" | "error"
}

export interface PlaybackHooks {
  /** Receives the initial frame just before playback begins; the host mounts its widget here. */
  readonly onMount: (frame: RSVPFrame) => void
  readonly onFrame: (frame: RSVPFrame) => void
  readonly onError: (error: BibleDataError) => void
}

export interface CommandHooks {
  readonly confirmRestart: Effect.Effect<boolean>
  readonly onFrame: (frame: RSVPFrame) => void
  readonly onHide: () => void
}

/** XDG Base Directory state home; empty counts as unset per the specification. */
const stateHome = Config.nonEmptyString("XDG_STATE_HOME").pipe(
  Config.orElse(() => Config.succeed(join(homedir(), ".local", "state"))),
)

export class FooterController extends Context.Service<FooterController, {
  readonly start: (hooks: PlaybackHooks) => Effect.Effect<void>
  readonly stop: Effect.Effect<void, ProgressError>
  readonly handleCommand: (
    input: string,
    hooks: CommandHooks,
  ) => Effect.Effect<Option.Option<Notice>, BibleDataError | ProgressError | ReaderError>
}>()("bible-tui-footer/FooterController") {
  static readonly layer = Layer.unwrap(Effect.gen(function*() {
    const directory = yield* stateHome
    return Layer.effect(
      FooterController,
      makeController(join(directory, "bible-tui-footer", "progress.json")),
    )
  }))
}

const info = (message: string): Option.Option<Notice> =>
  Option.some({ message, severity: "info" })

const usage = (message: string): Option.Option<Notice> =>
  Option.some({ message, severity: "error" })

export const makeController = Effect.fn("makeController")(function*(
  statePath: string,
): Effect.fn.Return<
  FooterController["Service"],
  BibleDataError | ProgressError,
  BibleLibrary | FileSystem.FileSystem
> {
  const library = yield* BibleLibrary
  const fileSystem = yield* FileSystem.FileSystem
  const saved = yield* loadProgress(statePath)
  const reader = yield* makeReader(library, saved)
  const persistenceLock = yield* Semaphore.make(1)
  const playbackLock = yield* Semaphore.make(1)
  const playbackRef = yield* Ref.make(Option.none<PlaybackScope>())

  const persist = persistenceLock.withPermit(
    reader.progress.pipe(Effect.flatMap((progress) => saveProgress(statePath, progress))),
  ).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem))

  /** Callers must hold playbackLock. */
  const swapPlayback = (next: Option.Option<PlaybackScope>) =>
    Ref.getAndSet(playbackRef, next).pipe(
      Effect.flatMap((previous) => stopPlayback(Option.getOrUndefined(previous))),
    )

  const closePlayback = playbackLock.withPermit(swapPlayback(Option.none()))

  const start = Effect.fn("FooterController.start")((hooks: PlaybackHooks) =>
    playbackLock.withPermit(Effect.gen(function*() {
      yield* swapPlayback(Option.none())
      const progress = yield* reader.progress
      if (!progress.enabled) return
      const frame = yield* reader.current
      yield* Effect.sync(() => hooks.onMount(frame))
      const scope = yield* startPlayback(reader, hooks.onFrame, hooks.onError)
      yield* Ref.set(playbackRef, Option.some(scope))
    })))

  const stop = closePlayback.pipe(Effect.andThen(persist))

  const handleCommand = Effect.fn("FooterController.handleCommand")(function*(
    input: string,
    hooks: CommandHooks,
  ): Effect.fn.Return<Option.Option<Notice>, BibleDataError | ProgressError | ReaderError> {
    const [command = "status", ...rest] = input.trim().split(/\s+/)
    const argument = rest.join(" ")

    switch (command.toLowerCase()) {
      case "on":
        yield* reader.setEnabled(true)
        yield* persist
        return info("Bible TUI Footer enabled")
      case "off":
        yield* reader.setEnabled(false)
        yield* closePlayback
        yield* persist
        yield* Effect.sync(hooks.onHide)
        return info("Bible TUI Footer disabled")
      case "speed": {
        const requested = Number(argument)
        if (!Number.isFinite(requested)) return usage("Usage: /bible speed <100-1200>")
        const wpm = yield* reader.setWpm(requested)
        yield* persist
        return info(`Bible TUI Footer speed set to ${wpm} WPM`)
      }
      case "goto": {
        if (!argument) return usage("Usage: /bible goto <book chapter:verse>")
        const next = yield* reader.goto(argument)
        yield* Effect.sync(() => hooks.onFrame(next))
        yield* persist
        return info(`Bible TUI Footer moved to ${next.reference}`)
      }
      case "restart": {
        const confirmed = yield* hooks.confirmRestart
        if (!confirmed) return Option.none()
        const next = yield* reader.reset
        yield* Effect.sync(() => hooks.onFrame(next))
        yield* persist
        return info("Bible TUI Footer restarted at Genesis 1:1")
      }
      case "status": {
        const [current, progress] = yield* Effect.all([reader.current, reader.progress])
        return info(
          `${progress.enabled ? "On" : "Off"} · ${current.reference} · ${progress.wpm} WPM · ${progress.wordsRead.toLocaleString()} words read`,
        )
      }
      default:
        return usage("Usage: /bible [on|off|speed <wpm>|goto <reference>|restart|status]")
    }
  })

  return FooterController.of({ start, stop, handleCommand })
})
