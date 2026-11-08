// Turns palette-keyed segments into ANSI strings through pi's Theme (guide §7).
//
// Resolution order for a palette key:
//   1. the active theme's own token, when the active theme is the chroma theme of this style
//      (so a user's edits to the theme JSON still take effect — §7.1);
//   2. the concrete `ext.*` colour from the generated palette.
import { mixColors, parseColor, truncateToWidth, visibleWidth, type Color } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { ColorKey, Row, Seg, St } from "./grid.ts";
import { PALETTES, THINKING_RAMP, type Appearance, type PaletteKey, type StyleName, type ThinkLevel } from "./palettes.ts";

/** Palette key → pi theme token (§7.2). Keys without a token are ext.* only. */
const TOKEN: Partial<Record<PaletteKey, string>> = {
	fg: "text",
	muted: "muted",
	dim: "dim",
	border: "border",
	accent: "accent",
	user: "mdLink",
	userBg: "userMessageBg",
	think: "thinkingText",
	tool: "toolTitle",
	toolBg: "toolPendingBg",
	ok: "success",
	okBg: "toolSuccessBg",
	err: "error",
	errBg: "toolErrorBg",
	warn: "warning",
	resp: "mdHeading",
	code: "mdCode",
	add: "toolDiffAdded",
	del: "toolDiffRemoved",
	panel: "selectedBg",
};

const THINK_TOKEN: Record<ThinkLevel, string> = {
	off: "thinkingOff",
	minimal: "thinkingMinimal",
	low: "thinkingLow",
	medium: "thinkingMedium",
	high: "thinkingHigh",
	xhigh: "thinkingXhigh",
	max: "thinkingMax",
};

export function appearanceOf(theme: Theme): Appearance {
	return theme.appearance === "light" ? "light" : "dark";
}

export class Painter {
	readonly theme: Theme;
	readonly style: StyleName;
	readonly appearance: Appearance;
	private readonly cache = new Map<string, Color>();
	private readonly useTokens: boolean;

	constructor(theme: Theme, style: StyleName) {
		this.theme = theme;
		this.style = style;
		this.appearance = appearanceOf(theme);
		this.useTokens = typeof theme.name === "string" && theme.name === `chroma-${style}-${this.appearance}`;
	}

	get palette() {
		return PALETTES[this.style][this.appearance];
	}

	color(key: ColorKey): Color {
		const hit = this.cache.get(key);
		if (hit) return hit;
		let c: Color;
		if (key === "mix") {
			c = mixColors(this.color("fg"), this.color("accent"), 0.55);
		} else if (key.startsWith("#")) {
			c = parseColor(key);
		} else {
			const token = this.useTokens ? TOKEN[key as PaletteKey] : undefined;
			c = token ? (this.theme.colors as Record<string, Color>)[token] : parseColor(this.palette[key as PaletteKey]);
			c ??= parseColor(this.palette[key as PaletteKey]);
		}
		this.cache.set(key, c);
		return c;
	}

	/** Thinking-level pill fill (§7.3). */
	thinkColor(level: ThinkLevel): ColorKey {
		const token = this.useTokens ? (this.theme.colors as Record<string, Color>)[THINK_TOKEN[level]] : undefined;
		if (token) {
			this.cache.set(`think:${level}`, token);
			return `think:${level}` as ColorKey;
		}
		return THINKING_RAMP[this.style][this.appearance][level] as ColorKey;
	}

	paint(text: string, st?: St, band?: ColorKey): string {
		if (!text) return "";
		const fg = st?.fg;
		const bg = st?.bg ?? band;
		if (!fg && !bg && !st?.b && !st?.i && !st?.s) return text;
		return this.theme.style(text, {
			fg: fg ? this.color(fg) : undefined,
			bg: bg ? this.color(bg) : undefined,
			bold: st?.b,
			italic: st?.i,
			strikethrough: st?.s,
		});
	}

	segs(segs: readonly Seg[], band?: ColorKey): string {
		let out = "";
		for (const [t, st] of segs) out += this.paint(t, st, band);
		return out;
	}

	/** Opening SGR sequence of a background colour (for re-asserting a band under pre-painted text). */
	bgSeq(key: ColorKey): string {
		const probe = this.theme.style("\u0001", { bg: this.color(key) });
		const at = probe.indexOf("\u0001");
		return at > 0 ? probe.slice(0, at) : "";
	}

	/** Paint a row to exactly `width` cells (padded with the band colour, or clipped). */
	row(r: Row, width: number): string {
		let line = this.segs(r.segs, r.band);
		const vw = visibleWidth(line);
		if (vw > width) return truncateToWidth(line, width, "");
		if (vw < width && r.band) line += this.paint(" ".repeat(width - vw), { bg: r.band });
		return line;
	}

	rows(rows: readonly Row[], width: number): string[] {
		return rows.map((r) => this.row(r, width));
	}
}
