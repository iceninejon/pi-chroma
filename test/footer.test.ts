// The footer is one row: identity + context gauge on the left, session totals and git on the right.
import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { env, painter, plain, STYLES } from "./helpers.ts";
import { prism } from "../src/styles/prism.ts";
import { circuit } from "../src/styles/circuit.ts";
import { railStyle } from "../src/styles/rail.ts";
import type { FooterV, StyleImpl } from "../src/styles/types.ts";
import type { StyleName } from "../src/palettes.ts";

const IMPL: Record<StyleName, StyleImpl> = { prism, circuit, rail: railStyle };

const footer = (o: Partial<FooterV> = {}): FooterV => ({
	provider: "anthropic", model: "claude-sonnet-5-5", level: "high", levelColor: "s3",
	windowTokens: 200000, usedTokens: 61900, fraction: 0.3095, color: "s4",
	branch: "main", dirty: 3, sessIn: 412300, sessOut: 38900, cost: 1.84,
	tps: [71, 84, 79, 92, 88, 64, 90, 92.4], sessionRow: true, ...o,
});

for (const style of STYLES) {
	const impl = IMPL[style];
	const p = painter(style);
	const render = (W: number, v = footer()) => plain(p, impl.footer(env(W), v), W);

	test(`${style}: one row with everything when there is room`, () => {
		const rows = render(200);
		assert.equal(rows.length, 1);
		for (const want of ["claude-sonnet-5-5", "31%", "61.9k/200k", "412.3k", "38.9k", "1.84", "main", "±3"]) assert.ok(rows[0].includes(want), `${want} missing: ${rows[0]}`);
		assert.ok(/tps/i.test(rows[0]), "sparkline missing");
	});

	test(`${style}: drops sparkline, then cost, then used/total as space runs out`, () => {
		const has = (r: string) => ({
			spark: /tps/i.test(r),
			cost: r.includes("1.84"),
			totals: r.includes("61.9k/200k"),
			io: r.includes("412.3k"),
			branch: r.includes("main"),
		});
		let prev = has(render(240)[0]);
		assert.ok(prev.spark && prev.cost && prev.totals && prev.io && prev.branch);
		for (let W = 239; W >= 40; W--) {
			const row = render(W)[0];
			assert.ok(visibleWidth(row) <= W, `W=${W}`);
			const cur = has(row);
			// once something is dropped it never comes back at a smaller width
			for (const k of Object.keys(cur) as (keyof typeof cur)[]) assert.ok(!(cur[k] && !prev[k]), `${k} reappeared at W=${W}`);
			// priority: sparkline goes first, cost second, used/total third
			if (cur.spark) assert.ok(cur.cost && cur.totals && cur.io, `W=${W}`);
			if (cur.cost) assert.ok(cur.totals && cur.io, `W=${W}`);
			prev = cur;
		}
	});

	test(`${style}: sessionRow: false hides session totals`, () => {
		const r = render(200, footer({ sessionRow: false }))[0];
		assert.ok(!r.includes("412.3k") && !r.includes("1.84"));
		assert.ok(r.includes("main"));
	});

	test(`${style}: no cost chip at zero cost, no sparkline under 3 points`, () => {
		const r = render(240, footer({ cost: 0, tps: [50, 60] }))[0];
		assert.ok(!r.includes("0.00"));
		assert.ok(!/tps/i.test(r));
	});

	test(`${style}: context pressure shows in the percentage`, () => {
		assert.ok(render(100, footer({ usedTokens: 171900, fraction: 0.8595, color: "warn" }))[0].includes("86%"));
	});
}
