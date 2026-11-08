// Segment / line helpers (guide §5, §3.1 grid.ts): pad, lr, bar, spark, box, wrap.
// A line is an array of segments `[text, style]`; a Row adds an optional full-width band colour.
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { PaletteKey } from "./palettes.ts";

/** A palette key, `mix` (shimmer neighbour), or a literal `#rrggbb`. */
export type ColorKey = PaletteKey | "mix" | `#${string}`;

export interface St {
	fg?: ColorKey;
	bg?: ColorKey;
	b?: boolean;
	i?: boolean;
	/** strikethrough */
	s?: boolean;
}

export type Seg = readonly [text: string, style?: St];

export interface Row {
	segs: Seg[];
	/** Full-width background applied under every segment and to the trailing pad. */
	band?: ColorKey;
}

export const row = (segs: Seg[], band?: ColorKey): Row => ({ segs, band });
export const BLANK: Row = { segs: [] };

export const w = (text: string): number => visibleWidth(text);
export const segW = (segs: readonly Seg[]): number => {
	let n = 0;
	for (const s of segs) n += visibleWidth(s[0]);
	return n;
};
export const sp = (n: number, st?: St): Seg => [" ".repeat(Math.max(0, n)), st];

/** Truncate a segment list to `max` cells, ending in `…` when cut. */
export function clipSegs(segs: readonly Seg[], max: number): Seg[] {
	const out: Seg[] = [];
	let used = 0;
	for (const [text, st] of segs) {
		if (used >= max) break;
		const tw = visibleWidth(text);
		if (used + tw <= max) {
			out.push([text, st]);
			used += tw;
		} else {
			out.push([truncateToWidth(text, max - used, "…"), st]);
			used = max;
		}
	}
	return out;
}

export function padTo(segs: Seg[], width: number, st?: St): Seg[] {
	return [...segs, sp(width - segW(segs), st)];
}

/** Left and right groups on one line; the gap is at least 1 cell and the left side is clipped if needed. */
export function lr(left: Seg[], right: Seg[], width: number, band?: ColorKey): Row {
	const rw = segW(right);
	let l = left;
	if (segW(l) + rw + 1 > width) l = clipSegs(l, Math.max(0, width - rw - 1));
	const gap = Math.max(1, width - segW(l) - rw);
	return { segs: [...l, sp(gap), ...right], band };
}

export function bar(frac: number, width: number, on: string, off: string, onSt: St, offSt: St): Seg[] {
	const f = Math.round(Math.min(1, Math.max(0, frac)) * width);
	return [
		[on.repeat(f), onSt],
		[off.repeat(width - f), offSt],
	];
}

export function spark(values: readonly number[], chars: string, st: St): Seg[] {
	if (!values.length) return [];
	const cs = Array.from(chars);
	const lo = Math.min(...values);
	const hi = Math.max(...values);
	const text = values
		.map((v) => cs[hi === lo ? Math.floor((cs.length - 1) / 2) : Math.round(((v - lo) / (hi - lo)) * (cs.length - 1))])
		.join("");
	return [[text, st]];
}

/** Word-wrap plain text to `width` cells (ANSI-safe). Empty input gives one empty line. */
export function wrapPlain(text: string, width: number): string[] {
	const out: string[] = [];
	for (const para of text.split("\n")) {
		if (!para.length) out.push("");
		else out.push(...wrapTextWithAnsi(para, Math.max(1, width)));
	}
	return out;
}

export interface BoxOpts {
	width: number;
	indent?: number;
	corners?: string;
	title: Seg[];
	status: Seg[];
	body: Seg[][];
	/** Border colour */
	bc: ColorKey;
	/** Style used for the body padding fill (e.g. a diff band) */
	fill?: St;
	/** Per-row style applied to the pad, parallel to body */
	rowFill?: (St | undefined)[];
}

/** Rounded / square box with a titled top border and a right-aligned status in the bottom border. */
export function box(o: BoxOpts): Row[] {
	const { width, indent = 0, title, status, body, bc } = o;
	const [tl, tr, bl, br] = Array.from(o.corners ?? "╭╮╰╯");
	const inner = Math.max(0, width - 4);
	const b: St = { fg: bc };
	const rows: Row[] = [];
	const t = clipSegs(title, Math.max(0, width - 4));
	const s = clipSegs(status, Math.max(0, width - 4 - segW(t)));
	rows.push({
		segs: [sp(indent), [tl + "─", b], ...t, ["─".repeat(Math.max(0, width - 3 - segW(t))), b], [tr, b]],
	});
	body.forEach((line, i) => {
		const bb = clipSegs(line, inner);
		const fill = o.rowFill?.[i] ?? o.fill;
		rows.push({
			segs: [sp(indent), ["│ ", b], ...bb, sp(inner - segW(bb), fill), [" │", b]],
		});
	});
	rows.push({
		segs: [sp(indent), [bl, b], ["─".repeat(Math.max(0, width - 3 - segW(s))), b], ...s, ["─" + br, b]],
	});
	return rows;
}
