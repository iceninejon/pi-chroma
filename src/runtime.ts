// Shared runtime state for the extension instance. Everything the components read lives here.
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { Ticker } from "./anim.ts";
import { DEFAULT_CONFIG, effectiveMotion, type ChromaConfig } from "./config.ts";
import { elapsed, pct, tildePath, ttft as fmtTtft, tokens as fmtTokens } from "./format.ts";
import { glyphSet, type Glyphs } from "./glyphs.ts";
import {
	compactionInfo,
	contextState,
	emptyTotals,
	RunTracker,
	sessionTotals,
	tpsHistory,
	type CompactionSettingsLike,
	type ContextState,
	type EntryLike,
	type SessionTotals,
} from "./metrics.ts";
import { appearanceOf, Painter } from "./painter.ts";
import type { ThinkLevel } from "./palettes.ts";
import { circuit } from "./styles/circuit.ts";
import { prism } from "./styles/prism.ts";
import { railStyle } from "./styles/rail.ts";
import type { BannerV, Env, FooterV, Motion, PlanItem, PlanV, StatusV, StyleImpl, WarningV } from "./styles/types.ts";

const IMPLS = { prism, circuit, rail: railStyle } as const;

const VERBS = {
	waiting: ["Warming up", "Reticulating", "Brewing"],
	thinking: ["Pondering", "Untangling", "Reasoning"],
} as const;

export class Runtime {
	config: ChromaConfig = { ...DEFAULT_CONFIG };
	/** Set at session_start in TUI mode; every hook is a no-op until then. */
	enabled = false;
	pi: ExtensionAPI | undefined;
	ctx: ExtensionContext | undefined;
	tui: TUI | undefined;
	fallbackTheme: Theme | undefined;

	readonly ticker = new Ticker();
	readonly run = new RunTracker();
	totals: SessionTotals = emptyTotals();
	tps: number[] = [];
	plan: PlanItem[] | undefined;
	branch: string | null = null;
	dirty = 0;
	abortKey = "esc";
	outputPad = 1;
	/** Latest completed thinking block, for the collapsed label (guide §2: one global label). */
	thinkStartedAt = new Map<number, number>();
	lastThinking: { ms: number; tokens: number } | undefined;

	private painterCache: { theme: Theme; style: string; painter: Painter } | undefined;

	get motion(): Motion {
		return effectiveMotion(this.config);
	}

	get impl(): StyleImpl {
		return IMPLS[this.config.style];
	}

	get g(): Glyphs {
		return glyphSet(this.config.glyphs);
	}

	/** The theme currently in use; falls back to the one a factory received. */
	theme(fallback?: Theme): Theme {
		try {
			const t = this.ctx?.ui.theme;
			if (t) return t;
		} catch {
			/* stale context */
		}
		return fallback ?? this.fallbackTheme ?? ({} as Theme);
	}

	painter(fallback?: Theme): Painter {
		const theme = this.theme(fallback);
		const c = this.painterCache;
		if (c && c.theme === theme && c.style === this.config.style) return c.painter;
		const painter = new Painter(theme, this.config.style);
		this.painterCache = { theme, style: this.config.style, painter };
		return painter;
	}

	invalidatePainter(): void {
		this.painterCache = undefined;
	}

	env(W: number, pad = this.outputPad): Env {
		return { W, g: this.g, tick: this.ticker.tick, motion: this.motion, pad };
	}

	requestRender(): void {
		try {
			this.tui?.requestRender();
		} catch {
			/* tui torn down */
		}
	}

	// ── model / context ──────────────────────────────────────────────────

	private safe<T>(fn: () => T): T | undefined {
		try {
			return fn();
		} catch {
			return undefined;
		}
	}

	get modelId(): string {
		return this.safe(() => this.ctx?.model?.id) ?? "no-model";
	}

	get provider(): string {
		return this.safe(() => this.ctx?.model?.provider) ?? "";
	}

	get level(): ThinkLevel {
		const model = this.safe(() => this.ctx?.model) as { reasoning?: boolean } | undefined;
		if (model && model.reasoning === false) return "off";
		return (this.safe(() => this.pi?.getThinkingLevel()) as ThinkLevel | undefined) ?? "off";
	}

	contextState(): ContextState {
		const model = this.safe(() => this.ctx?.model);
		const usage = this.safe(() => this.ctx?.getContextUsage());
		const window = usage?.contextWindow ?? model?.contextWindow ?? 0;
		const settings = this.safe(() => this.pi?.getSettings()) as { compaction?: CompactionSettingsLike } | undefined;
		const key = model ? `${model.provider}/${model.id}` : undefined;
		return contextState(usage?.tokens ?? 0, window, compactionInfo(window, settings?.compaction, key));
	}

	// ── view models ──────────────────────────────────────────────────────

	footerView(): FooterV {
		const cs = this.contextState();
		const level = this.level;
		return {
			provider: this.provider,
			model: this.modelId,
			level,
			levelColor: this.painter().thinkColor(level),
			windowTokens: cs.window,
			usedTokens: cs.used,
			fraction: cs.fraction,
			color: cs.color,
			branch: this.branch,
			dirty: this.dirty,
			sessIn: this.totals.inTokens,
			sessOut: this.totals.outTokens,
			cost: this.totals.costUsd,
			tps: this.tps,
			sessionRow: this.config.sessionRow,
		};
	}

	statusView(now = Date.now()): StatusV {
		const live = this.run.live(now);
		const pick = (arr: readonly string[]): string =>
			arr[this.motion === "full" ? Math.floor((this.ticker.tick * 80) / 2400) % arr.length : 0];
		let verb: string;
		if (this.run.firstDeltaMs === null && !this.run.runningTool) verb = pick(VERBS.waiting);
		else if (this.run.runningTool) verb = `Running ${this.run.runningTool}`;
		else if (this.run.phase === "thinking") verb = pick(VERBS.thinking);
		else if (this.run.phase === "writing") verb = "Writing";
		else verb = "Planning next step";
		return {
			verb,
			elapsed: elapsed(live.elapsedMs),
			ttft: live.ttftMs === null ? "…" : fmtTtft(live.ttftMs),
			tokens: `${live.estimated ? "~" : ""}${fmtTokens(live.outTokens)} tok`,
			abortKey: this.abortKey,
		};
	}

	warningView(cs = this.contextState()): WarningV {
		return { pct: pct(cs.fraction), pointPct: cs.pointPct, compactionEnabled: cs.compactionEnabled };
	}

	planView(): PlanV | undefined {
		if (!this.config.planWidget || !this.plan?.length) return undefined;
		return { items: this.plan, done: this.plan.filter((i) => i.state === "done").length };
	}

	bannerView(): BannerV {
		return {
			model: this.modelId,
			provider: this.provider,
			cwd: tildePath(this.safe(() => this.ctx?.cwd) ?? process.cwd()),
			branch: this.branch,
			dirty: this.dirty,
		};
	}

	// ── session rebuild ──────────────────────────────────────────────────

	rebuildFromEntries(entries: readonly EntryLike[]): void {
		this.totals = sessionTotals(entries);
		this.tps = tpsHistory(entries);
	}
}

export const rt = new Runtime();
export { appearanceOf };
