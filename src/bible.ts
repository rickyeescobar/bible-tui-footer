import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { join } from "node:path"
import { BibleBook, BibleManifest, type BookVerse } from "./domain.js"
import { BibleDataError } from "./errors.js"

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))

const BookVerseSchema = Schema.Tuple([
  PositiveInt,
  PositiveInt,
  Schema.NonEmptyString,
])

const BookFileJsonSchema = Schema.fromJsonString(Schema.Struct({
  bookIndex: NonNegativeInt,
  verses: Schema.NonEmptyArray(BookVerseSchema),
}))

const ManifestJsonSchema = Schema.fromJsonString(BibleManifest)

export class BibleLibrary extends Context.Service<BibleLibrary, {
  readonly manifest: BibleManifest
  readonly loadBook: (bookIndex: number) => Effect.Effect<BibleBook, BibleDataError>
}>()("bible-tui-footer/BibleLibrary") {
  static readonly layer = (directory: string) =>
    Layer.effect(BibleLibrary, makeBibleLibrary(directory))
}

export const makeBibleLibrary = Effect.fn("makeBibleLibrary")(function*(
  directory: string,
): Effect.fn.Return<BibleLibrary["Service"], BibleDataError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem
  const manifestPath = join(directory, "manifest.json")
  const source = yield* fs.readFileString(manifestPath).pipe(
    Effect.mapError((cause) => new BibleDataError({
      message: `Unable to read Bible manifest at ${manifestPath}`,
      cause,
    })),
  )
  const manifest = yield* Schema.decodeUnknownEffect(ManifestJsonSchema)(source).pipe(
    Effect.mapError((cause) => new BibleDataError({
      message: "Bible manifest failed schema validation",
      cause,
    })),
  )

  let expectedOffset = 0
  for (let bookIndex = 0; bookIndex < manifest.books.length; bookIndex++) {
    const book = manifest.books[bookIndex]!
    if (book.verseOffset !== expectedOffset || book.file !== `books/${bookIndex}.json`) {
      return yield* new BibleDataError({
        message: `Bible manifest contains invalid metadata for ${book.name}`,
        cause: { bookIndex, book },
      })
    }
    expectedOffset += book.verseCount
  }
  if (expectedOffset !== manifest.totalVerses) {
    return yield* new BibleDataError({
      message: "Bible manifest verse count is inconsistent",
      cause: { expectedOffset, totalVerses: manifest.totalVerses },
    })
  }

  const loadBook = Effect.fn("BibleLibrary.loadBook")(function*(bookIndex: number) {
    const info = manifest.books[bookIndex]
    if (info === undefined) {
      return yield* new BibleDataError({
        message: `Bible book index is out of range: ${bookIndex}`,
        cause: { bookIndex },
      })
    }

    const path = join(directory, info.file)
    const bookSource = yield* fs.readFileString(path).pipe(
      Effect.mapError((cause) => new BibleDataError({
        message: `Unable to read Bible book at ${path}`,
        cause,
      })),
    )
    const data = yield* Schema.decodeUnknownEffect(BookFileJsonSchema)(bookSource).pipe(
      Effect.mapError((cause) => new BibleDataError({
        message: `${info.name} data failed schema validation`,
        cause,
      })),
    )

    if (data.bookIndex !== bookIndex || data.verses.length !== info.verseCount) {
      return yield* new BibleDataError({
        message: `${info.name} data does not match the Bible manifest`,
        cause: {
          actualBookIndex: data.bookIndex,
          actualVerseCount: data.verses.length,
          expectedBookIndex: bookIndex,
          expectedVerseCount: info.verseCount,
        },
      })
    }

    return new BibleBook({ info, verses: data.verses as ReadonlyArray<BookVerse> })
  })

  return BibleLibrary.of({ manifest, loadBook })
})
