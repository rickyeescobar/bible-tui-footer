import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as HashMap from "effect/HashMap"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { join, resolve } from "node:path"
import { BookFileJsonSchema, ManifestJsonSchema } from "../src/bible.js"
import { BibleManifest, BookInfo, PositiveInt, type BookVerse } from "../src/domain.js"
import { writeFileStringAtomic } from "../src/files.js"
import { wordsOf } from "../src/rsvp.js"

class BuildDataError extends Schema.TaggedErrorClass<BuildDataError>()("BuildDataError", {
  message: Schema.String,
}) {}

const SourceVerseSchema = Schema.Struct({
  book: Schema.NonEmptyString,
  chapter: PositiveInt,
  verse: PositiveInt,
  text: Schema.NonEmptyString,
})

const SourceBibleJsonSchema = Schema.fromJsonString(Schema.Struct({
  verses: Schema.NonEmptyArray(SourceVerseSchema),
}))

const program = Effect.gen(function*() {
  const [inputArgument, outputArgument] = process.argv.slice(2)
  if (inputArgument === undefined || outputArgument === undefined) {
    return yield* new BuildDataError({ message: "Usage: compact-bible <input.json> <output-directory>" })
  }

  const input = resolve(inputArgument)
  const outputDirectory = resolve(outputArgument)
  const booksDirectory = join(outputDirectory, "books")
  const fs = yield* FileSystem.FileSystem
  const source = yield* fs.readFileString(input)
  const data = yield* Schema.decodeUnknownEffect(SourceBibleJsonSchema)(source)
  const books = [...new Set(data.verses.map((verse) => verse.book))] as [string, ...Array<string>]
  const bookIndexes = HashMap.fromIterable(books.map((book, index) => [book, index] as const))
  const versesByBook: Array<Array<BookVerse>> = books.map(() => [])
  let wordCount = 0

  for (const verse of data.verses) {
    const bookIndex = HashMap.get(bookIndexes, verse.book)
    if (Option.isNone(bookIndex)) {
      return yield* new BuildDataError({ message: `Book index missing for ${verse.book}` })
    }
    versesByBook[bookIndex.value]!.push([verse.chapter, verse.verse, verse.text])
    wordCount += wordsOf(verse.text).length
  }

  let verseOffset = 0
  const bookInfos = books.map((name, bookIndex) => {
    const verseCount = versesByBook[bookIndex]!.length
    const info = new BookInfo({
      name,
      verseOffset,
      verseCount,
      file: `books/${bookIndex}.json`,
    })
    verseOffset += verseCount
    return info
  }) as [BookInfo, ...Array<BookInfo>]

  const manifest = new BibleManifest({
    version: 1,
    wordCount,
    totalVerses: data.verses.length,
    books: bookInfos,
  })

  yield* fs.makeDirectory(booksDirectory, { recursive: true })
  yield* Effect.forEach(versesByBook, (verses, bookIndex) =>
    Schema.encodeUnknownEffect(BookFileJsonSchema)({ bookIndex, verses }).pipe(
      Effect.flatMap((encoded) => writeFileStringAtomic(join(booksDirectory, `${bookIndex}.json`), encoded)),
    ))

  const encodedManifest = yield* Schema.encodeUnknownEffect(ManifestJsonSchema)(manifest)
  yield* writeFileStringAtomic(join(outputDirectory, "manifest.json"), encodedManifest)
  yield* fs.remove(join(outputDirectory, "kjv.json"), { force: true })
  yield* Effect.logInfo(
    `Wrote ${data.verses.length} verses from ${books.length} books to ${outputDirectory}`,
  )
})

NodeRuntime.runMain(
  program.pipe(Effect.provide(NodeFileSystem.layer)),
)
