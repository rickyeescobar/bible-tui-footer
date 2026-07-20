import { Effect, FileSystem, Schema } from "effect"
import { Bible, Verse } from "./domain.js"
import { BibleDataError } from "./errors.js"
import { wordsOf } from "./rsvp.js"

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

  const verses: Array<Verse> = []
  let wordCount = 0

  for (const [bookIndex, chapter, verseNumber, text] of data.verses) {
    const book = data.books[bookIndex]
    if (book === undefined) {
      return yield* new BibleDataError({
        message: `Bible verse references missing book index ${bookIndex}`,
        cause: { bookIndex, chapter, verse: verseNumber },
      })
    }

    const verse = new Verse({ book, chapter, verse: verseNumber, text })
    verses.push(verse)
    wordCount += wordsOf(text).length
  }

  return new Bible({ books: data.books, verses, wordCount })
})
