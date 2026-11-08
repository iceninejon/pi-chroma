# M0 findings

Investigated against `@earendil-works/pi-coding-agent` **1.5.0** (installed copy: `docs/`, `dist/*.d.ts`, `dist/**/*.js`, `examples/`).
Source paths below are relative to that package. Each **VERIFY** item from the implementation guide is answered yes/no.

## VERIFY items

| # | Guide assumption | Answer | Evidence |
|---|---|---|---|
| 1 | A `registerToolRenderer` resolver may return `renderShell` for built-in tools | **Yes** | `ToolRenderers = Pick<ToolDefinition, "renderShell" \| "renderCall" \| "renderResult">` (`dist/core/extensions/types.d.ts`). `ToolExecutionComponent.getRenderShell()` reads `renderShell` from the resolved definition (`dist/modes/interactive/components/tool-execution.js`), and `getRegisteredToolDefinition()` runs the resolvers before the built-in renderers (`interactive-mode.js`). The shell is chosen once, when the row is constructed. |
| 2 | `CustomEditor` exposes `render(width)` for wrapping | **Yes** | `CustomEditor extends Editor`; `Editor.render(width)` returns `[top border, …content rows, bottom border, …autocomplete rows]`. `examples/extensions/border-status-editor.ts` wraps `super.render()` the same way. |
| 3 | `message_update` event type names | `assistantMessageEvent.type` ∈ `start`, `text_start/delta/end`, `thinking_start/delta/end`, `toolcall_start/delta/end`, `done`, `error` | `@earendil-works/pi-ai` `AssistantMessageEvent`. |
| 4 | `usage.input` excludes cache tokens | **Yes** (normalised) | `pi-ai/dist/api/openai-completions.js` `parseChunkUsage`: `input = prompt − cacheRead − cacheWrite`, `totalTokens = input + output + cacheRead + cacheWrite`. Anthropic/Google providers report the same shape. So *In* = `input + cacheRead + cacheWrite`. |
| 5 | pi exports an agent-dir helper | **Yes** | `getAgentDir()` is exported from `@earendil-works/pi-coding-agent`. |
| 6 | `ctx.ui.theme.appearance` exists | **Yes** | `Theme.appearance` (`"dark" \| "light"`), `docs/themes.md`. |
| 7 | `ctx.ui.setTheme(name)` | **Yes**, returns `{ success, error? }`, and it persists the choice to `settings.json` | `ExtensionUIContext.setTheme`. |
| 8 | `keyText` of the abort binding | Available only inside renderer contexts (`ToolRenderContext.keyText`, `EntryRenderOptions.keyText`). Not on `ExtensionContext`. | We read `app.interrupt` from the first renderer context and default to `esc`. |
| 9 | `pi.getSettings()` carries compaction settings | **Yes** (`compaction.enabled`, `reserveTokens`, `modelOverrides`) | `docs/settings.md`, `ExtensionAPI.getSettings`. |
| 10 | `appendEntry` + `registerEntryRenderer` render live | **Yes**, the row appears as soon as the entry is appended; host adds the blank row above it. | Confirmed in a real TUI run. `CustomEntryComponent` adds `Spacer(1)`. |
| 11 | `agent_settled` as run end | **Yes**; carries `aborted: boolean` (Escape). | `docs/extensions.md`. |

Other facts that shaped the build:

- Extensions are bound (`session_start`) **before** `renderInitialMessages()`, so tool rows of a resumed session already see the extension state.
- A tool row is `[renderCall component, renderResult component]` in one container. With `renderShell: "self"` pi adds only one blank row above them. The extension therefore draws the **whole frame from the `renderCall` slot** and leaves the `renderResult` slot empty; the frame reads the latest result from shared row state.
- `ctx.mode` is `"tui" | "rpc" | "json" | "print"`. Everything is gated on it. `plan_update` is registered inside `session_start` (TUI only), so print/json modes see no extra tool.
- pi's TUI default is **fullscreen** (`--tui-mode fullscreen`). The layout is width-only and works in both modes.
- Node strips TS types natively (no `enum`, no constructor parameter properties). `tsconfig.json` sets `erasableSyntaxOnly` so tests and pi's jiti loader agree.

## Tier C — framing built-in messages (§2.1)

Searched `dist/modes/interactive/components/` (`user-message`, `assistant-message`, …) and `ExtensionUIContext`/`ExtensionAPI`:

- No factory, registry or `set*Component` hook exists for the built-in **user**, **assistant** or **thinking** blocks.
- `registerMessageRenderer` only handles *custom* messages (`customType`).
- The only reachable levers are the theme tokens, `registerMarkdownTransformer` (user / assistant / assistant-thinking Markdown) and `setHiddenThinkingLabel`.

So the documented fallbacks ship (see README "Known gaps"): a styled header line per block via the Markdown transformer, Rail's user message as a blockquote, and the collapsed-thinking line through the global hidden-thinking label.

An upstream issue proposing `registerMessageRenderer` support for the built-in roles would remove all of these gaps.

## Deviations from the mockup

The guide says it wins over the mockup; these are the places where the *guide's own frames* were adjusted for correctness:

| Where | Mockup / guide frame | Build | Why |
|---|---|---|---|
| Rail footer row 2 at W = 100 with 8 TPS points | Right group overflows and is clipped to `⣄⣶⣦⣿⣷⡀⣷⣿ tp…` | Sparkline shrinks to the newest points that fit (min 3); dropped if fewer fit | A clipped `tp…` is a mockup artefact. Applies to all three styles. |
| `read` header | `read src/…/LoginForm.tsx` | Adds `:start-end` only when the call passes both `offset` and `limit` | Keeps the common case identical to the frame. |
| `bash` output | First rows | Last 4 rows, with `… N earlier lines` above | The tail of a build/test run is the useful part. |
| ASCII glyph set | Icon words and unit words both shown (`in 6.9k in`) | Icon dropped when the chip has a unit word | Avoids `[ttft 0.37s ttft]`. |
| Streaming output tokens | Mockup shows `119 tok` | `~119 tok` until the message ends | Required by §4.2. |
