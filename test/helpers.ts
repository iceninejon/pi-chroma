import { styleText, parseColor } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { Painter } from "../src/painter.ts";
import { glyphSet, type GlyphSetName } from "../src/glyphs.ts";
import type { Env, Motion } from "../src/styles/types.ts";
import type { Row } from "../src/grid.ts";
import type { Appearance, StyleName } from "../src/palettes.ts";

export const STYLES: StyleName[] = ["prism", "circuit", "rail"];

/** Minimal Theme stand-in for tests: the real `Theme` class is not exported by pi. */
export function theme(style: StyleName, appearance: Appearance = "dark"): Theme {
	const json = JSON.parse(readFileSync(new URL(`../themes/chroma-${style}-${appearance}.json`, import.meta.url), "utf8"));
	const vars = json.vars as Record<string, string>;
	const colors: Record<string, unknown> = {};
	for (const [token, ref] of Object.entries(json.colors as Record<string, string>)) colors[token] = parseColor(vars[ref] ?? ref);
	return {
		name: json.name,
		appearance: json.appearance,
		colors,
		style: (text: string, o: Record<string, unknown>) => styleText(text, o as never, "truecolor"),
		fg: (_c: string, text: string) => text,
		bg: (_c: string, text: string) => text,
		bold: (t: string) => t,
		italic: (t: string) => t,
	} as unknown as Theme;
}

export function painter(style: StyleName, appearance: Appearance = "dark") {
	return new Painter(theme(style, appearance), style);
}

export function env(W = 100, o: Partial<{ tick: number; motion: Motion; pad: number; glyphs: GlyphSetName }> = {}): Env {
	return { W, g: glyphSet(o.glyphs ?? "nerd"), tick: o.tick ?? 0, motion: o.motion ?? "full", pad: o.pad ?? 1 };
}

// eslint-disable-next-line no-control-regex
export const strip = (s: string) => s.replace(/\x1b\[[0-9;:]*m/g, "").replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "");

/** Paint rows to plain text (no ANSI), trailing spaces trimmed. */
export function plain(p: Painter, rows: Row[], W: number): string[] {
	return p.rows(rows, W).map((l) => strip(l).replace(/\s+$/, ""));
}
