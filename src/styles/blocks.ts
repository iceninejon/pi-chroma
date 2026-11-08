// Frames for pi's built-in user / thinking / response blocks (guide §9.1–§11.1).
//
// pi renders these as Markdown. The body lines arrive already wrapped and padded to `mdW`
// (that includes Markdown's own horizontal padding `p`, the `outputPad` setting); each layout
// surrounds them with the style's chrome. Pure apart from the Painter it is handed.
import { box, clipSegs, lr, row, segW, sp, w, type ColorKey, type Row, type Seg } from "../grid.ts";
import type { Painter } from "../painter.ts";
import { bold, italic, seg, st } from "./common.ts";
import type { Env } from "./types.ts";
import type { StyleName } from "../palettes.ts";

export type BlockKind = "user" | "assistant" | "thinking";

export interface BlockInfo {
	kind: BlockKind;
	/** assistant: model id */
	model?: string;
	/** HH:MM:SS, when known */
	time?: string;
}

export interface BlockLive {
	spin: string;
	elapsed: string;
}

export interface BlockCtx {
	env: Env;
	/** Markdown's own horizontal padding (cells on each side of the text) */
	p: number;
	info: BlockInfo;
	/** Thinking block that is still receiving tokens */
	live?: BlockLive;
}

export interface BlockLayout {
	/** Width to render the Markdown at; the chrome takes the rest of `env.W`. */
	mdWidth(c: BlockCtx): number;
	/** Final lines for the block (painted, each at most `env.W` cells). `body` is already at `mdWidth`. */
	frame(c: BlockCtx, body: string[], painter: Painter): string[];
	/** One-line collapsed thinking label. */
	collapsed(env: Env, duration: string, tokens: number, painter: Painter): string[];
}

const KIND_COLOR: Record<BlockKind, ColorKey> = { user: "user", thinking: "think", assistant: "resp" };

const pad = (line: string, width: number, painter: Painter, band?: ColorKey): string => {
	const gap = width - w(line);
	if (gap <= 0) return line;
	return line + (band ? painter.paint(" ".repeat(gap), { bg: band }) : " ".repeat(gap));
};

/** Re-assert `band` under pre-painted text: after every reset the background comes back. */
export function underBand(line: string, painter: Painter, band: ColorKey): string {
	const seq = painter.bgSeq(band);
	if (!seq) return line;
	// eslint-disable-next-line no-control-regex
	return seq + line.replace(/\x1b\[(?:0|49)m/g, (m) => m + seq);
}

// ── Prism ──────────────────────────────────────────────────────────────────

const prism: BlockLayout = {
	mdWidth({ env, p, info }) {
		if (info.kind === "assistant") return Math.max(4, env.W - (env.pad + 3 - p) - 1);
		const sl = Math.max(0, 1 - p);
		return Math.max(4, env.W - 2 * env.pad - 2 - 2 * sl);
	},
	frame(c, body, painter) {
		const { env, p, info, live } = c;
		const g = env.g;
		if (info.kind === "assistant") {
			const head = row(
				clipSegs([sp(env.pad + 1), [`${g.bot} pi`, bold("resp")], ...(info.model ? ([[`  ${info.model}`, st("dim")]] as Seg[]) : [])], env.W),
			);
			const left = painter.segs([sp(env.pad + 3 - p)]);
			return [painter.row(head, env.W), ...body.map((l) => left + l)];
		}
		const bc = KIND_COLOR[info.kind];
		const X = Math.max(8, env.W - 2 * env.pad);
		const title: Seg[] =
			info.kind === "user"
				? [[` ${g.user} you `, bold(bc)]]
				: [[` ${g.brain} thinking `, bold(bc)]];
		const status: Seg[] =
			info.kind === "user"
				? info.time
					? [[` ${info.time} `, st("dim")]]
					: []
				: live
					? [[` ${live.spin} ${live.elapsed} `, st(bc)]]
					: [];
		const frame = box({ width: X, indent: env.pad, bc, title, status, body: [] });
		const sl = Math.max(0, 1 - p);
		const l = painter.segs([sp(env.pad), ["│", st(bc)], sp(sl)]);
		const r = painter.segs([sp(sl), ["│", st(bc)]]);
		return [painter.row(frame[0], env.W), ...body.map((line) => l + line + r), painter.row(frame[frame.length - 1], env.W)];
	},
	collapsed(env, d, tok, painter) {
		const g = env.g;
		const r = row(
			clipSegs(
				[sp(env.pad + 1), [g.brain + " ", st("think")], [`Thought for ${d}`, italic("think")], [`  ·  ${tok} tokens  ·  ▸ collapsed`, st("dim")]],
				env.W,
			),
		);
		return [painter.row(r, env.W)];
	},
};

// ── Circuit ────────────────────────────────────────────────────────────────

const circuitLabel = (env: Env, kind: BlockKind): string => {
	const g = env.g;
	return kind === "user" ? ` ${g.user} YOU ` : kind === "thinking" ? ` ${g.brain} THINK ` : ` ${g.bot} PI `;
};

/** Left chrome width of the banded blocks (label segment + gap), never less than the mockup's text column. */
const circuitLeft = (env: Env, kind: BlockKind, p: number): number => {
	const lead = segW(seg(env.g, circuitLabel(env, kind), "user"));
	const textCol = kind === "thinking" ? 11 : 9;
	return Math.max(textCol - p, lead + 1 - p);
};

const circuit: BlockLayout = {
	mdWidth({ env, p, info }) {
		if (info.kind === "assistant") return Math.max(4, env.W - (4 - p));
		return Math.max(4, env.W - circuitLeft(env, info.kind, p) - 1);
	},
	frame(c, body, painter) {
		const { env, p, info } = c;
		const g = env.g;
		if (info.kind === "assistant") {
			const head = row(
				clipSegs([...seg(g, circuitLabel(env, "assistant"), "resp"), ...(info.model ? ([[`  ${info.model}`, st("dim")]] as Seg[]) : [])], env.W),
			);
			const left = painter.segs([sp(1), ["│", st("resp")], sp(Math.max(0, 4 - p - 2))]);
			return [painter.row(head, env.W), ...body.map((l) => left + l)];
		}
		const fill = KIND_COLOR[info.kind];
		const band: ColorKey = info.kind === "user" ? "userBg" : "thinkBg";
		const L = circuitLeft(env, info.kind, p);
		const lead = seg(g, circuitLabel(env, info.kind), fill);
		const first = painter.segs([...lead, sp(L - segW(lead))], band);
		const rest = painter.segs([sp(L)], band);
		const tail = painter.segs([sp(1)], band);
		return body.map((line, i) => (i === 0 ? first : rest) + pad(underBand(line, painter, band), c.env.W - L - 1, painter, band) + tail);
	},
	collapsed(env, d, tok, painter) {
		const g = env.g;
		const r = row(
			clipSegs(
				[...seg(g, circuitLabel(env, "thinking"), "think"), sp(1), [`thought for ${d}`, italic("think")], [`  ·  ${tok} tok  ·  ▸ collapsed`, st("dim")]],
				env.W,
			),
			"thinkBg",
		);
		return [painter.row(r, env.W)];
	},
};

// ── Rail ───────────────────────────────────────────────────────────────────

const railChar = (kind: BlockKind): string => (kind === "thinking" ? "┆" : "▎");
const rail = (env: Env, c: ColorKey, ch: string): Seg[] => [sp(env.pad), [ch, st(c)], sp(2)];

const railStyle: BlockLayout = {
	mdWidth({ env, p }) {
		return Math.max(4, env.W - (env.pad + 3 + Math.max(0, 2 - p)) - 1);
	},
	frame(c, body, painter) {
		const { env, p, info, live } = c;
		const g = env.g;
		const color = KIND_COLOR[info.kind];
		const lead = rail(env, color, railChar(info.kind));
		let head: Row;
		if (info.kind === "user") head = lr([...lead, [`${g.user} you`, bold(color)]], info.time ? [[`${info.time} `, st("dim")]] : [], env.W);
		else if (info.kind === "thinking")
			head = lr([...lead, [`${g.brain} thinking`, bold(color)]], live ? [[`${live.spin} ${live.elapsed} `, st(color)]] : [], env.W);
		else
			head = lr(
				[...lead, [`${g.bot} pi`, bold(color)], ...(info.model ? ([[`  ${info.model}`, st("dim")]] as Seg[]) : [])],
				info.time ? [[`${info.time} `, st("dim")]] : [],
				env.W,
			);
		const left = painter.segs([...lead, sp(Math.max(0, 2 - p))]);
		return [painter.row(head, env.W), ...body.map((l) => left + l)];
	},
	collapsed(env, d, tok, painter) {
		const g = env.g;
		const r = lr(
			[...rail(env, "think", "┆"), [g.brain + " ", st("think")], [`thought for ${d}`, italic("think")], [`  ·  ${tok} tok`, st("dim")]],
			[["▸ collapsed ", st("dim")]],
			env.W,
		);
		return [painter.row(r, env.W)];
	},
};

const LAYOUTS: Record<StyleName, BlockLayout> = { prism, circuit, rail: railStyle };

export function blockLayout(style: StyleName): BlockLayout {
	return LAYOUTS[style];
}
