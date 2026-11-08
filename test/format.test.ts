import { test } from "node:test";
import assert from "node:assert/strict";
import * as f from "../src/format.ts";

test("tokens", () => {
	assert.equal(f.tokens(684), "684");
	assert.equal(f.tokens(61240), "61.2k");
	assert.equal(f.tokens(200000), "200k");
	assert.equal(f.tokens(1_420_000), "1.42M");
	assert.equal(f.tokens(999_990), "1.00M");
	assert.equal(f.tokens(0), "0");
});

test("pct / tps / ttft", () => {
	assert.equal(f.pct(0.3049), "30%");
	assert.equal(f.pct(1.4), "100%");
	assert.equal(f.tps(92.44), "92.4");
	assert.equal(f.ttft(1420), "1.42s");
	assert.equal(f.ttft(12300), "12.3s");
});

test("elapsed", () => {
	assert.equal(f.elapsed(13400), "13.4s");
	assert.equal(f.elapsed(64000), "1m 04s");
	assert.equal(f.elapsed(59990), "1m 00s");
	assert.equal(f.elapsed(3720000), "1h 02m");
});

test("cost and durations", () => {
	assert.equal(f.turnCost(0.0312), "0.031");
	assert.equal(f.sessionCost(1.836), "1.84");
	assert.equal(f.sessionCost(1.836, true), "$1.84");
	assert.equal(f.toolDuration(30), "<0.1s");
	assert.equal(f.toolDuration(300), "0.3s");
});

test("paths", () => {
	assert.equal(f.tildePath("/home/a/src/x", "/home/a"), "~/src/x");
	assert.equal(f.tildePath("/home/ab/src", "/home/a"), "/home/ab/src");
	assert.equal(f.middleEllipsis("abcdefghij", 6).length, 6);
	assert.ok(f.middleEllipsis("src/components/LoginForm.tsx", 14).endsWith("Form.tsx"));
});
