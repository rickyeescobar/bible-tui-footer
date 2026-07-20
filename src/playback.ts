import * as Clock from "effect/Clock"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Scope from "effect/Scope"
import type { RSVPFrame } from "./domain.js"
import type { Reader } from "./reader.js"

export type PlaybackScope = Scope.Closeable

const NANOS_PER_MILLI = 1_000_000n

/**
 * Runs against monotonic deadlines so render and scheduler overhead do not
 * accumulate. Large stalls reset the deadline instead of flashing catch-up words.
 */
const playbackLoop = Effect.fn("playbackLoop")(function*(
  reader: Reader,
  onFrame: (frame: RSVPFrame) => void,
  frame: RSVPFrame,
  previousDeadline: bigint,
): Effect.fn.Return<void> {
  yield* Effect.sync(() => onFrame(frame))

  const delayNanos = BigInt(frame.delayMs) * NANOS_PER_MILLI
  const candidateDeadline = previousDeadline + delayNanos
  const now = yield* Clock.currentTimeNanos
  const deadline = now > candidateDeadline + delayNanos * 4n
    ? now + delayNanos
    : candidateDeadline
  const remaining = deadline - now
  if (remaining > 0n) yield* Effect.sleep(Duration.nanos(remaining))

  const next = yield* reader.advance
  return yield* playbackLoop(reader, onFrame, next, deadline)
})

export const startPlayback = Effect.fn("startPlayback")(function*(
  reader: Reader,
  onFrame: (frame: RSVPFrame) => void,
): Effect.fn.Return<PlaybackScope> {
  const scope = yield* Scope.make()
  const frame = yield* reader.current
  const startedAt = yield* Clock.currentTimeNanos
  yield* playbackLoop(reader, onFrame, frame, startedAt).pipe(Effect.forkIn(scope))
  return scope
})

export const stopPlayback = Effect.fn("stopPlayback")((scope: PlaybackScope | undefined) =>
  scope === undefined ? Effect.void : Scope.close(scope, Exit.void))
