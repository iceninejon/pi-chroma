// Pieces shared by the three styles.
import { clipSegs, lr, segW, sp, spark as sparkSegs, type ColorKey, type Row, type Seg, type St } from "../grid.ts";
import type { Env, Chip, PlanItem } from "./types.ts";
import type { StyleImpl } from "./types.ts";
import type { Glyphs } from "../glyphs.ts";
import type { PaletteKey } from "../palettes.ts";

export const st = (fg?: ColorKey, extra?: Partial<St>): St => ({ fg, ...extra });
export const bold = (fg?: ColorKey): St => ({ fg, b: true });
export const italic = (fg?: ColorKey): St => ({ fg, i: true });

/** Spinner frame: frame 0 when motion is reduced/off. */
export function spinFrame(env: Env, frames: readonly string[]): string {
	if (!frames.length) return "";
	return env.motion === "full" ? frames[env.tick % frames.length] : frames[0];
}

/** Shimmer over a status verb (§7.4, §8). Head = fg bold, neighbours = mix bold, rest = `base`. */
export function shimmer(text: string, base: St, env: Env): Seg[] {
	if (env.motion !== "full") return [[text, base]];
	const chars = Array.from(text);
	const cycle = chars.length + 14;
	const p = (env.tick % cycle) - 4;
	const out: Seg[] = [];
	let cur = "";
	let curKind = -1;
	const kindStyle = (k: number): St => (k === 0 ? { fg: "fg", b: true } : k === 1 ? { fg: "mix", b: true } : base);
	chars.forEach((ch, i) => {
		const d = Math.abs(i - p);
		const k = d === 0 ? 0 : d === 1 ? 1 : 2;
		if (k !== curKind && cur) {
			out.push([cur, kindStyle(curKind)]);
			cur = "";
		}
		curKind = k;
		cur += ch;
	});
	if (cur) out.push([cur, kindStyle(curKind)]);
	return out;
}

/** Prism-style pill: `{rndL}` + text + `{rndR}` (nerd), plain fill (unicode) or `[text]` (ascii). */
export function pill(g: Glyphs, text: string, bg: ColorKey, fg: ColorKey = "onSeg"): Seg[] {
	if (g.caps === "brackets") return [[`[${text.trim()}]`, { fg: bg, b: true }]];
	if (g.caps === "plain") return [[text, { bg, fg, b: true }]];
	return [
		[g.rndL, { fg: bg }],
		[text, { bg, fg, b: true }],
		[g.rndR, { fg: bg }],
	];
}

/** Circuit-style arrow segment: label on `c`, followed by `{plR}` in `c` on `next`. */
export function seg(g: Glyphs, label: string, c: ColorKey, next?: ColorKey, fg: ColorKey = "onSeg"): Seg[] {
	if (g.caps === "brackets") return [[`[${label.trim()}]`, { fg: c, b: true }], sp(1)];
	if (g.caps === "plain") return [[label, { bg: c, fg, b: true }], sp(1)];
	return [
		[label, { bg: c, fg, b: true }],
		[g.plR, { fg: c, bg: next }],
	];
}

/** A chain of arrow segments (Circuit stats / footer); the last arrow has no background. */
export function chain(g: Glyphs, items: { label: string; c: ColorKey; fg?: ColorKey }[]): Seg[] {
	if (g.caps === "brackets") return items.flatMap((it) => [[`[${it.label.trim()}]`, { fg: it.c, b: true }] as Seg, sp(1)]);
	if (g.caps === "plain") return items.map((it) => [it.label, { bg: it.c, fg: it.fg ?? "onSeg", b: true }] as Seg);
	const out: Seg[] = [];
	items.forEach((it, i) => {
		out.push([it.label, { bg: it.c, fg: it.fg ?? "onSeg", b: true }]);
		out.push([g.plR, { fg: it.c, bg: items[i + 1]?.c }]);
	});
	return out;
}

export function planRow(g: Glyphs, it: PlanItem): Seg[] {
	if (it.state === "done") return [[g.boxDone + " ", { fg: "ok" }], [it.text, { fg: "dim", s: true }]];
	if (it.state === "doing") return [[g.boxDoing + " ", { fg: "tool", b: true }], [it.text, { fg: "fg", b: true }]];
	return [[g.box + " ", { fg: "dim" }], [it.text, { fg: "muted" }]];
}

/** Clip each plan row so long items never wrap or overflow. */
export function planRows(g: Glyphs, items: PlanItem[], max: number): Seg[][] {
	return items.map((it) => clipSegs(planRow(g, it), max));
}

export const INLINE_CODE: St = { fg: "code", bg: "codeBg" };

// ── Turn-stats chips (§12.2) ───────────────────────────────────────────────

export interface ChipPlan {
	groups: Chip[][];
	units: boolean;
	icons: boolean;
}

/** Width rules for the stats row (§5.4). */
export function statsPlan(W: number, chips: Chip[]): ChipPlan {
	if (W >= 100) return { groups: [chips], units: true, icons: true };
	if (W >= 80) return { groups: [chips], units: false, icons: true };
	const timing = chips.filter((c) => c.key === "tps" || c.key === "ttft" || c.key === "total");
	const tokens = chips.filter((c) => !(c.key === "tps" || c.key === "ttft" || c.key === "total"));
	const groups = [timing, tokens].filter((x) => x.length);
	return { groups, units: false, icons: W >= 60 };
}

/** `tok/s` keeps its unit even when other unit words are dropped. */
export function chipUnit(c: Chip, plan: ChipPlan): string {
	if (c.key === "tps") return c.unit;
	return plan.units ? c.unit : "";
}

// ── Style registry helper ──────────────────────────────────────────────────

export type StyleMap = Record<"prism" | "circuit" | "rail", StyleImpl>;

export type { Row, PaletteKey };

/** Tool header argument: truncated from the middle for paths, from the end otherwise. */
export function fitArg(arg: string, max: number, isPath: boolean, mid: (t: string, m: number) => string): string {
	if (max <= 0) return "";
	const chars = Array.from(arg);
	if (chars.length <= max) return arg;
	return isPath ? mid(arg, max) : chars.slice(0, Math.max(0, max - 1)).join("") + "…";
}

// ── Footer: one row, degraded by priority (guide §5.4, reworked) ──────────

export interface FooterFlags {
	/** Sparkline points to show (0 = hidden) */
	spark: number;
	cost: boolean;
	/** `used/total` after the context percentage */
	totals: boolean;
	shortBar: boolean;
	provider: "full" | "glyph" | "none";
	/** Session ↑in ↓out */
	io: boolean;
	branch: boolean;
	/** Model + context % only */
	minimal: boolean;
}

/** Richest first. The first step whose row fits is used, so the least important things go first. */
export const FOOTER_STEPS: FooterFlags[] = [
	{ spark: 8, cost: true, totals: true, shortBar: false, provider: "full", io: true, branch: true, minimal: false },
	{ spark: 5, cost: true, totals: true, shortBar: false, provider: "full", io: true, branch: true, minimal: false },
	{ spark: 0, cost: true, totals: true, shortBar: false, provider: "full", io: true, branch: true, minimal: false },
	{ spark: 0, cost: false, totals: true, shortBar: false, provider: "full", io: true, branch: true, minimal: false },
	{ spark: 0, cost: false, totals: false, shortBar: false, provider: "full", io: true, branch: true, minimal: false },
	{ spark: 0, cost: false, totals: false, shortBar: true, provider: "full", io: true, branch: true, minimal: false },
	{ spark: 0, cost: false, totals: false, shortBar: true, provider: "glyph", io: true, branch: true, minimal: false },
	{ spark: 0, cost: false, totals: false, shortBar: true, provider: "glyph", io: false, branch: true, minimal: false },
	{ spark: 0, cost: false, totals: false, shortBar: true, provider: "glyph", io: false, branch: false, minimal: false },
	{ spark: 0, cost: false, totals: false, shortBar: true, provider: "none", io: false, branch: false, minimal: true },
];

export function fitFooter(
	W: number,
	build: (f: FooterFlags) => { left: Seg[]; right: Seg[] },
): Row {
	let last: { left: Seg[]; right: Seg[] } = { left: [], right: [] };
	for (const f of FOOTER_STEPS) {
		last = build(f);
		if (segW(last.left) + segW(last.right) + 2 <= W) return lr(last.left, last.right, W);
	}
	return lr(clipSegs(last.left, W), [], W);
}
