import * as Data from "effect/Data"
import * as Schema from "effect/Schema"

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export const Wpm = Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 1_200 }))

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

export type BookVerse = readonly [
  chapter: number,
  verse: number,
  text: string,
]

/** Internal, already-validated data for the one book retained by the reader. */
export class BibleBook extends Data.Class<{
  readonly info: BookInfo
  readonly verses: ReadonlyArray<BookVerse>
}> {}

/** Internal render value with Effect structural equality and hashing. */
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
