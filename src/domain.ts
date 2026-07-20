import { Data, Schema } from "effect"

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

/** Internal, already-validated aggregate with Effect structural equality and hashing. */
export class Bible extends Data.Class<{
  readonly verses: ReadonlyArray<Verse>
  readonly books: ReadonlyArray<string>
  readonly wordCount: number
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
