import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui"
import type { RSVPFrame } from "./domain.js"

export interface FocusTheme {
  readonly accent: (text: string) => string
  readonly dim: (text: string) => string
  readonly muted: (text: string) => string
  readonly bold: (text: string) => string
}

const PIVOT_COLUMN = 6

const numberFormatter = new Intl.NumberFormat("en-US")
const formatNumber = (value: number): string => numberFormatter.format(value)

export const renderFocusWindow = (
  frame: RSVPFrame,
  width: number,
  theme: FocusTheme,
): ReadonlyArray<string> => {
  if (width < 38) {
    const pivot = frame.word[frame.pivotIndex] ?? ""
    const word = `${frame.word.slice(0, frame.pivotIndex)}${theme.accent(theme.bold(pivot))}${frame.word.slice(frame.pivotIndex + 1)}`
    return [truncateToWidth(`${theme.dim(frame.reference)} · ${word}`, width)]
  }

  const heading = theme.dim(
    truncateToWidth(`${frame.reference} ${"─".repeat(width)}`, width, ""),
  )

  const pivot = frame.word[frame.pivotIndex] ?? ""
  const before = frame.word.slice(0, frame.pivotIndex)
  const after = frame.word.slice(frame.pivotIndex + 1)
  const leading = " ".repeat(Math.max(0, PIVOT_COLUMN - visibleWidth(before)))
  const word = truncateToWidth(
    `${leading}${before}${theme.accent(theme.bold(pivot))}${after}`,
    width,
    "",
  )

  const statistics = theme.muted(
    `${frame.wpm} WPM · ${formatNumber(frame.wordsRead)} words read`,
  )

  return [heading, word, truncateToWidth(statistics, width, "")]
}
