import { Schema } from "effect"

export class BibleDataError extends Schema.TaggedErrorClass<BibleDataError>()("BibleDataError", {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

export class ProgressError extends Schema.TaggedErrorClass<ProgressError>()("ProgressError", {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

export class ReaderError extends Schema.TaggedErrorClass<ReaderError>()("ReaderError", {
  message: Schema.String,
}) {}
