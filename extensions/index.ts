import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Semaphore from "effect/Semaphore"
import { homedir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { BibleLibrary } from "../src/bible.js"
import type { RSVPFrame } from "../src/domain.js"
import { startPlayback, stopPlayback, type PlaybackScope } from "../src/playback.js"
import { loadProgress, saveProgress } from "../src/progress.js"
import { makeReader, type Reader } from "../src/reader.js"
import { renderFocusWindow } from "../src/view.js"

const WIDGET_ID = "bible-tui-footer"
const BIBLE_PATH = fileURLToPath(new URL("../data", import.meta.url))
const STATE_PATH = join(
  process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
  "bible-tui-footer",
  "progress.json",
)

export default function bibleTuiFooter(pi: ExtensionAPI) {
  const runtimeLayer = BibleLibrary.layer(BIBLE_PATH).pipe(
    Layer.provideMerge(NodeFileSystem.layer),
  )
  const runtime = ManagedRuntime.make(runtimeLayer)
  const run = <A, E>(effect: Effect.Effect<A, E, BibleLibrary | FileSystem.FileSystem>): Promise<A> =>
    runtime.runPromise(effect)
  let reader: Reader | undefined
  let frame: RSVPFrame | undefined
  let playback: PlaybackScope | undefined
  let initialization: Promise<void> | undefined
  let active = true
  let requestRender: () => void = () => {}

  const persistenceLock = Semaphore.makeUnsafe(1)
  const playbackLock = Semaphore.makeUnsafe(1)

  const initialize = (ctx: ExtensionContext): Promise<void> => {
    if (initialization !== undefined) return initialization

    const setup = Effect.gen(function* () {
      const [library, progress] = yield* Effect.all([
        BibleLibrary,
        loadProgress(STATE_PATH),
      ])
      const initializedReader = yield* makeReader(library, progress)
      if (active) reader = initializedReader
    }).pipe(
      Effect.catchCause((cause) => Effect.sync(() => {
        if (active) ctx.ui.notify(`Bible TUI Footer failed to load: ${Cause.pretty(cause)}`, "error")
      })),
    )

    initialization = run(setup)
    return initialization
  }

  const persist = Effect.fn("BibleTuiFooter.persist")(function*() {
    yield* persistenceLock.withPermit(
      reader === undefined
        ? Effect.void
        : reader.progress.pipe(Effect.flatMap((progress) => saveProgress(STATE_PATH, progress))),
    )
  })

  const closePlayback = Effect.fn("BibleTuiFooter.closePlayback")(function*() {
    yield* playbackLock.withPermit(
      stopPlayback(playback).pipe(
        Effect.tap(() => Effect.sync(() => { playback = undefined })),
      ),
    )
  })

  const stop = Effect.fn("BibleTuiFooter.stop")((
    ctx: ExtensionContext,
    hideWidget: boolean,
  ) =>
    closePlayback().pipe(
      Effect.andThen(persist().pipe(
        Effect.catch((error) => Effect.sync(() => {
          ctx.ui.notify(`Bible TUI Footer could not save progress: ${String(error)}`, "warning")
        })),
      )),
      Effect.andThen(Effect.sync(() => {
        if (hideWidget && ctx.mode === "tui") ctx.ui.setWidget(WIDGET_ID, undefined)
      })),
    ))

  const start = Effect.fn("BibleTuiFooter.start")(function*(ctx: ExtensionContext) {
    yield* Effect.promise(() => initialize(ctx))
    if (ctx.mode !== "tui" || reader === undefined) return

    const initializedReader = reader
    const progress = yield* initializedReader.progress
    if (!progress.enabled) return

    yield* playbackLock.withPermit(Effect.gen(function*() {
      yield* stopPlayback(playback)
      playback = undefined
      frame = yield* initializedReader.current

      ctx.ui.setWidget(WIDGET_ID, (tui, theme) => {
        let cachedFrame: RSVPFrame | undefined
        let cachedWidth = -1
        let cachedLines: Array<string> = []
        requestRender = () => tui.requestRender()
        return {
          invalidate() {
            cachedFrame = undefined
          },
          render(width: number): string[] {
            if (frame === undefined) return []
            if (cachedFrame === frame && cachedWidth === width) return cachedLines

            cachedFrame = frame
            cachedWidth = width
            cachedLines = [...renderFocusWindow(frame, width, {
              accent: (text) => theme.fg("accent", text),
              dim: (text) => theme.fg("dim", text),
              muted: (text) => theme.fg("muted", text),
              bold: (text) => theme.bold(text),
            })]
            return cachedLines
          },
        }
      }, { placement: "aboveEditor" })

      playback = yield* startPlayback(
        initializedReader,
        (nextFrame) => {
          frame = nextFrame
          requestRender()
        },
        (error) => ctx.ui.notify(`Bible TUI Footer playback failed: ${String(error)}`, "error"),
      )
    }))
  })

  pi.on("session_start", (_event, ctx) => {
    // Preload without blocking Pi startup; agent_start and commands await the same promise.
    void initialize(ctx)
  })

  pi.on("agent_start", async (_event, ctx) => {
    await run(start(ctx).pipe(
      Effect.catchCause((cause) => Effect.sync(() => {
        ctx.ui.notify(`Bible TUI Footer playback failed: ${Cause.pretty(cause)}`, "error")
      })),
    ))
  })

  pi.on("agent_settled", async (_event, ctx) => {
    await run(stop(ctx, true))
  })

  pi.on("session_shutdown", async (_event, ctx) => {
    active = false
    await run(stop(ctx, true))
    await runtime.dispose()
  })

  pi.registerCommand("bible", {
    description: "Control the Bible TUI Footer RSVP reader",
    handler: async (rawArgs, ctx) => {
      await initialize(ctx)
      if (reader === undefined) {
        ctx.ui.notify("Bible TUI Footer could not be initialized", "warning")
        return
      }
      const initializedReader = reader

      const args = rawArgs.trim()
      const [command = "status", ...rest] = args.split(/\s+/)
      const argument = rest.join(" ")

      const program = Effect.gen(function* () {
        switch (command.toLowerCase()) {
          case "on":
            yield* initializedReader.setEnabled(true)
            yield* persist()
            ctx.ui.notify("Bible TUI Footer enabled", "info")
            return
          case "off":
            yield* initializedReader.setEnabled(false)
            yield* stop(ctx, true)
            ctx.ui.notify("Bible TUI Footer disabled", "info")
            return
          case "speed": {
            const requested = Number(argument)
            if (!Number.isFinite(requested)) {
              ctx.ui.notify("Usage: /bible speed <100-1200>", "error")
              return
            }
            const wpm = yield* initializedReader.setWpm(requested)
            yield* persist()
            ctx.ui.notify(`Bible TUI Footer speed set to ${wpm} WPM`, "info")
            return
          }
          case "goto": {
            if (!argument) {
              ctx.ui.notify("Usage: /bible goto <book chapter:verse>", "error")
              return
            }
            const next = yield* initializedReader.goto(argument)
            frame = next
            requestRender()
            yield* persist()
            ctx.ui.notify(`Bible TUI Footer moved to ${next.reference}`, "info")
            return
          }
          case "restart": {
            const confirmed = yield* Effect.promise(() => ctx.ui.confirm(
              "Restart Bible TUI Footer?",
              "Return to Genesis 1:1 and reset the word count?",
            ))
            if (!confirmed) return
            frame = yield* initializedReader.reset
            requestRender()
            yield* persist()
            ctx.ui.notify("Bible TUI Footer restarted at Genesis 1:1", "info")
            return
          }
          case "status": {
            const [current, progress] = yield* Effect.all([
              initializedReader.current,
              initializedReader.progress,
            ])
            ctx.ui.notify(
              `${progress.enabled ? "On" : "Off"} · ${current.reference} · ${progress.wpm} WPM · ${progress.wordsRead.toLocaleString()} words read`,
              "info",
            )
            return
          }
          default:
            ctx.ui.notify("Usage: /bible [on|off|speed <wpm>|goto <reference>|restart|status]", "error")
        }
      })

      await run(program.pipe(
        Effect.catch((error) => Effect.sync(() => {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error")
        })),
      ))
    },
  })
}
