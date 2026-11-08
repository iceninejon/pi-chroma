// No rendered line may exceed the width it was given (guide §5.1), at any width, in any style / glyph set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { env, painter, STYLES } from "./helpers.ts";
import { segW } from "../src/grid.ts";
import { prism } from "../src/styles/prism.ts";
import { circuit } from "../src/styles/circuit.ts";
import { railStyle } from "../src/styles/rail.ts";
import { glyphSet, type GlyphSetName } from "../src/glyphs.ts";
import { toolView } from "../src/tools.ts";
import type { Chip, FooterV, StyleImpl } from "../src/styles/types.ts";
import type { StyleName } from "../src/palettes.ts";
import { buildChips } from "../src/entries.ts";

const IMPL: Record<StyleName, StyleImpl> = { prism, circuit, rail: railStyle };
const WIDTHS = [12, 20, 30, 40, 55, 59, 60, 61, 70, 79, 80, 81, 99, 100, 101, 120, 200];

const footer = (o: Partial<FooterV> = {}): FooterV => ({
	provider: "anthropic-with-a-long-name", model: "claude-sonnet-5-5-extended-thinking-preview", level: "xhigh", levelColor: "s3",
	windowTokens: 1_000_000, usedTokens: 912_345, fraction: 0.91, color: "err",
	branch: "feature/a-very-long-branch-name-for-testing", dirty: 128, sessIn: 12_345_678, sessOut: 987_654, cost: 1234.5,
	tps: [71, 84, 79, 92, 88, 64, 90, 92.4], sessionRow: true, ...o,
});

for (const gl of ["nerd", "unicode", "ascii"] as GlyphSetName[]) {
	for (const style of STYLES) {
		test(`${style}/${gl}: nothing exceeds its width`, () => {
			const impl = IMPL[style];
			const p = painter(style);
			const g = glyphSet(gl);
			const bad: string[] = [];
			const longArg = "src/components/very/deeply/nested/directory/structure/with/a/LongComponentName.test.tsx";
			const longBash = "npm run build && npm test -- --coverage --watchAll=false --reporters=default --reporters=jest-junit";
			for (const W of WIDTHS) {
				const e = env(W, { glyphs: gl, tick: 7 });
				const check = (what: string, rows: ReturnType<typeof impl.footer>) => {
					// Measure the unclipped segments: layout must fit by itself, not by the painter's safety clip.
					for (const r of rows) if (segW(r.segs) > W) bad.push(`${style}/${gl} W=${W} ${what}: unclipped row is ${segW(r.segs)} cells`);
					for (const l of p.rows(rows, W)) assert.ok(visibleWidth(l) <= W, `${style}/${gl} W=${W} ${what}: ${visibleWidth(l)} > ${W}: ${JSON.stringify(l)}`);
				};
				check("footer", impl.footer(e, footer()));
				check("footer(min)", impl.footer(e, footer({ provider: "p", model: "m", branch: null, dirty: 0, tps: [], cost: 0 })));
				check("status", impl.status(e, { verb: "Running a_very_long_tool_name", elapsed: "1h 02m", ttft: "12.3s", tokens: "~1.2M tok", abortKey: "esc" }));
				check("warning", impl.warning(e, { pct: "96%", pointPct: 92, compactionEnabled: true }));
				check("warning(off)", impl.warning(e, { pct: "96%", pointPct: 92, compactionEnabled: false }));
				check("plan", impl.plan(e, { done: 1, items: [{ text: longArg, state: "done" }, { text: "short", state: "doing" }, { text: longBash, state: "todo" }] }));
				check("banner", impl.banner(e, { model: "m".repeat(60), provider: "p".repeat(30), cwd: "~/" + "d/".repeat(40), branch: "b".repeat(40), dirty: 3 }));
				const chips: Chip[] = buildChips({ v: 1, ttftMs: 12345, decodeTps: 1234.5, totalMs: 3_700_000, inTokens: 12_345_678, cachedTokens: 5_000_000, outTokens: 987_654, costUsd: 123.456, aborted: true, model: "a/b" }, g);
				check("stats", impl.stats(e, { chips, interrupted: true }));
				for (const [pending, isErr] of [[true, false], [false, false], [false, true]] as const) {
					for (const name of ["read", "bash", "edit", "write", "mcp__server__tool"]) {
						const v = toolView({
							name, args: { path: longArg, command: longBash, content: "a\nb\nc\nd\ne", pattern: longArg, offset: 13 },
							text: Array.from({ length: 30 }, (_, i) => `line ${i} ${"x".repeat(150)}`).join("\n") + (isErr ? "\n\nCommand exited with code 2" : ""),
							details: { diff: "-1 old line " + "y".repeat(200) + "\n+1 new line " + "z".repeat(200) },
							isError: isErr, pending, durationMs: 12345, expanded: !pending && !isErr, spin: impl.spinner(e),
						}, g);
						check(`tool ${name} pending=${pending} err=${isErr}`, impl.tool(e, v));
					}
				}
				const ev = { cwd: "~/" + "dir/".repeat(30), busy: false };
				check("editor.top", [impl.editor.top(e, ev)]);
				check("editor.bottom", [impl.editor.bottom(e, ev)]);
				// editor content rows: chrome + inner width must fit
				const inner = impl.editor.innerWidth(e);
				const { left, right } = impl.editor.wrap(e, ev, "", true);
				const chrome = p.segs(left) + "x".repeat(inner) + p.segs(right);
				if (W >= 20 && visibleWidth(chrome) > W) bad.push(`${style}/${gl} W=${W} editor row ${visibleWidth(chrome)}`);
			}
			assert.deepEqual(bad, []);
		});
	}
}
