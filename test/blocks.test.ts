// Block frames (user / thinking / response / collapsed thinking) against the guide's redline frames.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { env, painter, STYLES, strip } from "./helpers.ts";
import { blockLayout, type BlockCtx } from "../src/styles/blocks.ts";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { StyleName } from "../src/palettes.ts";

const golden = JSON.parse(readFileSync(new URL("./golden/redlines.json", import.meta.url), "utf8"));
const rows = (style: string, state: string, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => golden[style][state][a + i] ?? "");

const PROMPT = "The login form flashes a red “Enter a valid email” error for a split second on first load. Find out why and fix it, then make sure the LoginForm tests still pass.";
const RESPONSE = [
	"The flash came from line 15 of LoginForm.tsx: the error state was initialised with validate(values), so the empty form failed validation on its very first render and a later effect cleared it. That round-trip is the flicker you saw.",
	"",
	"• error now starts as null and a touched flag gates it",
	"• validate() runs on blur and on submit, never during render",
	"",
	"The test that caught it, does not show an error before the user types, now passes along with the other 11 LoginForm tests.",
].join("\n");

/** What Markdown hands over: lines wrapped to mdW - 2p, padded by p on both sides to exactly mdW. */
function mdLines(text: string, mdW: number, p: number): string[] {
	const out: string[] = [];
	for (const para of text.split("\n")) {
		const lines = para ? wrapTextWithAnsi(para, mdW - 2 * p) : [""];
		for (const l of lines) out.push(" ".repeat(p) + l + " ".repeat(Math.max(0, mdW - p - visibleWidth(l))));
	}
	return out;
}

for (const style of STYLES) {
	const layout = blockLayout(style as StyleName);
	const P = painter(style as StyleName);
	const W = 100;
	const mk = (kind: "user" | "assistant" | "thinking", extra: Partial<BlockCtx["info"]> = {}): BlockCtx => ({
		env: env(W), p: 1, info: { kind, ...extra },
	});

	test(`${style}: user block`, () => {
		const c = mk("user", { time: "22:41:07" });
		const mdW = layout.mdWidth(c);
		const got = layout.frame(c, mdLines(PROMPT, mdW, 1), P).map((l) => strip(l).replace(/\s+$/, ""));
		const want = { prism: rows(style, "thinking", 1, 4), circuit: rows(style, "thinking", 1, 2), rail: rows(style, "thinking", 1, 3) }[style];
		assert.deepEqual(got, want);
	});

	test(`${style}: response block`, () => {
		const c = mk("assistant", { model: "claude-sonnet-5-5", time: style === "rail" ? "22:41:20" : undefined });
		const mdW = layout.mdWidth(c);
		const got = layout.frame(c, mdLines(RESPONSE, mdW, 1), P).map((l) => strip(l).replace(/\s+$/, ""));
		const at = { prism: [34, 43], circuit: [28, 37], rail: [29, 38] }[style];
		const want = rows(style, "done", at[0], at[1]);
		// The mockup wraps a few cells differently from pi's Markdown (right margin); compare the chrome and first words.
		assert.equal(got.length, want.length);
		assert.equal(got[0], want[0]);
		for (let i = 1; i < got.length; i++) assert.equal(got[i].slice(0, 12), want[i].slice(0, 12), `row ${i}`);
	});

	test(`${style}: collapsed thinking`, () => {
		const got = layout.collapsed(env(W), "2.4s", 180, P).map((l) => strip(l).replace(/\s+$/, ""));
		const at = { prism: [6, "done"], circuit: [4, "tools"], rail: [5, "tools"] }[style] as [number, string];
		assert.deepEqual(got, [golden[style][at[1]][at[0]].replace(/\s+$/, "")]);
	});

	test(`${style}: nothing overflows, at any width and padding`, () => {
		for (const width of [20, 40, 60, 80, 100, 160]) {
			for (const p of [0, 1]) {
				for (const kind of ["user", "assistant", "thinking"] as const) {
					const e = env(width, { pad: p });
					const c: BlockCtx = { env: e, p, info: { kind, model: "m".repeat(80), time: "22:41:07" }, live: kind === "thinking" ? { spin: "*", elapsed: "1.6s" } : undefined };
					const mdW = layout.mdWidth(c);
					const lines = layout.frame(c, mdLines("word ".repeat(80), mdW, p), P);
					for (const l of lines) assert.ok(visibleWidth(l) <= width, `${style} ${kind} W=${width} p=${p}: ${visibleWidth(l)}`);
					for (const l of layout.collapsed(e, "12.3s", 99999, P)) assert.ok(visibleWidth(l) <= width);
				}
			}
		}
	});
}
