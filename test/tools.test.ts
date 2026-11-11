import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBashText, parseDiff, parseReadText, headerArg, toolView, countDiff } from "../src/tools.ts";
import { NERD, ASCII } from "../src/glyphs.ts";
import { buildChips } from "../src/entries.ts";
import { sanitize, effectiveMotion, DEFAULT_CONFIG, loadConfig, saveConfig } from "../src/config.ts";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("parseReadText strips the continuation notice and reports totals", () => {
	const r = parseReadText("a\nb\nc\n\n[Showing lines 1-3 of 500. Use offset=4 to continue.]", 1);
	assert.deepEqual(r.lines, ["a", "b", "c"]);
	assert.equal(r.total, 500);
	const r2 = parseReadText("a\nb\n", 10);
	assert.deepEqual(r2.lines, ["a", "b"]);
	assert.equal(r2.total, 11);
});

test("parseBashText extracts the exit code", () => {
	assert.deepEqual(parseBashText("out\n\nCommand exited with code 2"), { output: ["out"], exit: 2 });
	assert.deepEqual(parseBashText("hello\n"), { output: ["hello"], exit: null });
	assert.deepEqual(parseBashText("Command exited with code 1"), { output: [], exit: 1 });
});

test("parseDiff handles pi's display diff", () => {
	const d = parseDiff("  9 context\n-10 old\n+10 new\n    ...\n+11 added");
	assert.deepEqual(d.map((l) => l.sign), [" ", "-", "+", "…", "+"]);
	assert.equal(d[1].num, "10");
	assert.equal(d[2].code, "new");
	assert.deepEqual(countDiff(d), { add: 2, del: 1 });
});

test("headerArg", () => {
	assert.equal(headerArg("read", { path: "a.ts", offset: 5, limit: 10 }), "a.ts:5-14");
	assert.equal(headerArg("read", { path: "a.ts" }), "a.ts");
	assert.equal(headerArg("bash", { command: "ls\npwd" }), "ls …");
	assert.equal(headerArg("grep", { pattern: "foo", path: "." }), "foo");
	assert.equal(headerArg("mcp__x__y", { a: 1, b: "two" }), "a=1 b=two");
});

test("toolView: states and status text", () => {
	const base = { args: { command: "false" }, details: undefined, expanded: false, spin: "*", durationMs: 1500 };
	const err = toolView({ ...base, name: "bash", text: "boom\n\nCommand exited with code 1", isError: true, pending: false }, NERD);
	assert.equal(err.state, "err");
	assert.equal(err.status, "exit 1 · 1.5s");
	const pend = toolView({ ...base, name: "bash", text: undefined, isError: false, pending: true }, NERD);
	assert.equal(pend.state, "pending");
	const gen = toolView({ ...base, name: "web_search", args: { query: "x" }, text: "result", isError: false, pending: false, durationMs: undefined }, NERD);
	assert.equal(gen.status, "done");
	assert.equal(gen.arg, "x");
	assert.equal(toolView({ ...base, name: "write", args: { path: "a", content: "1\n2\n" }, text: "ok", isError: false, pending: false }, NERD).status, "2 lines · 1.5s");
});

test("expanded read shows every line", () => {
	const text = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
	const v = toolView({ name: "read", args: { path: "a" }, text, details: undefined, isError: false, pending: false, durationMs: 100, expanded: true, spin: "*" }, NERD);
	assert.equal(v.body.length, 20);
});

test("turn stats chips: omissions and ascii de-dup", () => {
	const s = { v: 1 as const, ttftMs: null, decodeTps: 50, totalMs: 900, inTokens: 0, cachedTokens: 0, outTokens: 3, costUsd: null, aborted: true, model: "a/b" };
	const keys = buildChips(s, NERD).map((c) => c.key);
	assert.deepEqual(keys, ["total", "out"]); // aborted with < 8 tokens: no tps; no ttft; no in/cached; no cost
	const full = buildChips({ ...s, ttftMs: 1000, inTokens: 100, cachedTokens: 91, outTokens: 50, costUsd: 0.5, aborted: false }, ASCII);
	assert.deepEqual(full.map((c) => c.key), ["tps", "ttft", "total", "in", "cached", "out", "cost"]);
	assert.equal(full.find((c) => c.key === "in")!.icon, "");
	assert.equal(full.find((c) => c.key === "cost")!.icon, "$");
	assert.equal(full.find((c) => c.key === "cached")!.value, "91%");
});

test("config sanitize / motion override / round trip", () => {
	assert.deepEqual(sanitize(null), DEFAULT_CONFIG);
	assert.equal(sanitize({ style: "nope", glyphs: "ascii", motion: 3 }).style, "prism");
	assert.equal(sanitize({ glyphs: "ascii" }).glyphs, "ascii");
	assert.equal(sanitize({ bottomPad: 2 }).bottomPad, 2);
	assert.equal(sanitize({ bottomPad: 9 }).bottomPad, 3);
	assert.equal(sanitize({ bottomPad: -1 }).bottomPad, 0);
	assert.equal(sanitize({ bottomPad: "x" }).bottomPad, 0);
	assert.equal(effectiveMotion({ ...DEFAULT_CONFIG, motion: "full" }, { PI_CHROMA_MOTION: "off" } as never), "off");
	assert.equal(effectiveMotion({ ...DEFAULT_CONFIG, motion: "reduced" }, {} as never), "reduced");
	const file = join(mkdtempSync(join(tmpdir(), "chroma-")), "sub", "c.json");
	saveConfig({ ...DEFAULT_CONFIG, style: "rail" }, file);
	assert.equal(loadConfig(file).style, "rail");
	assert.ok(readFileSync(file, "utf8").endsWith("\n"));
	assert.deepEqual(loadConfig(join(tmpdir(), "does-not-exist-chroma.json")), DEFAULT_CONFIG);
});
