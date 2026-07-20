import { Effect, FileSystem, type PlatformError } from "effect"
import { dirname } from "node:path"

/** Writes beside the destination and atomically renames on successful completion. */
export const writeFileStringAtomic = Effect.fn("writeFileStringAtomic")(function*(
  path: string,
  data: string,
): Effect.fn.Return<void, PlatformError.PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem
  const directory = dirname(path)
  yield* fs.makeDirectory(directory, { recursive: true })

  yield* Effect.scoped(
    Effect.gen(function*() {
      const temporaryPath = yield* fs.makeTempFileScoped({
        directory,
        prefix: ".bible-tui-footer-",
        suffix: ".tmp",
      })
      yield* fs.writeFileString(temporaryPath, data)
      yield* fs.rename(temporaryPath, path)
    }),
  )
})
