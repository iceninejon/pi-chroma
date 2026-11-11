# Changelog

## [0.3.1]

- `/chroma padding 0-3` (`bottomPad`): blank rows under the footer, for multiplexer status bars.

## [0.3.0]

- Footer is one row: session ↑in ↓out, cost and TPS sparkline moved next to the context gauge; the second row is gone. Cost and sparkline are dropped first when space runs out.

## [0.2.1]

- The active chroma theme now decides the style (theme pairs and `/settings` just work); `--chroma-style` no longer rewrites pi's theme setting.

## [0.2.0]

- Frames around user, thinking and response blocks, and a styled collapsed-thinking line (wraps pi's Markdown render; falls back to header lines). `/chroma frames on|off`.

## [0.1.0]

- Six themes: `chroma-{prism,circuit,rail}-{dark,light}`.
- TUI extension: two-row footer, status line with shimmer and live counters, plan widget (`plan_update` tool), context-pressure warning, tool frames for every tool, per-prompt stats row, editor frame, startup banner.
- `/chroma` command and `--chroma-style` flag; `nerd` / `unicode` / `ascii` glyph sets; `full` / `reduced` / `off` motion.
