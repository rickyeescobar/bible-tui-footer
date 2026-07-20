import { RSVPFrame, type Verse } from "./domain.js"

export const wordsOf = (text: string): ReadonlyArray<string> => text.match(/\S+/g) ?? []

const lexicalBounds = (word: string): readonly [number, number] => {
  const start = word.search(/[\p{L}\p{N}]/u)
  if (start < 0) return [0, Math.max(0, word.length - 1)]

  let end = word.length - 1
  while (end > start && !/[\p{L}\p{N}]/u.test(word[end] ?? "")) end--
  return [start, end]
}

/** Spritz-style optimal recognition position, adjusted for leading punctuation. */
export const pivotIndexOf = (word: string): number => {
  const [start, end] = lexicalBounds(word)
  const length = end - start + 1
  const offset = length <= 1 ? 0 : length <= 5 ? 1 : length <= 9 ? 2 : length <= 13 ? 3 : 4
  return Math.min(end, start + offset)
}

export const delayFor = (word: string, wpm: number, isVerseEnd: boolean): number => {
  const base = 60_000 / wpm
  const lexicalLength = word.replace(/[^\p{L}\p{N}]/gu, "").length
  const lengthMultiplier = lexicalLength >= 12 ? 1.35 : lexicalLength >= 8 ? 1.15 : 1
  const punctuationMultiplier = /[.!?][”’"']?$/.test(word)
    ? 1.9
    : /[,;:][”’"']?$/.test(word)
      ? 1.4
      : 1
  const verseMultiplier = isVerseEnd ? 1.45 : 1
  return Math.round(base * lengthMultiplier * punctuationMultiplier * verseMultiplier)
}

export const referenceOf = (verse: Verse): string => `${verse.book} ${verse.chapter}:${verse.verse}`

export const makeFrame = (options: {
  readonly verse: Verse
  readonly word: string
  readonly isVerseEnd: boolean
  readonly verseIndex: number
  readonly wordIndex: number
  readonly wordsRead: number
  readonly totalWords: number
  readonly wpm: number
}): RSVPFrame => {
  return new RSVPFrame({
    word: options.word,
    pivotIndex: pivotIndexOf(options.word),
    reference: referenceOf(options.verse),
    delayMs: delayFor(options.word, options.wpm, options.isVerseEnd),
    verseIndex: options.verseIndex,
    wordIndex: options.wordIndex,
    wordsRead: options.wordsRead,
    totalWords: options.totalWords,
    wpm: options.wpm,
    isVerseEnd: options.isVerseEnd,
  })
}
