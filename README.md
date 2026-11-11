# pi-chroma

Three switchable visual styles for the [pi](https://pi.dev) coding agent — **Prism**, **Circuit** and **Rail** — each with a light and a dark theme, plus a TUI extension that draws:

- a one-row **footer**: provider / model / thinking level / context gauge on the left; session tokens in and out, cost, a TPS sparkline and git on the right;
- a live **status line** (spinner, shimmer verb, elapsed, TTFT, streamed tokens) and a **context-pressure warning**;
- a **plan widget**, fed by a `plan_update` tool the model can call;
- a **frame around every tool call** (header, body, status, duration), turning red on failure;
- a **stats row** after each prompt (decode tok/s, TTFT, total, in, cached %, out, cost), with an *interrupted* variant;
- **frames around the user, thinking and response blocks** (boxes in Prism, banded labels in Circuit, gutter rails in Rail), a framed **editor**, a startup banner, and a styled collapsed-thinking line.

| Prism | Circuit | Rail |
|---|---|---|
| Rounded boxes, capped pills and chips | Dense powerline HUD: tinted bands, arrow segments, block gauges | No boxes: a coloured gutter rail, hairline rules |

The extension only runs in the interactive TUI. In `print`, `json` and `rpc` modes it installs nothing and the `plan_update` tool is not registered.

## Install

```bash
pi install git:github.com/iceninejon/pi-chroma
```

To try it for one run without installing, from a local clone:

```bash
pi -e /path/to/pi-chroma/src/extension.ts --theme /path/to/pi-chroma/themes --use-theme chroma-prism-dark
```

Then pick a theme in `/settings` → **Theme**. To follow your terminal's light/dark mode, set the pair, for example `chroma-prism-light/chroma-prism-dark`.

**The active theme decides the style**: pick `chroma-rail-dark`, or the pair `chroma-rail-light/chroma-rail-dark`, in `/settings` and you get Rail (the `style` in `pi-chroma.json` only applies while a non-chroma theme is active). Use the pair, not a single light or dark theme: a single theme stays light on a dark terminal and the text turns dark-on-dark.

The extension chooses its own colours from `(style, theme.appearance)` and never hard-codes a mode. Colours that have a theme token are read from the active theme, so edits to the theme JSON take effect; pill fills, bands and the code chip come from the built-in palette.

## Use

| | |
|---|---|
| `/chroma` | Menu for **Style**, **Glyphs** and **Motion** |
| `/chroma style prism\|circuit\|rail` | Saves the style and switches to the matching `chroma-<style>-<light\|dark>` theme. An extension can only set one fixed theme (pi stores it), so afterwards set the **pair** `chroma-<style>-light/chroma-<style>-dark` in `/settings` to follow your terminal. |
| `/chroma glyphs nerd\|unicode\|ascii` | Icon set |
| `/chroma frames on\|off` | Frames around user / thinking / response blocks (on by default; see "How the block frames work") |
| `/chroma motion full\|reduced\|off` | `reduced` freezes the spinner and shimmer but keeps counters (refreshed once a second); `off` also stops the elapsed timer |
| `--chroma-style <style>` | Style for one run; does not touch your theme setting. Add `--use-theme chroma-<style>-dark` to colour pi's own text to match |
| `PI_CHROMA_MOTION=reduced\|off` | Environment override for motion |

Config lives in `~/.pi/agent/pi-chroma.json` (`PI_CODING_AGENT_DIR` is honoured; `PI_CHROMA_CONFIG` points at another file):

```json
{ "style": "prism", "glyphs": "nerd", "motion": "full", "turnStats": true, "planWidget": true, "sessionRow": true, "frames": true }
```

Press **Ctrl+T** (pi's *hide thinking*) to collapse thinking blocks to the `Thought for 2.4s · 180 tokens · ▸ collapsed` line.

## Terminal setup

- **Font:** *JetBrainsMono Nerd Font Mono* (the **Mono** variant, so every icon is exactly one cell) — <https://www.nerdfonts.com/font-downloads>. The non-Mono variant works too, because icons are always followed by a space. Without a Nerd Font use `/chroma glyphs unicode` or `ascii`.
- **Truecolor** (`COLORTERM=truecolor`); line height 1.0 so powerline caps meet their fills; ligatures may stay on.
- **Colours.** pi does not paint the terminal background, so contrast figures assume your terminal background matches the palette:

| Style · mode | Background | Foreground | Cursor | Selection |
|---|---|---|---|---|
| Prism · dark | `#111318` | `#e6e8ee` | `#ff6ac1` | `#1d2029` |
| Prism · light | `#fbfcfe` | `#1b2130` | `#c2186b` | `#eef1f6` |
| Circuit · dark | `#0e1014` | `#e8ecf2` | `#00e0b8` | `#181c24` |
| Circuit · light | `#f7f8fa` | `#10151f` | `#00786a` | `#e8ecf1` |
| Rail · dark | `#15171a` | `#dfe2e7` | `#7fdbca` | `#1d2024` |
| Rail · light | `#fcfcfd` | `#1c1f24` | `#0f766e` | `#f1f2f4` |

On other backgrounds of similar lightness the palettes stay readable, but the published contrast ratios no longer apply.

## Responsive behaviour

Everything is laid out in terminal cells for the width pi passes in. When the footer does not fit, things are dropped in this order until it does: TPS sparkline (shortened first), cost, `used/total`, the long context bar, the provider name, session tokens, the git branch, and finally everything except the model and the context percentage. Paths and commands elsewhere are ellipsised; numbers and status words never are.

## How the block frames work

pi has no public API for drawing the user, thinking and response blocks (checked again against pi 1.5.0; see `NOTES.md`). pi-chroma reaches them anyway, in a way that is **unofficial**:

1. the Markdown transformer prefixes each of those blocks with an invisible marker saying what it is;
2. `Markdown.prototype.render` and `Text.prototype.render` are wrapped: a marked block is rendered at a narrower width and surrounded with the style's chrome;
3. the originals are restored when the session shuts down or reloads, and anything unexpected falls back to pi's own rendering.

On start the extension probes the private fields it reads. If a future pi renames them, frames switch themselves off and the **fallback** takes over: a styled header line per block (`you`, `pi  <model>`), Rail's user message as a blockquote, and the collapsed-thinking line through pi's hidden-thinking label. You can also choose the fallback yourself with `/chroma frames off`.

## Known gaps

- The collapsed-thinking label is global in pi, so the duration shown on every collapsed block is the **latest** block's. Collapse thinking with **Ctrl+T**.
- The built-in loader is replaced by the status line, so pi's own "compacting" / "retrying" loader text is not shown.
- The footer replaces pi's, so text other extensions publish with `setStatus` is not displayed.
- Tools registered by other extensions keep their own `renderResult` output, nested inside our frame.
- Other extensions that restyle the footer, editor or message blocks (for example `pi-zentui`, `pi-beautiful-tui`) fight with this one. Disable them.
- With `/chroma frames off`: Rail's blockquote trick colours every blockquote in a response with the same rail colour, and a turn with text between tool calls shows several `pi` headers.

## Development

```bash
npm install            # typescript + @types/node only
npm run link-pi        # symlink the globally installed pi packages into node_modules
npm run typecheck
npm test               # unit tests + golden comparison against the guide's redline frames
```

- `src/styles/{prism,circuit,rail}.ts` build rows of `[text, style]` segments, `src/styles/blocks.ts` lays out the message-block frames and `src/blocks.ts` installs the render wrappers; `painter.ts` turns them into ANSI through the active pi theme; `tools.ts` and `metrics.ts` are pure.
- `test/golden/redlines.json` holds the redline frames (W = 100) extracted from the design guide; `test/redlines.test.ts` renders each element and compares text. `test/widths.test.ts` checks that nothing overflows its width at 12–200 columns in every style and glyph set.
- `scripts/tui-harness.py` drives a real pi in a pty and dumps the emulated screen (needs `pip install pyte pexpect`); handy for checking widths, motion and interruption by hand. It runs against a throw-away agent dir (`CHROMA_AGENT_DIR`).
- `scripts/gen-palettes.mjs` regenerates `src/palettes.ts` from the guide's `palettes.json`.
