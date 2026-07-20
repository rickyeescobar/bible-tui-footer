import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { writeFileStringAtomic } from "./files.js"
import { SavedProgress, defaultProgress } from "./domain.js"
import { ProgressError } from "./errors.js"

const ProgressJsonSchema = Schema.fromJsonString(SavedProgress)

export const loadProgress = Effect.fn("loadProgress")(function*(
  path: string,
): Effect.fn.Return<SavedProgress, ProgressError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem
  const source = yield* fs.readFileString(path).pipe(
    Effect.map(Option.some),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(Option.none())),
    Effect.mapError((cause) => new ProgressError({
      message: `Unable to load progress from ${path}`,
      cause,
    })),
  )

  if (Option.isNone(source)) return defaultProgress

  return yield* Schema.decodeUnknownEffect(ProgressJsonSchema)(source.value).pipe(
    Effect.orElseSucceed(() => defaultProgress),
  )
})

export const saveProgress = Effect.fn("saveProgress")(function*(
  path: string,
  progress: SavedProgress,
): Effect.fn.Return<void, ProgressError, FileSystem.FileSystem> {
  const source = yield* Schema.encodeUnknownEffect(ProgressJsonSchema)(progress).pipe(
    Effect.mapError((cause) => new ProgressError({
      message: "Progress failed schema validation",
      cause,
    })),
  )

  yield* writeFileStringAtomic(path, `${source}\n`).pipe(
    Effect.mapError((cause) => new ProgressError({
      message: `Unable to save progress at ${path}`,
      cause,
    })),
  )
})
