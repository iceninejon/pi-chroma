// Turn-stats entry renderer (guide §12.2, M6).
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { elapsed, pct, tokens, tps, ttft, turnCost } from "./format.ts";
import type { Glyphs } from "./glyphs.ts";
import { MIN_TPS_TOKENS, TURN_STATS_TYPE, type TurnStats } from "./metrics.ts";
import { rt } from "./runtime.ts";
import type { Chip, StatsV } from "./styles/types.ts";

/** Build the stats chips in §12.2 order; absent metrics are omitted. */
export function buildChips(s: TurnStats, g: Glyphs): Chip[] {
	const chips: Chip[] = [];
	if (s.decodeTps !== null && !(s.aborted && s.outTokens < MIN_TPS_TOKENS)) {
		chips.push({ key: "tps", icon: g.bolt, value: tps(s.decodeTps), unit: "tok/s", color: "s4" });
	}
	if (s.ttftMs !== null) chips.push({ key: "ttft", icon: g.timer, value: ttft(s.ttftMs), unit: "ttft", color: "s1" });
	chips.push({ key: "total", icon: g.clock, value: elapsed(s.totalMs), unit: "total", color: "s3" });
	if (s.inTokens > 0) {
		chips.push({ key: "in", icon: g.up, value: tokens(s.inTokens), unit: "in", color: "user" });
		chips.push({ key: "cached", icon: g.db, value: pct(s.cachedTokens / s.inTokens), unit: "cached", color: "muted" });
	}
	if (s.outTokens > 0 || !s.aborted) chips.push({ key: "out", icon: g.down, value: tokens(s.outTokens), unit: "out", color: "accent" });
	if (s.costUsd !== null && s.costUsd > 0) chips.push({ key: "cost", icon: g.dollar, value: turnCost(s.costUsd), unit: "", color: "tool" });
	// ASCII set: icons are words ("in", "ttft" …) that would only repeat the unit word.
	if (g.caps === "brackets") for (const c of chips) if (c.unit) c.icon = "";
	return chips;
}

class StatsRow implements Component {
	data: TurnStats;
	constructor(data: TurnStats) {
		this.data = data;
	}
	invalidate(): void {}
	render(width: number): string[] {
		try {
			const v: StatsV = { chips: buildChips(this.data, rt.g), interrupted: this.data.aborted };
			return rt.painter().rows(rt.impl.stats(rt.env(width), v), width);
		} catch {
			return [];
		}
	}
}

export function registerEntryRenderers(pi: ExtensionAPI): void {
	pi.registerEntryRenderer<TurnStats>(TURN_STATS_TYPE, (entry, options) => {
		try {
			const k = options.keyText("app.interrupt");
			if (k) rt.abortKey = k.replace(/^escape$/i, "esc");
		} catch {
			/* ignore */
		}
		if (!rt.enabled || !rt.config.turnStats || !entry.data || entry.data.v !== 1) return undefined;
		return new StatsRow(entry.data);
	});
}
