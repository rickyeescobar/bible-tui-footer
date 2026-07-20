import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as SynchronizedRef from "effect/SynchronizedRef"
import type { BibleLibrary } from "./bible.js"
import { type BibleBook, RSVPFrame, SavedProgress, Verse } from "./domain.js"
import type { BibleDataError } from "./errors.js"
import { ReaderError } from "./errors.js"
import { makeFrame, wordsOf } from "./rsvp.js"

export interface Reader {
  readonly current: Effect.Effect<RSVPFrame>
  readonly advance: Effect.Effect<RSVPFrame, BibleDataError>
  readonly progress: Effect.Effect<SavedProgress>
  readonly setEnabled: (enabled: boolean) => Effect.Effect<void>
  readonly setWpm: (wpm: number) => Effect.Effect<number>
  readonly goto: (reference: string) => Effect.Effect<RSVPFrame, BibleDataError | ReaderError>
  readonly reset: Effect.Effect<RSVPFrame, BibleDataError>
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

/** Retains only one loaded and tokenized book/verse at a time. */
class ReaderState extends Data.Class<{
  readonly progress: RuntimeProgress
  readonly book: BibleBook
  readonly verse: Verse
  readonly words: ReadonlyArray<string>
}> {}

const toSavedProgress = (progress: RuntimeProgress): SavedProgress =>
  new SavedProgress(progress)

const containsVerse = (book: BibleBook, verseIndex: number): boolean =>
  verseIndex >= book.info.verseOffset
  && verseIndex < book.info.verseOffset + book.info.verseCount

const stateInBook = (book: BibleBook, progress: RuntimeProgress): ReaderState => {
  const localIndex = progress.verseIndex - book.info.verseOffset
  const [chapter, verseNumber, text] = book.verses[localIndex]!
  const verse = new Verse({ book: book.info.name, chapter, verse: verseNumber, text })
  const words = wordsOf(text)
  const wordIndex = Math.max(0, Math.min(Math.max(0, words.length - 1), progress.wordIndex))
  return new ReaderState({
    book,
    verse,
    words,
    progress: new RuntimeProgress({ ...progress, wordIndex }),
  })
}

const bookIndexAt = (library: BibleLibrary["Service"], verseIndex: number): number => {
  const books = library.manifest.books
  for (let index = 0; index < books.length; index++) {
    const book = books[index]!
    if (verseIndex < book.verseOffset + book.verseCount) return index
  }
  return books.length - 1
}

const loadState = Effect.fn("Reader.loadState")(function*(
  library: BibleLibrary["Service"],
  progress: RuntimeProgress,
) {
  const book = yield* library.loadBook(bookIndexAt(library, progress.verseIndex))
  return stateInBook(book, progress)
})

const stateAt = (
  library: BibleLibrary["Service"],
  currentBook: BibleBook,
  progress: RuntimeProgress,
): Effect.Effect<ReaderState, BibleDataError> =>
  containsVerse(currentBook, progress.verseIndex)
    ? Effect.succeed(stateInBook(currentBook, progress))
    : loadState(library, progress)

const frameAt = (library: BibleLibrary["Service"], state: ReaderState): RSVPFrame => {
  const { progress, words } = state
  const word = words[progress.wordIndex] ?? words[0] ?? ""
  return makeFrame({
    verse: state.verse,
    word,
    isVerseEnd: progress.wordIndex >= words.length - 1,
    verseIndex: progress.verseIndex,
    wordIndex: progress.wordIndex,
    wordsRead: progress.wordsRead,
    totalWords: library.manifest.wordCount,
    wpm: progress.wpm,
  })
}

const advanceState = (
  library: BibleLibrary["Service"],
  state: ReaderState,
): Effect.Effect<ReaderState, BibleDataError> => {
  const { progress, words } = state
  if (progress.wordIndex + 1 < words.length) {
    return Effect.succeed(new ReaderState({
      ...state,
      progress: new RuntimeProgress({
        ...progress,
        wordIndex: progress.wordIndex + 1,
        wordsRead: progress.wordsRead + 1,
      }),
    }))
  }

  const verseIndex = progress.verseIndex + 1 < library.manifest.totalVerses
    ? progress.verseIndex + 1
    : 0
  return stateAt(library, state.book, new RuntimeProgress({
    ...progress,
    verseIndex,
    wordIndex: 0,
    wordsRead: progress.wordsRead + 1,
  }))
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
  library: BibleLibrary["Service"],
  saved: SavedProgress,
): Effect.fn.Return<Reader, BibleDataError> {
  const verseIndex = Math.max(0, Math.min(library.manifest.totalVerses - 1, saved.verseIndex))
  const initialProgress = new RuntimeProgress({ ...saved, verseIndex })
  const initialState = yield* loadState(library, initialProgress)
  const state = yield* SynchronizedRef.make(initialState)

  const current = SynchronizedRef.get(state).pipe(
    Effect.map((readerState) => frameAt(library, readerState)),
  )
  const advance = SynchronizedRef.modifyEffect(state, (readerState) =>
    advanceState(library, readerState).pipe(
      Effect.map((next) => [frameAt(library, next), next] as const),
    ))
  const progress = SynchronizedRef.get(state).pipe(
    Effect.map((readerState) => toSavedProgress(readerState.progress)),
  )

  const setEnabled = Effect.fn("Reader.setEnabled")((enabled: boolean) =>
    SynchronizedRef.update(
      state,
      (readerState) => new ReaderState({
        ...readerState,
        progress: new RuntimeProgress({ ...readerState.progress, enabled }),
      }),
    ))

  const setWpm = Effect.fn("Reader.setWpm")((wpm: number) => {
    const normalized = Math.max(100, Math.min(1_200, Math.round(wpm)))
    return SynchronizedRef.update(
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
    const bookIndex = library.manifest.books.findIndex(
      (book) => book.name.toLowerCase() === requested.book.trim().toLowerCase(),
    )
    if (bookIndex < 0) {
      return yield* new ReaderError({ message: `Passage not found: ${reference}` })
    }

    const book = yield* library.loadBook(bookIndex)
    const verseNumber = Option.getOrElse(requested.verse, () => 1)
    const localIndex = book.verses.findIndex(
      ([chapter, verse]) => chapter === requested.chapter && verse === verseNumber,
    )
    if (localIndex < 0) {
      return yield* new ReaderError({ message: `Passage not found: ${reference}` })
    }

    return yield* SynchronizedRef.modify(state, (readerState) => {
      const next = stateInBook(book, new RuntimeProgress({
        ...readerState.progress,
        verseIndex: book.info.verseOffset + localIndex,
        wordIndex: 0,
      }))
      return [frameAt(library, next), next] as const
    })
  })

  const reset = SynchronizedRef.modifyEffect(state, (readerState) =>
    stateAt(library, readerState.book, new RuntimeProgress({
      ...readerState.progress,
      verseIndex: 0,
      wordIndex: 0,
      wordsRead: 0,
    })).pipe(
      Effect.map((next) => [frameAt(library, next), next] as const),
    ))

  return { current, advance, progress, setEnabled, setWpm, goto, reset }
})
