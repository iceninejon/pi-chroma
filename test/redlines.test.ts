// Compares the style renderers against the guide's redline frames (W = 100), ANSI stripped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { env, painter, plain, STYLES } from "./helpers.ts";
import { prism } from "../src/styles/prism.ts";
import { circuit } from "../src/styles/circuit.ts";
import { railStyle } from "../src/styles/rail.ts";
import type { Chip, FooterV, StatusV, StyleImpl } from "../src/styles/types.ts";
import type { StyleName } from "../src/palettes.ts";
import { NERD } from "../src/glyphs.ts";

const golden = JSON.parse(readFileSync(new URL("./golden/redlines.json", import.meta.url), "utf8"));
const IMPL: Record<StyleName, StyleImpl> = { prism, circuit, rail: railStyle };
const g = NERD;

const footer = (o: Partial<FooterV> = {}): FooterV => ({
	provider: "anthropic", model: "claude-sonnet-5-5", level: "high", levelColor: "s3",
	windowTokens: 200000, usedTokens: 61900, fraction: 0.3095, color: "s4",
	branch: "main", dirty: 3, sessIn: 412300, sessOut: 38900, cost: 1.84,
	tps: [71, 84, 79, 92, 88, 64, 90, 92.4], sessionRow: true, ...o,
});

function rowsOf(style: StyleName, state: string, from: number, to: number): string[] {
	const out: string[] = [];
	for (let i = from; i <= to; i++) out.push(golden[style][state][i] ?? "");
	return out;
}

for (const style of STYLES) {
	const impl = IMPL[style];
	const p = painter(style);

	test(`${style}: warning`, () => {
		const got = plain(p, impl.warning(env(100), { pct: "86%", pointPct: 90, compactionEnabled: true }), 100);
		assert.deepEqual(got, rowsOf(style, "pressure", 48, 48));
	});

	test(`${style}: status line (waiting on first tokens after thinking)`, () => {
		const v: StatusV = { verb: "Pondering", elapsed: "3.0s", ttft: "1.42s", tokens: "119 tok", abortKey: "esc" };
		const got = plain(p, impl.status(env(100), v), 100);
		assert.deepEqual(got, rowsOf(style, "thinking", 48, 48));
	});
}

// ── Tool frames, plan, stats (done / tools frames) ─────────────────────────

import { toolView, type ToolInput } from "../src/tools.ts";

const fileLines = (n: number) =>
	Array.from({ length: n }, (_, i) =>
		i === 0 ? "export function LoginForm({ onSubmit }: Props) {"
		: i === 1 ? "  const [values, setValues] = useState({ email: '', password: '' });"
		: i === 2 ? "  const [error, setError] = useState(validate(values));"
		: `  line ${i}`).join("\n");

const FAIL_TEXT = [
	"FAIL  src/components/LoginForm.test.tsx",
	`  ${g.cross} does not show an error before the user types (38 ms)`,
	"    Expected: null",
	'    Received: "Enter a valid email"',
	"",
	"Command exited with code 1",
].join("\n");

const DIFF = [
	"-15   const [error, setError] = useState(validate(values));",
	"+15   const [error, setError] = useState<string | null>(null);",
	"+16   const [touched, setTouched] = useState(false);",
].join("\n");

function mk(style: StyleName, partial: Partial<ToolInput> & { name: string }): ToolInput {
	const e = env(100);
	return {
		args: {}, text: "", details: undefined, isError: false, pending: false, durationMs: 0, expanded: false,
		spin: IMPL[style].spinner(e), ...partial,
	};
}

const toolCases = (style: StyleName) => ({
	read: mk(style, { name: "read", args: { path: "src/components/LoginForm.tsx", offset: 13 }, text: fileLines(130), durationMs: 300 }),
	bashErr: mk(style, { name: "bash", args: { command: "npm test -- LoginForm" }, text: FAIL_TEXT, isError: true, durationMs: 1500 }),
	edit: mk(style, { name: "edit", args: { path: "src/components/LoginForm.tsx" }, text: "ok", details: { diff: DIFF }, durationMs: 700 }),
	bashOk: mk(style, { name: "bash", args: { command: "npm test -- LoginForm" }, text: "PASS  src/components/LoginForm.test.tsx  12 passed", durationMs: 2200 }),
	editPending: mk(style, { name: "edit", args: { path: "src/components/LoginForm.tsx" }, text: undefined, pending: true, durationMs: undefined }),
});

const TOOL_ROWS: Record<StyleName, Record<string, [number, number]>> = {
	prism: { read: [8, 13], bashErr: [15, 21], edit: [23, 27], bashOk: [29, 32] },
	circuit: { read: [6, 10], bashErr: [12, 17], edit: [19, 22], bashOk: [24, 26] },
	rail: { read: [7, 11], bashErr: [13, 18], edit: [20, 23], bashOk: [25, 27] },
};

for (const style of STYLES) {
	const impl = IMPL[style];
	const p = painter(style);
	const cases = toolCases(style);

	for (const key of ["read", "bashErr", "edit", "bashOk"] as const) {
		test(`${style}: tool frame · ${key}`, () => {
			const e = env(100);
			const got = plain(p, impl.tool(e, toolView(cases[key], g)), 100);
			const [a, b] = TOOL_ROWS[style][key];
			let want = rowsOf(style, "done", a, b);
			if (style === "prism") want = want.map((r) => r.replace(/^ /, " "));
			assert.deepEqual(got, want);
		});
	}

	test(`${style}: tool frame · pending edit`, () => {
		const e = env(100);
		const got = plain(p, impl.tool(e, toolView(cases.editPending, g)), 100);
		const rows = { prism: [23, 25], circuit: [19, 20], rail: [20, 21] }[style];
		assert.deepEqual(got, rowsOf(style, "tools", rows[0], rows[1]));
	});

	test(`${style}: plan 2/4`, () => {
		const items = [
			{ text: "Read LoginForm and its tests", state: "done" as const },
			{ text: "Reproduce with the failing test", state: "done" as const },
			{ text: "Patch the initial error state", state: "doing" as const },
			{ text: "Re-run the LoginForm tests", state: "todo" as const },
		];
		const got = plain(p, impl.plan(env(100), { items, done: 2 }), 100);
		const rows = { prism: [43, 48], circuit: [44, 48], rail: [44, 48] }[style];
		assert.deepEqual(got, rowsOf(style, "tools", rows[0], rows[1]));
	});

	test(`${style}: turn stats`, () => {
		const chips: Chip[] = [
			{ key: "tps", icon: g.bolt, value: "92.4", unit: "tok/s", color: "s4" },
			{ key: "ttft", icon: g.timer, value: "1.42s", unit: "ttft", color: "s1" },
			{ key: "total", icon: g.clock, value: "13.4s", unit: "total", color: "s3" },
			{ key: "in", icon: g.up, value: "61.2k", unit: "in", color: "user" },
			{ key: "cached", icon: g.db, value: "91%", unit: "cached", color: "muted" },
			{ key: "out", icon: g.down, value: "684", unit: "out", color: "accent" },
			{ key: "cost", icon: g.dollar, value: "0.031", unit: "", color: "tool" },
		];
		const got = plain(p, impl.stats(env(100), { chips, interrupted: false }), 100);
		const at = { prism: 45, circuit: 39, rail: 40 }[style];
		assert.equal(got[0], golden[style].done[at].replace(/\s+$/, ""));
		if (style === "rail") {
			assert.equal(got[1], "");
			assert.equal(got[2], golden.rail.done[42].replace(/\s+$/, ""));
		}
	});
}
