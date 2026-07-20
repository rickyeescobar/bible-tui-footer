import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { UsageError } from "./errors.js"

export type BibleCommand = Data.TaggedEnum<{
  On: {}
  Off: {}
  Status: {}
  Restart: {}
  Speed: { readonly wpm: number }
  Goto: { readonly reference: string }
}>

export const BibleCommand = Data.taggedEnum<BibleCommand>()

const GENERAL_USAGE = "Usage: /bible [on|off|speed <wpm>|goto <reference>|restart|status]"
const SPEED_USAGE = "Usage: /bible speed <100-1200>"
const GOTO_USAGE = "Usage: /bible goto <book chapter:verse>"

/** Parses the /bible grammar; syntax errors fail with UsageError. */
export const parseCommand = Effect.fn("parseCommand")(function*(
  input: string,
): Effect.fn.Return<BibleCommand, UsageError> {
  const [verb = "", ...rest] = input.trim().split(/\s+/)
  const argument = rest.join(" ")

  switch (verb.toLowerCase()) {
    case "on":
      return BibleCommand.On()
    case "off":
      return BibleCommand.Off()
    case "status":
      return BibleCommand.Status()
    case "restart":
      return BibleCommand.Restart()
    case "speed": {
      const wpm = Number(argument)
      if (argument === "" || !Number.isFinite(wpm)) {
        return yield* new UsageError({ message: SPEED_USAGE })
      }
      return BibleCommand.Speed({ wpm })
    }
    case "goto":
      if (argument === "") return yield* new UsageError({ message: GOTO_USAGE })
      return BibleCommand.Goto({ reference: argument })
    default:
      return yield* new UsageError({ message: GENERAL_USAGE })
  }
})
