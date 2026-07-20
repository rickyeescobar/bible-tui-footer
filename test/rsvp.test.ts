import { assert, describe, it } from "@effect/vitest"
import { delayFor, pivotIndexOf, wordsOf } from "../src/rsvp.js"

describe("RSVP", () => {
  it("tokenizes a verse without discarding punctuation", () => {
    assert.deepStrictEqual(wordsOf("In the beginning, God."), ["In", "the", "beginning,", "God."])
  })

  it("places the recognition point after leading punctuation", () => {
    assert.strictEqual(pivotIndexOf("In"), 1)
    assert.strictEqual(pivotIndexOf("beginning"), 2)
    assert.strictEqual(pivotIndexOf('“Beginning'), 3)
  })

  it("pauses longer at sentences and verse boundaries", () => {
    const normal = delayFor("earth", 450, false)
    const sentence = delayFor("earth.", 450, false)
    const verseEnd = delayFor("earth.", 450, true)
    assert.isTrue(sentence > normal)
    assert.isTrue(verseEnd > sentence)
  })
})
