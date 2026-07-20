import * as Data from "effect/Data"
import * as Schema from "effect/Schema"

export const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0)).annotate({ title: "PositiveInt" })
export const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).annotate({ title: "NonNegativeInt" })
export const Wpm = Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 1_200 })).annotate({ title: "Wpm" })

export class Verse extends Schema.Class<Verse>("bible-tui-footer/Verse")({
  book: Schema.NonEmptyString,
  chapter: PositiveInt,
  verse: PositiveInt,
  text: Schema.NonEmptyString,
}) {}

export class SavedProgress extends Schema.Class<SavedProgress>("bible-tui-footer/SavedProgress")({
  enabled: Schema.Boolean,
  verseIndex: NonNegativeInt,
  wordIndex: NonNegativeInt,
  wordsRead: NonNegativeInt,
  wpm: Wpm,
}) {}

export class BookInfo extends Schema.Class<BookInfo>("bible-tui-footer/BookInfo")({
  name: Schema.NonEmptyString,
  verseOffset: NonNegativeInt,
  verseCount: PositiveInt,
  file: Schema.NonEmptyString,
}) {}

export class BibleManifest extends Schema.Class<BibleManifest>("bible-tui-footer/BibleManifest")({
  version: Schema.Literal(1),
  wordCount: PositiveInt,
  totalVerses: PositiveInt,
  books: Schema.NonEmptyArray(BookInfo),
}) {}

export const BookVerse = Schema.Tuple([
  PositiveInt,
  PositiveInt,
  Schema.NonEmptyString,
])
export type BookVerse = typeof BookVerse.Type

/**
 * Internal, already-validated data for the one book retained by the reader.
 * The verses array field does not deep-compare, so equality is by identity.
 */
export class BibleBook extends Data.Class<{
  readonly info: BookInfo
  readonly verses: ReadonlyArray<BookVerse>
}> {}

/** Internal render value; all-primitive fields give exact Effect structural equality and hashing. */
export class RSVPFrame extends Data.Class<{
  readonly word: string
  readonly pivotIndex: number
  readonly reference: string
  readonly delayMs: number
  readonly verseIndex: number
  readonly wordIndex: number
  readonly wordsRead: number
  readonly totalWords: number
  readonly wpm: number
  readonly isVerseEnd: boolean
}> {}

export const defaultProgress = new SavedProgress({
  enabled: true,
  verseIndex: 0,
  wordIndex: 0,
  wordsRead: 0,
  wpm: 450,
})
