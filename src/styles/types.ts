// View models + the interface each style implements (guide §9–§11).
import type { Glyphs } from "../glyphs.ts";
import type { ColorKey, Row, Seg } from "../grid.ts";
import type { ContextColor } from "../metrics.ts";
import type { StyleName, ThinkLevel } from "../palettes.ts";

export type Motion = "full" | "reduced" | "off";

/** Everything a style needs to lay out one element. */
export interface Env {
	/** width passed to render(width) */
	W: number;
	g: Glyphs;
	/** animation tick (80 ms frames) */
	tick: number;
	motion: Motion;
	/** outputPad: 0 or 1 */
	pad: number;
}

export interface StatusV {
	verb: string;
	elapsed: string;
	/** `…` until the first delta */
	ttft: string;
	/** `119 tok` or `~312 tok` */
	tokens: string;
	/** keyText of the abort binding, e.g. `esc` */
	abortKey: string;
}

export interface WarningV {
	pct: string;
	pointPct: number;
	compactionEnabled: boolean;
}

export type PlanState = "todo" | "doing" | "done";
export interface PlanItem {
	text: string;
	state: PlanState;
}
export interface PlanV {
	items: PlanItem[];
	done: number;
}

export interface FooterV {
	provider: string;
	model: string;
	level: ThinkLevel;
	/** Pill fill for the thinking level (ramp colour) */
	levelColor: ColorKey;
	windowTokens: number;
	usedTokens: number;
	fraction: number;
	color: ContextColor;
	branch: string | null;
	dirty: number;
	sessIn: number;
	sessOut: number;
	cost: number;
	tps: number[];
	sessionRow: boolean;
}

export interface EditorV {
	cwd: string;
	busy: boolean;
}

export type ToolState = "pending" | "ok" | "err";

export interface BodyRow {
	segs: Seg[];
	/** Diff rows: background filled across the whole inner width */
	band?: ColorKey;
}

export interface ToolV {
	name: string;
	/** Glyph for the tool (already resolved) */
	icon: string;
	/** Header argument (path, command …), un-truncated */
	arg: string;
	state: ToolState;
	/** Status without icon, e.g. `142 lines · 0.3s` */
	status: string;
	body: BodyRow[];
	/** current spinner frame for this style */
	spin: string;
}

export interface Chip {
	key: "tps" | "ttft" | "total" | "in" | "cached" | "out" | "cost";
	icon: string;
	value: string;
	unit: string;
	color: ColorKey;
}

export interface StatsV {
	chips: Chip[];
	interrupted: boolean;
}

export interface BannerV {
	model: string;
	provider: string;
	cwd: string;
	branch: string | null;
	dirty: number;
}

export interface StyleImpl {
	name: StyleName;
	/** Spinner glyph for this style at `tick` */
	spinner(env: Env): string;
	status(env: Env, v: StatusV): Row[];
	warning(env: Env, v: WarningV): Row[];
	plan(env: Env, v: PlanV): Row[];
	footer(env: Env, v: FooterV): Row[];
	tool(env: Env, v: ToolV): Row[];
	stats(env: Env, v: StatsV): Row[];
	banner(env: Env, v: BannerV): Row[];
	/** Collapsed thinking line text (single Markdown/plain line, no ANSI) */
	collapsedThinking(env: Env, duration: string, tokens: number): string;
	editor: {
		/** Width to hand to the base editor's render() */
		innerWidth(env: Env): number;
		top(env: Env, v: EditorV): Row;
		bottom(env: Env, v: EditorV): Row;
		/** Chrome around a content row. `first` is the prompt row. */
		wrap(env: Env, v: EditorV, content: string, first: boolean): { left: Seg[]; right: Seg[] };
	};
}
