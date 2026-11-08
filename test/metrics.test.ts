import { test } from "node:test";
import assert from "node:assert/strict";
import {
	RunTracker, sessionTotals, tpsHistory, compactionInfo, contextState, usageIn, TURN_STATS_TYPE,
} from "../src/metrics.ts";

const u = (o: Partial<{ input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }>) => ({
	input: o.input ?? 0, output: o.output ?? 0, cacheRead: o.cacheRead ?? 0, cacheWrite: o.cacheWrite ?? 0,
	cost: { total: o.cost ?? 0 },
});

test("normal run: ttft, decode tps, totals", () => {
	const r = new RunTracker();
	r.begin(1000);
	assert.equal(r.live(1500).ttftMs, null);
	r.messageStart();
	r.delta(2400, "thinking", 40); // ttft = 1400
	r.delta(3000, "text", 400);
	r.messageEnd(5400, u({ input: 5000, output: 400, cacheRead: 50000, cost: 0.031 }), "anthropic/x");
	const s = r.finish(8000, false);
	assert.equal(s.ttftMs, 1400);
	assert.equal(s.totalMs, 7000);
	// 400 tokens over (5400-2400)=3 s of streaming
	assert.ok(Math.abs(s.decodeTps! - 400 / 3) < 1e-9);
	assert.equal(s.inTokens, 55000);
	assert.equal(s.cachedTokens, 50000);
	assert.equal(s.outTokens, 400);
	assert.equal(s.costUsd, 0.031);
	assert.equal(s.aborted, false);
	assert.equal(s.model, "anthropic/x");
	assert.equal(r.active, false);
});

test("tool-heavy run excludes tool time from decode tps", () => {
	const r = new RunTracker();
	r.begin(0);
	r.messageStart();
	r.delta(1000, "tool", 10);
	r.messageEnd(2000, u({ output: 100 }));
	r.toolStart("bash");
	assert.equal(r.phase, "tools");
	r.toolEnd();
	assert.equal(r.phase, "between");
	r.messageStart();
	r.delta(12000, "text", 10); // 10 s tool gap, not counted
	r.messageEnd(13000, u({ output: 100 }));
	const s = r.finish(13000, false);
	// 200 tokens / (1 s + 1 s)
	assert.equal(Math.round(s.decodeTps!), 100);
	assert.equal(s.ttftMs, 1000);
});

test("aborted run with no tokens", () => {
	const r = new RunTracker();
	r.begin(0);
	const s = r.finish(900, true);
	assert.equal(s.aborted, true);
	assert.equal(s.ttftMs, null);
	assert.equal(s.decodeTps, null);
	assert.equal(s.costUsd, null);
	assert.equal(s.inTokens, 0);
});

test("live token estimate swaps for the real count at message end", () => {
	const r = new RunTracker();
	r.begin(0);
	r.messageStart();
	r.delta(100, "text", 1000);
	let l = r.live(200);
	assert.equal(l.outTokens, 250);
	assert.equal(l.estimated, true);
	r.messageEnd(300, u({ output: 300 }));
	l = r.live(400);
	assert.equal(l.outTokens, 300);
	assert.equal(l.estimated, false);
});

test("cache-heavy: cost hidden at zero, cached counted", () => {
	const r = new RunTracker();
	r.begin(0);
	r.messageStart();
	r.delta(10, "text", 4);
	r.messageEnd(20, u({ input: 10, output: 1, cacheRead: 990, cacheWrite: 0 }));
	const s = r.finish(30, false);
	assert.equal(s.costUsd, null);
	assert.equal(s.cachedTokens, 990);
	assert.equal(s.inTokens, 1000);
});

test("usageIn", () => {
	assert.equal(usageIn({ input: 1, cacheRead: 2, cacheWrite: 3 }), 6);
	assert.equal(usageIn(undefined), 0);
});

test("session totals include compaction usage; compaction mid-session", () => {
	const entries = [
		{ type: "message", message: { role: "user" } },
		{ type: "message", message: { role: "assistant", usage: u({ input: 100, output: 10, cacheRead: 900, cost: 0.5 }) } },
		{ type: "compaction", usage: u({ input: 50, output: 5, cost: 0.1 }) },
		{ type: "message", message: { role: "assistant", usage: u({ input: 10, output: 20, cost: 0.2 }) } },
	];
	const t = sessionTotals(entries);
	assert.equal(t.inTokens, 1060);
	assert.equal(t.outTokens, 35);
	assert.ok(Math.abs(t.costUsd - 0.8) < 1e-9);
});

test("tps history keeps the last 8 in order", () => {
	const entries = Array.from({ length: 12 }, (_, i) => ({
		type: "custom", customType: TURN_STATS_TYPE, data: { decodeTps: i + 1 },
	}));
	entries.splice(3, 0, { type: "custom", customType: "other", data: { decodeTps: 999 } });
	assert.deepEqual(tpsHistory(entries), [5, 6, 7, 8, 9, 10, 11, 12]);
});

test("context pressure thresholds", () => {
	const c = compactionInfo(200_000, { enabled: true, reserveTokens: 20_000 });
	assert.equal(c.point, 180_000);
	const lo = contextState(60_000, 200_000, c);
	assert.equal(lo.color, "s4");
	assert.equal(lo.warn, false);
	const w = contextState(150_000, 200_000, c);
	assert.equal(w.color, "warn");
	assert.equal(w.warn, true);
	assert.equal(w.pointPct, 90);
	assert.equal(contextState(180_000, 200_000, c).color, "err");
	// within 2 % of the compaction point even when < 90 %
	const c2 = compactionInfo(100_000, { enabled: true, reserveTokens: 20_000 });
	assert.equal(contextState(79_000, 100_000, c2).color, "err");
	// warn within 8 % of the point even under 75 %
	const c3 = compactionInfo(100_000, { enabled: true, reserveTokens: 40_000 });
	assert.equal(contextState(53_000, 100_000, c3).warn, true);
	// compaction off
	const off = compactionInfo(200_000, { enabled: false });
	assert.equal(contextState(170_000, 200_000, off).warn, true);
	assert.equal(contextState(100_000, 200_000, off).warn, false);
	assert.equal(contextState(null, 200_000, off).used, 0);
});

test("per-model compaction override", () => {
	const c = compactionInfo(100_000, { enabled: true, reserveTokens: 10_000, modelOverrides: { "a/b": { reserveTokens: 30_000 } } }, "a/b");
	assert.equal(c.point, 70_000);
});
