import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import { Bible, RSVPFrame, SavedProgress, Verse } from "./domain.js"
import { ReaderError } from "./errors.js"
import { makeFrame, wordsOf } from "./rsvp.js"

export interface Reader {
  readonly current: Effect.Effect<RSVPFrame>
  readonly advance: Effect.Effect<RSVPFrame>
  readonly progress: Effect.Effect<SavedProgress>
  readonly setEnabled: (enabled: boolean) => Effect.Effect<void>
  readonly setWpm: (wpm: number) => Effect.Effect<number>
  readonly goto: (reference: string) => Effect.Effect<RSVPFrame, ReaderError>
  readonly reset: Effect.Effect<RSVPFrame>
}

class ParsedReference extends Data.Class<{
  readonly book: string
  readonly chapter: number
  readonly verse: Option.Option<number>
}> {}

/** Hot-path state. Validation happens when crossing persistence and command boundaries. */
class RuntimeProgress extends Data.Class<{
  readonly enabled: boolean
  readonly verseIndex: number
  readonly wordIndex: number
  readonly wordsRead: number
  readonly wpm: number
}> {}

/** Holds a single tokenized verse, avoiding repeated regex work without unbounded caching. */
class ReaderState extends Data.Class<{
  readonly progress: RuntimeProgress
  readonly verse: Verse
  readonly words: ReadonlyArray<string>
}> {}

const verseAt = (bible: Bible, index: number): Verse => {
  const [bookIndex, chapter, verse, text] = bible.verses[index]!
  return new Verse({ book: bible.books[bookIndex]!, chapter, verse, text })
}

const toSavedProgress = (progress: RuntimeProgress): SavedProgress =>
  new SavedProgress(progress)

const stateAt = (bible: Bible, progress: RuntimeProgress): ReaderState => {
  const verse = verseAt(bible, progress.verseIndex)
  return new ReaderState({
    progress,
    verse,
    words: wordsOf(verse.text),
  })
}

const normalize = (bible: Bible, saved: SavedProgress): RuntimeProgress => {
  const verseIndex = Math.max(0, Math.min(bible.verses.length - 1, saved.verseIndex))
  const text = bible.verses[verseIndex]![3]
  const wordIndex = Math.max(0, Math.min(Math.max(0, wordsOf(text).length - 1), saved.wordIndex))
  return new RuntimeProgress({ ...saved, verseIndex, wordIndex })
}

const frameAt = (bible: Bible, state: ReaderState): RSVPFrame => {
  const { progress, words } = state
  const word = words[progress.wordIndex] ?? words[0] ?? ""
  return makeFrame({
    verse: state.verse,
    word,
    isVerseEnd: progress.wordIndex >= words.length - 1,
    verseIndex: progress.verseIndex,
    wordIndex: progress.wordIndex,
    wordsRead: progress.wordsRead,
    totalWords: bible.wordCount,
    wpm: progress.wpm,
  })
}

const advanceState = (bible: Bible, state: ReaderState): ReaderState => {
  const { progress, words } = state
  if (progress.wordIndex + 1 < words.length) {
    return new ReaderState({
      ...state,
      progress: new RuntimeProgress({
        ...progress,
        wordIndex: progress.wordIndex + 1,
        wordsRead: progress.wordsRead + 1,
      }),
    })
  }

  const verseIndex = progress.verseIndex + 1 < bible.verses.length ? progress.verseIndex + 1 : 0
  return stateAt(bible, new RuntimeProgress({
    ...progress,
    verseIndex,
    wordIndex: 0,
    wordsRead: progress.wordsRead + 1,
  }))
}

const findReferenceIndex = (
  bible: Bible,
  requested: ParsedReference,
  verse: number,
): Option.Option<number> => {
  const requestedBook = requested.book.trim().toLowerCase()
  for (let index = 0; index < bible.verses.length; index++) {
    const [bookIndex, chapter, verseNumber] = bible.verses[index]!
    if (
      chapter === requested.chapter
      && verseNumber === verse
      && bible.books[bookIndex]?.toLowerCase() === requestedBook
    ) {
      return Option.some(index)
    }
  }
  return Option.none()
}

const parseReference = (reference: string): Option.Option<ParsedReference> => {
  const match = reference.trim().match(/^(.+?)\s+(\d+)(?::(\d+))?$/)
  if (!match) return Option.none()

  const chapter = Number(match[2])
  const verse = match[3] === undefined ? Option.none<number>() : Option.some(Number(match[3]))
  if (
    !Number.isInteger(chapter)
    || chapter < 1
    || Option.exists(verse, (value) => !Number.isInteger(value) || value < 1)
  ) {
    return Option.none()
  }

  return Option.some(new ParsedReference({ book: match[1]!, chapter, verse }))
}

export const makeReader = Effect.fn("makeReader")(function*(
  bible: Bible,
  saved: SavedProgress,
): Effect.fn.Return<Reader> {
  const initialProgress = normalize(bible, saved)
  const state = yield* Ref.make(stateAt(bible, initialProgress))

  const current = Ref.get(state).pipe(Effect.map((readerState) => frameAt(bible, readerState)))
  const advance = Ref.modify(state, (readerState) => {
    const next = advanceState(bible, readerState)
    return [frameAt(bible, next), next] as const
  })
  const progress = Ref.get(state).pipe(Effect.map((readerState) => toSavedProgress(readerState.progress)))

  const setEnabled = Effect.fn("Reader.setEnabled")((enabled: boolean) =>
    Ref.update(
      state,
      (readerState) => new ReaderState({
        ...readerState,
        progress: new RuntimeProgress({ ...readerState.progress, enabled }),
      }),
    ))

  const setWpm = Effect.fn("Reader.setWpm")((wpm: number) => {
    const normalized = Math.max(100, Math.min(1_200, Math.round(wpm)))
    return Ref.update(
      state,
      (readerState) => new ReaderState({
        ...readerState,
        progress: new RuntimeProgress({ ...readerState.progress, wpm: normalized }),
      }),
    ).pipe(Effect.as(normalized))
  })

  const goto = Effect.fn("Reader.goto")(function*(reference: string) {
    const parsed = parseReference(reference)
    if (Option.isNone(parsed)) {
      return yield* new ReaderError({ message: `Invalid reference: ${reference}` })
    }

    const requested = parsed.value
    const verse = Option.getOrElse(requested.verse, () => 1)
    const index = findReferenceIndex(bible, requested, verse)
    if (Option.isNone(index)) {
      return yield* new ReaderError({ message: `Passage not found: ${reference}` })
    }

    return yield* Ref.modify(state, (readerState) => {
      const next = stateAt(bible, new RuntimeProgress({
        ...readerState.progress,
        verseIndex: index.value,
        wordIndex: 0,
      }))
      return [frameAt(bible, next), next] as const
    })
  })

  const reset = Ref.modify(state, (readerState) => {
    const next = stateAt(bible, new RuntimeProgress({
      ...readerState.progress,
      verseIndex: 0,
      wordIndex: 0,
      wordsRead: 0,
    }))
    return [frameAt(bible, next), next] as const
  })

  return { current, advance, progress, setEnabled, setWpm, goto, reset }
})
