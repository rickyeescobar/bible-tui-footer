import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Option from "effect/Option"
import { fileURLToPath } from "node:url"
import { BibleLibrary } from "../src/bible.js"
import { FooterController, type PlaybackHooks } from "../src/controller.js"
import type { RSVPFrame } from "../src/domain.js"
import { renderFocusWindow } from "../src/view.js"

const WIDGET_ID = "bible-tui-footer"
const BIBLE_PATH = fileURLToPath(new URL("../data", import.meta.url))

export default function bibleTuiFooter(pi: ExtensionAPI) {
  const runtime = ManagedRuntime.make(
    FooterController.layer.pipe(
      Layer.provide(BibleLibrary.layer(BIBLE_PATH)),
      Layer.provide(NodeFileSystem.layer),
    ),
  )

  // Pi's render() is synchronous, so the latest frame lives in a mutable slot the hooks update.
  let frame: RSVPFrame | undefined
  let requestRender: () => void = () => {}
  let failureNotified = false

  // Layer-build failures surface in the Exit, not inside the effect, so they are handled here.
  // Passive lifecycle events notify at most once; explicit commands always notify.
  const runNotifying = async (
    ctx: ExtensionContext,
    effect: Effect.Effect<unknown, never, FooterController>,
    options?: { readonly always?: boolean },
  ): Promise<void> => {
    const exit = await runtime.runPromiseExit(effect)
    if (Exit.isFailure(exit) && (options?.always || !failureNotified)) {
      failureNotified = true
      ctx.ui.notify(`Bible TUI Footer failed to load: ${Cause.pretty(exit.cause)}`, "error")
    }
  }

  const showWidget = (ctx: ExtensionContext) => {
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
  }

  const hideWidget = (ctx: ExtensionContext) => {
    if (ctx.mode === "tui") ctx.ui.setWidget(WIDGET_ID, undefined)
  }

  const onFrame = (next: RSVPFrame) => {
    frame = next
    requestRender()
  }

  const playbackHooks = (ctx: ExtensionContext): PlaybackHooks => ({
    onMount: (initial) => {
      frame = initial
      showWidget(ctx)
    },
    onFrame,
    onError: (error) => {
      ctx.ui.notify(`Bible TUI Footer playback failed: ${error.message}`, "error")
    },
  })

  const stopAndHide = (ctx: ExtensionContext) =>
    Effect.flatMap(FooterController, (controller) => controller.stop).pipe(
      Effect.catch((error) => Effect.sync(() => {
        ctx.ui.notify(`Bible TUI Footer could not save progress: ${error.message}`, "warning")
      })),
      Effect.andThen(Effect.sync(() => hideWidget(ctx))),
    )

  pi.on("session_start", (_event, ctx) => {
    // Preload without blocking Pi startup; ManagedRuntime caches the layer build for later events.
    void runNotifying(ctx, Effect.asVoid(FooterController))
  })

  pi.on("agent_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return
    await runNotifying(
      ctx,
      Effect.flatMap(FooterController, (controller) => controller.start(playbackHooks(ctx))),
    )
  })

  pi.on("agent_settled", async (_event, ctx) => {
    await runNotifying(ctx, stopAndHide(ctx))
  })

  pi.on("session_shutdown", async (_event, ctx) => {
    await runtime.runPromiseExit(stopAndHide(ctx))
    await runtime.dispose()
  })

  pi.registerCommand("bible", {
    description: "Control the Bible TUI Footer RSVP reader",
    handler: async (rawArgs, ctx) => {
      await runNotifying(
        ctx,
        Effect.flatMap(FooterController, (controller) =>
          controller.handleCommand(rawArgs, {
            confirmRestart: Effect.promise(() => ctx.ui.confirm(
              "Restart Bible TUI Footer?",
              "Return to Genesis 1:1 and reset the word count?",
            )),
            onFrame,
            onHide: () => hideWidget(ctx),
          })).pipe(
          Effect.flatMap((notice) => Option.match(notice, {
            onNone: () => Effect.void,
            onSome: ({ message, severity }) => Effect.sync(() => ctx.ui.notify(message, severity)),
          })),
          Effect.catch((error) => Effect.sync(() => {
            ctx.ui.notify(error.message, "error")
          })),
        ),
        { always: true },
      )
    },
  })
}
