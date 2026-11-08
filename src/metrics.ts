// Run + session aggregation (guide §4). Pure: no pi imports, unit-tested with synthetic events.

export interface UsageLike {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	cost?: { total?: number } | null;
}

export interface TurnStats {
	v: 1;
	/** null if no token arrived */
	ttftMs: number | null;
	decodeTps: number | null;
	totalMs: number;
	inTokens: number;
	cachedTokens: number;
	outTokens: number;
	costUsd: number | null;
	aborted: boolean;
	/** "provider/id" of the last assistant message */
	model: string;
}

export const TURN_STATS_TYPE = "chroma.turnStats";

/** Minimum output tokens for a meaningful decode TPS (guide §12.2, interrupted variant). */
export const MIN_TPS_TOKENS = 8;

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** In = input + cacheRead + cacheWrite (pi-ai normalises `input` to exclude cache tokens). */
export function usageIn(u: UsageLike | undefined | null): number {
	if (!u) return 0;
	return n(u.input) + n(u.cacheRead) + n(u.cacheWrite);
}

export type RunPhase = "idle" | "waiting" | "thinking" | "tools" | "between" | "writing";

/**
 * Tracks one run: a user prompt through to `agent_settled`.
 * All times are caller-supplied millisecond timestamps, so tests can drive it with synthetic clocks.
 */
export class RunTracker {
	active = false;
	phase: RunPhase = "idle";
	/** Name of the tool currently executing, if any. */
	runningTool: string | undefined;
	startMs = 0;
	firstDeltaMs: number | null = null;

	private finishedOut = 0;
	private inTokens = 0;
	private cachedTokens = 0;
	private outTokens = 0;
	private cost = 0;
	private sawCost = false;
	private streamMs = 0;
	private streamedOut = 0;
	private model = "";

	// per in-flight assistant message
	private msgOpen = false;
	private msgFirstDelta: number | null = null;
	private msgChars = 0;

	begin(now: number): void {
		this.active = true;
		this.phase = "waiting";
		this.runningTool = undefined;
		this.startMs = now;
		this.firstDeltaMs = null;
		this.finishedOut = 0;
		this.inTokens = 0;
		this.cachedTokens = 0;
		this.outTokens = 0;
		this.cost = 0;
		this.sawCost = false;
		this.streamMs = 0;
		this.streamedOut = 0;
		this.model = "";
		this.msgOpen = false;
		this.msgFirstDelta = null;
		this.msgChars = 0;
	}

	/** A new assistant message starts streaming. */
	messageStart(): void {
		this.msgOpen = true;
		this.msgFirstDelta = null;
		this.msgChars = 0;
	}

	/** A streamed delta arrived (text, thinking or tool-call arguments). */
	delta(now: number, kind: "thinking" | "text" | "tool", chars: number): void {
		if (!this.active) return;
		if (!this.msgOpen) this.messageStart();
		if (this.firstDeltaMs === null) this.firstDeltaMs = now;
		if (this.msgFirstDelta === null) this.msgFirstDelta = now;
		this.msgChars += Math.max(0, chars);
		if (kind === "thinking") this.phase = "thinking";
		else if (kind === "text") this.phase = "writing";
		else this.phase = "tools";
	}

	toolStart(name: string): void {
		this.runningTool = name;
		this.phase = "tools";
	}

	toolEnd(): void {
		this.runningTool = undefined;
		this.phase = "between";
	}

	/** An assistant message finished with its real usage. */
	messageEnd(now: number, usage: UsageLike | undefined, model?: string): void {
		if (!this.active) return;
		if (this.msgFirstDelta !== null) {
			this.streamMs += Math.max(0, now - this.msgFirstDelta);
			this.streamedOut += n(usage?.output);
		}
		this.finishedOut += n(usage?.output);
		this.outTokens += n(usage?.output);
		this.inTokens += usageIn(usage);
		this.cachedTokens += n(usage?.cacheRead);
		const c = usage?.cost?.total;
		if (typeof c === "number" && Number.isFinite(c)) {
			this.cost += c;
			this.sawCost = true;
		}
		if (model) this.model = model;
		this.msgOpen = false;
		this.msgFirstDelta = null;
		this.msgChars = 0;
		if (this.phase === "writing" || this.phase === "thinking") this.phase = "between";
	}

	/** Live values for the status line (§4.2). `estimated` is true while a message is in flight. */
	live(now: number): { elapsedMs: number; ttftMs: number | null; outTokens: number; estimated: boolean } {
		const estimated = this.msgOpen && this.msgChars > 0;
		const inflight = this.msgOpen ? Math.ceil(this.msgChars / 4) : 0;
		return {
			elapsedMs: this.active ? Math.max(0, now - this.startMs) : 0,
			ttftMs: this.firstDeltaMs === null ? null : Math.max(0, this.firstDeltaMs - this.startMs),
			outTokens: this.finishedOut + inflight,
			estimated,
		};
	}

	/** Finalise at `agent_settled`. */
	finish(now: number, aborted: boolean): TurnStats {
		const decodeTps =
			this.streamMs > 0 && this.streamedOut > 0 ? this.streamedOut / (this.streamMs / 1000) : null;
		const stats: TurnStats = {
			v: 1,
			ttftMs: this.firstDeltaMs === null ? null : Math.max(0, this.firstDeltaMs - this.startMs),
			decodeTps,
			totalMs: Math.max(0, now - this.startMs),
			inTokens: this.inTokens,
			cachedTokens: this.cachedTokens,
			outTokens: this.outTokens,
			costUsd: this.sawCost && this.cost > 0 ? this.cost : null,
			aborted,
			model: this.model,
		};
		this.active = false;
		this.phase = "idle";
		this.runningTool = undefined;
		return stats;
	}
}

// ── Session aggregation ───────────────────────────────────────────────────

export interface EntryLike {
	type: string;
	message?: { role?: string; usage?: UsageLike } | null;
	usage?: UsageLike | null;
	customType?: string;
	data?: unknown;
}

export interface SessionTotals {
	inTokens: number;
	outTokens: number;
	costUsd: number;
}

export function emptyTotals(): SessionTotals {
	return { inTokens: 0, outTokens: 0, costUsd: 0 };
}

export function addUsage(t: SessionTotals, u: UsageLike | undefined | null): void {
	if (!u) return;
	t.inTokens += usageIn(u);
	t.outTokens += n(u.output);
	t.costUsd += n(u.cost?.total);
}

/** Σ over assistant messages and compaction usage (pi counts both in its own totals). */
export function sessionTotals(entries: readonly EntryLike[]): SessionTotals {
	const t = emptyTotals();
	for (const e of entries) {
		if (e.type === "message" && e.message?.role === "assistant") addUsage(t, e.message.usage);
		else if (e.type === "compaction") addUsage(t, e.usage);
	}
	return t;
}

/** Decode TPS of the last `count` turn-stats entries (oldest first). */
export function tpsHistory(entries: readonly EntryLike[], count = 8): number[] {
	const out: number[] = [];
	for (const e of entries) {
		if (e.type !== "custom" || e.customType !== TURN_STATS_TYPE) continue;
		const d = e.data as Partial<TurnStats> | undefined;
		if (d && typeof d.decodeTps === "number" && d.decodeTps > 0) out.push(d.decodeTps);
	}
	return out.slice(-count);
}

// ── Context pressure ──────────────────────────────────────────────────────

export interface CompactionSettingsLike {
	enabled?: boolean;
	reserveTokens?: number;
	modelOverrides?: Record<string, { enabled?: boolean; reserveTokens?: number } | undefined>;
}

export const DEFAULT_RESERVE_TOKENS = 16384;

export interface CompactionInfo {
	enabled: boolean;
	/** Token count at which auto-compaction triggers (window − reserve). */
	point: number;
}

export function compactionInfo(
	windowTokens: number,
	settings: CompactionSettingsLike | undefined,
	modelKey?: string,
): CompactionInfo {
	const override = modelKey ? settings?.modelOverrides?.[modelKey] : undefined;
	const enabled = override?.enabled ?? settings?.enabled ?? true;
	const reserve = override?.reserveTokens ?? settings?.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
	return { enabled, point: Math.max(0, windowTokens - reserve) };
}

export type ContextColor = "s4" | "warn" | "err";

export interface ContextState {
	used: number;
	window: number;
	fraction: number;
	color: ContextColor;
	/** Show the context-pressure warning. */
	warn: boolean;
	/** Compaction point as a rounded percentage of the window. */
	pointPct: number;
	compactionEnabled: boolean;
}

export function contextState(used: number | null | undefined, windowTokens: number, c: CompactionInfo): ContextState {
	const u = Math.max(0, used ?? 0);
	const w = Math.max(1, windowTokens);
	const f = Math.min(1, u / w);
	const nearPoint = c.enabled && u >= c.point - 0.02 * w;
	const color: ContextColor = f >= 0.9 || nearPoint ? "err" : f >= 0.75 ? "warn" : "s4";
	const warn = f >= 0.75 || (c.enabled && u >= c.point - 0.08 * w);
	return {
		used: u,
		window: w,
		fraction: f,
		color,
		warn,
		pointPct: Math.round((c.point / w) * 100),
		compactionEnabled: c.enabled,
	};
}
