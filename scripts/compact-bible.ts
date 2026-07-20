import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as HashMap from "effect/HashMap"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { resolve } from "node:path"
import { writeFileStringAtomic } from "../src/files.js"
import { wordsOf } from "../src/rsvp.js"

class BuildDataError extends Schema.TaggedErrorClass<BuildDataError>()("BuildDataError", {
  message: Schema.String,
}) {}

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

const SourceVerseSchema = Schema.Struct({
  book: Schema.NonEmptyString,
  chapter: PositiveInt,
  verse: PositiveInt,
  text: Schema.NonEmptyString,
})

const SourceBibleJsonSchema = Schema.fromJsonString(Schema.Struct({
  verses: Schema.NonEmptyArray(SourceVerseSchema),
}))

const CompactBibleJsonSchema = Schema.fromJsonString(Schema.Struct({
  books: Schema.NonEmptyArray(Schema.NonEmptyString),
  wordCount: PositiveInt,
  verses: Schema.NonEmptyArray(Schema.Tuple([
    NonNegativeInt,
    PositiveInt,
    PositiveInt,
    Schema.NonEmptyString,
  ])),
}))

const program = Effect.gen(function* () {
  const [inputArgument, outputArgument] = process.argv.slice(2)
  if (inputArgument === undefined || outputArgument === undefined) {
    return yield* new BuildDataError({ message: "Usage: compact-bible <input.json> <output.json>" })
  }

  const input = resolve(inputArgument)
  const output = resolve(outputArgument)
  const fs = yield* FileSystem.FileSystem
  const source = yield* fs.readFileString(input)
  const data = yield* Schema.decodeUnknownEffect(SourceBibleJsonSchema)(source)
  const books = [...new Set(data.verses.map((verse) => verse.book))] as [string, ...Array<string>]
  const bookIndexes = HashMap.fromIterable(books.map((book, index) => [book, index] as const))

  const verses = yield* Effect.forEach(data.verses, (verse) =>
    HashMap.get(bookIndexes, verse.book).pipe(
      Option.match({
        onNone: () => new BuildDataError({ message: `Book index missing for ${verse.book}` }),
        onSome: (bookIndex) => Effect.succeed([
          bookIndex,
          verse.chapter,
          verse.verse,
          verse.text,
        ] as const),
      }),
    ))

  const wordCount = data.verses.reduce((total, verse) => total + wordsOf(verse.text).length, 0)
  const encoded = yield* Schema.encodeUnknownEffect(CompactBibleJsonSchema)({ books, wordCount, verses })
  yield* writeFileStringAtomic(output, encoded)
  yield* Effect.logInfo(`Wrote ${verses.length} verses from ${books.length} books to ${output}`)
})

NodeRuntime.runMain(
  program.pipe(Effect.provide(NodeFileSystem.layer)),
)
