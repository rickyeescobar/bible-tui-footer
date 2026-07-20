import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"
import { Bible } from "./domain.js"
import { BibleDataError } from "./errors.js"

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))

const CompactVerseSchema = Schema.Tuple([
  NonNegativeInt,
  PositiveInt,
  PositiveInt,
  Schema.NonEmptyString,
])

const CompactBibleSchema = Schema.Struct({
  books: Schema.NonEmptyArray(Schema.NonEmptyString),
  wordCount: PositiveInt,
  verses: Schema.NonEmptyArray(CompactVerseSchema),
})

const CompactBibleJsonSchema = Schema.fromJsonString(CompactBibleSchema)

export const loadBible = Effect.fn("loadBible")(function*(
  path: string,
): Effect.fn.Return<Bible, BibleDataError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem
  const source = yield* fs.readFileString(path).pipe(
    Effect.mapError((cause) => new BibleDataError({
      message: `Unable to read Bible data at ${path}`,
      cause,
    })),
  )

  const data = yield* Schema.decodeUnknownEffect(CompactBibleJsonSchema)(source).pipe(
    Effect.mapError((cause) => new BibleDataError({ message: "Bible data failed schema validation", cause })),
  )

  for (const [bookIndex, chapter, verseNumber] of data.verses) {
    if (data.books[bookIndex] === undefined) {
      return yield* new BibleDataError({
        message: `Bible verse references missing book index ${bookIndex}`,
        cause: { bookIndex, chapter, verse: verseNumber },
      })
    }
  }

  return new Bible({
    books: data.books,
    verses: data.verses,
    wordCount: data.wordCount,
  })
})
