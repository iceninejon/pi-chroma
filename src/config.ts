// Config: ~/.pi/agent/pi-chroma.json (guide §3.3).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { GlyphSetName } from "./glyphs.ts";
import type { StyleName } from "./palettes.ts";
import type { Motion } from "./styles/types.ts";

export interface ChromaConfig {
	style: StyleName;
	glyphs: GlyphSetName;
	motion: Motion;
	turnStats: boolean;
	planWidget: boolean;
	sessionRow: boolean;
	/** Frame user / thinking / response blocks (unofficial: wraps pi's Markdown render). */
	frames: boolean;
}

export const DEFAULT_CONFIG: ChromaConfig = {
	style: "prism",
	glyphs: "nerd",
	motion: "full",
	turnStats: true,
	planWidget: true,
	sessionRow: true,
	frames: true,
};

export const STYLE_NAMES: StyleName[] = ["prism", "circuit", "rail"];
export const GLYPH_NAMES: GlyphSetName[] = ["nerd", "unicode", "ascii"];
export const MOTION_NAMES: Motion[] = ["full", "reduced", "off"];

let agentDirResolver: (() => string) | undefined;

/** Inject pi's `getAgentDir` (imported by the extension entry); falls back to `~/.pi/agent`. */
export function setAgentDirResolver(fn: () => string): void {
	agentDirResolver = fn;
}

export function configPath(): string {
	if (process.env.PI_CHROMA_CONFIG) return process.env.PI_CHROMA_CONFIG;
	let dir: string;
	try {
		dir = agentDirResolver?.() ?? join(homedir(), ".pi", "agent");
	} catch {
		dir = join(homedir(), ".pi", "agent");
	}
	return join(dir, "pi-chroma.json");
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
	typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

export function sanitize(raw: unknown): ChromaConfig {
	const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	return {
		style: oneOf(o.style, STYLE_NAMES, DEFAULT_CONFIG.style),
		glyphs: oneOf(o.glyphs, GLYPH_NAMES, DEFAULT_CONFIG.glyphs),
		motion: oneOf(o.motion, MOTION_NAMES, DEFAULT_CONFIG.motion),
		turnStats: bool(o.turnStats, DEFAULT_CONFIG.turnStats),
		planWidget: bool(o.planWidget, DEFAULT_CONFIG.planWidget),
		sessionRow: bool(o.sessionRow, DEFAULT_CONFIG.sessionRow),
		frames: bool(o.frames, DEFAULT_CONFIG.frames),
	};
}

export function loadConfig(path = configPath()): ChromaConfig {
	try {
		return sanitize(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export function saveConfig(config: ChromaConfig, path = configPath()): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
}

/** `PI_CHROMA_MOTION=reduced|off` wins over the config (guide §3.3). */
export function effectiveMotion(config: ChromaConfig, env: NodeJS.ProcessEnv = process.env): Motion {
	const e = env.PI_CHROMA_MOTION;
	if (e === "reduced" || e === "off" || e === "full") return e;
	return config.motion;
}
