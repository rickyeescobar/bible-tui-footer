# Bible TUI Footer

Bible TUI Footer turns agent wait time into reading time. While [Pi](https://pi.dev) works, a focused RSVP (Rapid Serial Visual Presentation) window advances through the King James Bible one word at a time and resumes where you stopped.

```text
Genesis 1:1 ─────────────────────────────────────────────────
   beg[i]nning
450 WPM · 1,284 words read
```

The highlighted letter is the word's optimal recognition position, kept at a stable terminal column to reduce eye movement.

## Features

- Sequential Genesis-to-Revelation reading with lazy, single-verse token caching
- Left-anchored, theme-aware Focus Window above Pi's editor
- Monotonic RSVP timing with punctuation, long-word, and verse-boundary pauses
- Serialized, atomic progress persistence across projects and Pi sessions
- Responsive one-line rendering in narrow terminals
- Entirely local and offline
- Effect v4 state, schema validation, typed errors, persistence, timing, and fiber lifecycle

## Install

From this checkout:

```bash
pnpm install
pi install /absolute/path/to/bible-tui-footer
```

For a temporary development run:

```bash
pi -e ./extensions/index.ts
```

Bible TUI Footer starts automatically when an agent starts and disappears when the agent settles.

## Commands

```text
/bible status
/bible on
/bible off
/bible speed 500
/bible goto John 1:1
/bible restart
```

Speed is constrained to 100–1,200 WPM. The default is 450 WPM.

## State

Progress is stored at:

```text
$XDG_STATE_HOME/bible-tui-footer/progress.json
```

If `XDG_STATE_HOME` is unset, Bible TUI Footer uses:

```text
~/.local/state/bible-tui-footer/progress.json
```

Writes are atomic and occur when the agent settles, the session shuts down, or a command changes progress.

## Development

Bible TUI Footer currently targets Node.js 24.18 LTS, pnpm 11.15, TypeScript 7, and Effect 4 beta. The checked-in `.nvmrc` is an optional convenience for contributors who use nvm.

```bash
pnpm install
pnpm check
pnpm test
```

Rebuild the compact dataset from the parsed `d4ilybread` JSON:

```bash
pnpm build:data
```

Or provide explicit paths:

```bash
pnpm exec tsx scripts/compact-bible.ts input.json data/kjv.json
```

## Architecture

- `extensions/index.ts` — thin Pi lifecycle and synchronous rendering adapter
- `src/domain.ts` — Effect Schema classes and immutable Data classes
- `src/reader.ts` — cached tokenization, indexed references, and an Effect `Ref`/`Option`/Data reader state machine
- `src/playback.ts` — monotonic deadlines and scope-managed Effect fiber playback
- `src/progress.ts` — schema-validated persistence through Effect `FileSystem`
- `src/files.ts` — scoped temporary resources and atomic file replacement
- `src/rsvp.ts` — tokenization, pivot placement, and timing policy
- `src/view.ts` — pure responsive Focus Window renderer
- `data/kjv.json` — compact local Bible data

All persisted and bundled JSON is decoded and encoded with Effect Schema. Domain errors use `Schema.TaggedErrorClass`; validated records use `Schema.Class`; trusted internal aggregates use `Data.Class`. Pi requires synchronous `render()` methods and Promise-returning event callbacks, so a `ManagedRuntime` provides the Node layer at that imperative boundary. Effect tests use `@effect/vitest`, scoped resources, and `TestClock`.

## Scripture data

The bundled text is the King James Version parsed from the project's existing `d4ilybread` dataset. See [NOTICE](NOTICE) before redistribution, particularly for jurisdictions where rights in the Authorized Version may differ.

## License

The software is available under the [MIT License](LICENSE). Scripture text rights and provenance are addressed separately in [NOTICE](NOTICE).
