// Framing pi's built-in user / thinking / response blocks.
//
// pi has no public hook for this (NOTES.md, "Tier C"), but every one of those blocks is a `Markdown`
// component whose text goes through the extension's Markdown transformer. So:
//   1. the transformer prefixes each block with an invisible OSC sentinel that says what the block is;
//   2. `Markdown.prototype.render` is wrapped: when the block's text carries a sentinel, it is rendered
//      at a narrower width and surrounded with the active style's chrome (src/styles/blocks.ts);
//   3. `Text.prototype.render` is wrapped the same way for the collapsed-thinking label.
// Anything unexpected falls back to pi's own render. `uninstall` restores the originals (reload / quit).
import { Markdown, Text } from "@earendil-works/pi-tui";
import { clock, elapsed } from "./format.ts";
import { rt } from "./runtime.ts";
import { blockLayout, type BlockInfo, type BlockKind } from "./styles/blocks.ts";

const PREFIX = "\x1b]7777;chroma;";
const BEL = "\x07";
// eslint-disable-next-line no-control-regex
const SENTINEL_RE = /\x1b\]7777;chroma;[^\x07]*\x07/g;
// eslint-disable-next-line no-control-regex
const BG_RE = /\x1b\[(?:48;2;\d+;\d+;\d+|48;5;\d+|49)m/g;
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;:]*m|\x1b\][^\x07]*\x07/g;

const ORIG = Symbol.for("pi-chroma.render.original");

type Render = (this: unknown, width: number) => string[];

interface MarkdownLike {
	text: string;
	paddingX: number;
	options?: { transform?: (markdown: string, availableWidth: number) => string };
}

interface TextLike {
	text: string;
}

let installed = false;

/** True while the patched renders are active (the transformer then emits sentinels). */
export function framesInstalled(): boolean {
	return installed;
}

export function framesActive(): boolean {
	return installed && rt.enabled && rt.config.frames;
}

// ── sentinel ─────────────────────────────────────────────────────────────

interface Payload {
	k: BlockKind | "collapsed";
	m?: string;
	t?: string;
	d?: string;
	n?: number;
}

export function sentinel(p: Payload): string {
	return `${PREFIX}${encodeURIComponent(JSON.stringify(p))}${BEL}`;
}

function parse(text: string): Payload | null {
	const at = text.indexOf(PREFIX);
	if (at < 0) return null;
	const end = text.indexOf(BEL, at);
	if (end < 0) return null;
	try {
		return JSON.parse(decodeURIComponent(text.slice(at + PREFIX.length, end))) as Payload;
	} catch {
		return null;
	}
}

/** Markdown for a framed block: sentinel on its own paragraph, then the original text. */
export function framedMarkdown(kind: BlockKind, markdown: string, extra: { model?: string; ts?: string } = {}): string {
	return `${sentinel({ k: kind, m: extra.model, t: extra.ts })}\n\n${markdown}`;
}

/** Hidden-thinking label: our sentinel for the patched Text, plain words as the fallback. */
export function collapsedLabel(duration: string, tokens: number, plain: string): string {
	return `${sentinel({ k: "collapsed", d: duration, n: tokens })}${plain}`;
}

// ── helpers ──────────────────────────────────────────────────────────────

const visiblyEmpty = (l: string): boolean => l.replace(ANSI_RE, "").trim() === "";

/** Drop the sentinel, pi's own backgrounds, and blank rows at both ends (user blocks pad with blank rows). */
function cleanBody(lines: string[]): string[] {
	let out = lines.map((l) => l.replace(SENTINEL_RE, "").replace(BG_RE, ""));
	while (out.length && visiblyEmpty(out[0])) out.shift();
	while (out.length && visiblyEmpty(out[out.length - 1])) out.pop();
	return out;
}

const cache = new WeakMap<object, { text: string; info: Payload | null }>();
const firstSeen = new WeakMap<object, number>();
const lastLength = new WeakMap<object, number>();
let latestThinking: object | undefined;

function infoFor(md: MarkdownLike, width: number): Payload | null {
	const hit = cache.get(md);
	if (hit && hit.text === md.text) return hit.info;
	let info: Payload | null = null;
	try {
		const t = md.options?.transform?.(md.text, Math.max(1, width - 2 * md.paddingX));
		if (typeof t === "string" && t.includes(PREFIX)) info = parse(t);
	} catch {
		info = null;
	}
	cache.set(md, { text: md.text, info });
	return info;
}

function frameMarkdown(md: MarkdownLike, width: number, orig: Render): string[] | undefined {
	const payload = infoFor(md, width);
	if (!payload || payload.k === "collapsed") return undefined;
	const kind = payload.k;
	const painter = rt.painter();
	const env = rt.env(width);
	const p = typeof md.paddingX === "number" ? md.paddingX : env.pad;
	const layout = blockLayout(rt.style);

	// Time: persisted entries carry an ISO timestamp; live blocks use the moment they were first drawn.
	if (!firstSeen.has(md)) firstSeen.set(md, Date.now());
	let time: string | undefined;
	if (payload.t) time = clock(payload.t);
	else if (kind === "user" || !rt.run.active) time = clock(firstSeen.get(md) ?? Date.now());

	// The block that is currently growing is the live one.
	let live;
	if (kind === "thinking") {
		const len = md.text.length;
		if (lastLength.get(md) !== len) {
			lastLength.set(md, len);
			if (rt.run.active) latestThinking = md;
		}
		if (rt.run.active && rt.run.phase === "thinking" && latestThinking === md) {
			const started = Math.max(0, ...rt.thinkStartedAt.values());
			live = { spin: rt.impl.spinner(env), elapsed: elapsed(started ? Date.now() - started : 0) };
		}
	}

	const info: BlockInfo = { kind, model: payload.m, time };
	const ctx = { env, p, info, live };
	const mdW = layout.mdWidth(ctx);
	const body = cleanBody(orig.call(md, mdW));
	if (!body.length) return [];
	return layout.frame(ctx, body, painter);
}

// ── install / uninstall ──────────────────────────────────────────────────

function patch(proto: Record<PropertyKey, unknown>, wrap: (orig: Render) => Render): boolean {
	const render = proto.render as Render | undefined;
	if (typeof render !== "function") return false;
	const orig = (proto[ORIG] as Render | undefined) ?? render;
	proto[ORIG] = orig;
	proto.render = wrap(orig);
	return true;
}

function restore(proto: Record<PropertyKey, unknown>): void {
	const orig = proto[ORIG] as Render | undefined;
	if (orig) {
		proto.render = orig;
		delete proto[ORIG];
	}
}

/** Wrap Markdown / Text rendering. Returns false (and changes nothing) when pi's classes look different. */
export function installBlockFrames(): boolean {
	if (installed) return true;
	const mdProto = (Markdown as unknown as { prototype: Record<PropertyKey, unknown> } | undefined)?.prototype;
	const textProto = (Text as unknown as { prototype: Record<PropertyKey, unknown> } | undefined)?.prototype;
	if (!mdProto || !textProto) return false;
	// Probe the private fields we read: if pi renamed them, stay out of the way.
	const probe = new Markdown("x", 1, 0, {} as never) as unknown as MarkdownLike;
	const probeText = new Text("x", 0, 0) as unknown as TextLike;
	if (probe.text !== "x" || typeof probe.paddingX !== "number" || probeText.text !== "x") return false;

	const okMd = patch(mdProto, (orig) =>
		function (this: unknown, width: number): string[] {
			if (rt.enabled && rt.config.frames) {
				try {
					const framed = frameMarkdown(this as MarkdownLike, width, orig);
					if (framed) return framed;
				} catch {
					/* fall through to pi's render */
				}
			}
			return orig.call(this, width);
		},
	);
	const okText = patch(textProto, (orig) =>
		function (this: unknown, width: number): string[] {
			const text = (this as TextLike).text;
			if (typeof text === "string" && text.includes(PREFIX) && rt.enabled && rt.config.frames) {
				try {
					const payload = parse(text);
					if (payload?.k === "collapsed") {
						return blockLayout(rt.style).collapsed(rt.env(width), payload.d ?? "", payload.n ?? 0, rt.painter());
					}
				} catch {
					/* fall through */
				}
			}
			return orig.call(this, width);
		},
	);
	installed = okMd && okText;
	if (!installed) uninstallBlockFrames();
	return installed;
}

export function uninstallBlockFrames(): void {
	for (const klass of [Markdown, Text]) {
		const proto = (klass as unknown as { prototype?: Record<PropertyKey, unknown> } | undefined)?.prototype;
		if (proto) restore(proto);
	}
	installed = false;
}
