import * as Clock from "effect/Clock"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Scope from "effect/Scope"
import type { RSVPFrame } from "./domain.js"
import type { BibleDataError } from "./errors.js"
import type { Reader } from "./reader.js"

export type PlaybackScope = Scope.Closeable

const NANOS_PER_MILLI = 1_000_000n

export const startPlayback = Effect.fn("startPlayback")(function*(
  reader: Reader,
  onFrame: (frame: RSVPFrame) => void,
  onError: (error: BibleDataError) => void,
): Effect.fn.Return<PlaybackScope> {
  const scope = yield* Scope.make()
  let frame = yield* reader.current
  let deadline = yield* Clock.currentTimeNanos

  /**
   * Runs against monotonic deadlines so render and scheduler overhead do not
   * accumulate. Large stalls reset the deadline instead of flashing catch-up
   * words. Iterated with Effect.forever and untraced because generator
   * self-recursion and per-word spans both grow without bound over a session.
   */
  const step = Effect.fnUntraced(function*(): Effect.fn.Return<void, BibleDataError> {
    yield* Effect.sync(() => onFrame(frame))

    const delayNanos = BigInt(frame.delayMs) * NANOS_PER_MILLI
    const candidateDeadline = deadline + delayNanos
    const now = yield* Clock.currentTimeNanos
    deadline = now > candidateDeadline + delayNanos * 4n
      ? now + delayNanos
      : candidateDeadline
    const remaining = deadline - now
    if (remaining > 0n) yield* Effect.sleep(Duration.nanos(remaining))

    frame = yield* reader.advance
  })

  yield* Effect.forever(step()).pipe(
    Effect.catch((error) => Effect.sync(() => onError(error))),
    Effect.forkIn(scope),
  )
  return scope
})

export const stopPlayback = Effect.fn("stopPlayback")((scope: PlaybackScope | undefined) =>
  scope === undefined ? Effect.void : Scope.close(scope, Exit.void))
