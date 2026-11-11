// pi-chroma — entry point (guide §3, §4.3). TUI only: every hook is a no-op in print / json / rpc modes.
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { collapsedLabel, framedMarkdown, framesActive, installBlockFrames, uninstallBlockFrames } from "./blocks.ts";
import { Dock, Footer, Header } from "./components.ts";
import { GLYPH_NAMES, MOTION_NAMES, STYLE_NAMES, loadConfig, saveConfig, setAgentDirResolver } from "./config.ts";
import { ChromaEditor } from "./editor.ts";
import { registerEntryRenderers } from "./entries.ts";
import { clock, elapsed } from "./format.ts";
import { blockquote, labelSegs } from "./labels.ts";
import { TURN_STATS_TYPE, addUsage, type EntryLike, type UsageLike } from "./metrics.ts";
import type { StyleName } from "./palettes.ts";
import { rt } from "./runtime.ts";
import type { PlanItem, PlanState } from "./styles/types.ts";
import { registerToolFrames } from "./tool-renderer.ts";

const PLAN_TOOL = "plan_update";
const STYLE_TITLES: Record<StyleName, string> = { prism: "Prism", circuit: "Circuit", rail: "Rail" };

function isStyle(v: unknown): v is StyleName {
	return typeof v === "string" && (STYLE_NAMES as string[]).includes(v);
}

/** Text for pi's global hidden-thinking label (§2: one label for every collapsed block). */
function thinkingLabel(finished?: { duration: string; tokens: number }): string {
	if (!finished) return `${rt.g.brain} Thinking…`;
	const plain = rt.impl.collapsedThinking(rt.env(100), finished.duration, finished.tokens);
	return framesActive() ? collapsedLabel(finished.duration, finished.tokens, plain) : plain;
}

/** Re-apply the label for the latest finished thinking block (style / glyph / frame changes). */
function refreshThinkingLabel(ctx: ExtensionContext): void {
	const t = rt.lastThinking;
	ctx.ui.setHiddenThinkingLabel(thinkingLabel(t ? { duration: elapsed(t.ms), tokens: t.tokens } : undefined));
}

/** Per-appearance theme name for a style. */
function themeName(style: StyleName, ctx: ExtensionContext): string {
	const appearance = ctx.ui.theme.appearance === "light" ? "light" : "dark";
	return `chroma-${style}-${appearance}`;
}

export default function piChroma(pi: ExtensionAPI): void {
	rt.pi = pi;
	setAgentDirResolver(getAgentDir);

	pi.registerFlag("chroma-style", {
		description: "pi-chroma visual style for this run: prism | circuit | rail",
		type: "string",
	});

	registerToolFrames(pi);
	registerEntryRenderers(pi);
	registerTransformer(pi);
	registerChromaCommand(pi);

	let planToolRegistered = false;
	let gitTimer: ReturnType<typeof setTimeout> | undefined;

	// ── git dirty count (debounced 500 ms) ────────────────────────────────
	const refreshGit = (ctx: ExtensionContext) => {
		if (gitTimer) clearTimeout(gitTimer);
		gitTimer = setTimeout(async () => {
			gitTimer = undefined;
			try {
				const r = await pi.exec("git", ["status", "--porcelain"], { cwd: ctx.cwd, timeout: 5000 });
				rt.dirty = r.code === 0 ? r.stdout.split("\n").filter((l) => l.trim().length).length : 0;
			} catch {
				rt.dirty = 0;
			}
			rt.requestRender();
		}, 500);
		gitTimer.unref?.();
	};

	// ── plan_update tool ──────────────────────────────────────────────────
	const registerPlanTool = () => {
		if (planToolRegistered) return;
		planToolRegistered = true;
		pi.registerTool({
			name: PLAN_TOOL,
			label: "Plan",
			description:
				"Create or update the visible task plan for the current job. Send the complete list every time; mark exactly one item 'doing' while you work on it, and 'done' when finished.",
			promptSnippet: "Track multi-step work in a visible plan (plan_update)",
			promptGuidelines: [
				"For work with three or more steps, call plan_update with the full list of steps, then call it again as each step starts and finishes.",
			],
			parameters: Type.Object({
				items: Type.Array(
					Type.Object({
						text: Type.String({ description: "Short step description" }),
						status: Type.Union([Type.Literal("todo"), Type.Literal("doing"), Type.Literal("done")]),
					}),
					{ description: "The complete plan, in order" },
				),
			}),
			renderShell: "self",
			async execute(_id, params) {
				const items: PlanItem[] = params.items.map((i) => ({ text: i.text, state: i.status as PlanState }));
				rt.plan = items;
				rt.requestRender();
				const done = items.filter((i) => i.state === "done").length;
				return {
					content: [{ type: "text", text: `Plan updated: ${done}/${items.length} done.` }],
					details: { items },
				};
			},
			renderCall(args) {
				const items = (args as { items?: { status?: string }[] }).items ?? [];
				const done = items.filter((i) => i.status === "done").length;
				const g = rt.g;
				const text = rt.painter().paint(`${g.tasks} plan ${done}/${items.length}`, { fg: "dim" });
				return new Text(`${" ".repeat(rt.outputPad)}${text}`, 0, 0);
			},
			renderResult() {
				return new Text("", 0, 0);
			},
		});
	};

	// ── session lifecycle ─────────────────────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") {
			rt.enabled = false;
			return;
		}
		rt.ctx = ctx;
		rt.config = loadConfig();
		// One-run override. It does not touch pi's theme setting (setTheme would persist it); pair it with
		// `--use-theme chroma-<style>-dark` to colour pi's own text to match.
		const flag = pi.getFlag("chroma-style");
		rt.styleOverride = isStyle(flag) ? flag : undefined;
		rt.invalidatePainter();
		installBlockFrames();
		rt.outputPad = ((pi.getSettings() as { outputPad?: number }).outputPad ?? 1) === 0 ? 0 : 1;
		rt.ticker.setMotion(rt.motion);
		rt.ticker.setHandler(() => rt.requestRender());
		rt.enabled = true;

		const entries = ctx.sessionManager.getEntries() as unknown as EntryLike[];
		rt.rebuildFromEntries(entries);
		rt.plan = reconstructPlan(ctx);

		ctx.ui.setWorkingVisible(false);
		ctx.ui.setFooter((tui, theme, footerData) => {
			rt.tui = tui;
			rt.fallbackTheme = theme;
			rt.branch = footerData.getGitBranch();
			const unsub = footerData.onBranchChange(() => {
				rt.branch = footerData.getGitBranch();
				tui.requestRender();
			});
			const footer = new Footer(theme);
			return Object.assign(footer, { dispose: unsub });
		});
		ctx.ui.setWidget("chroma-dock", (tui, theme) => {
			rt.tui = tui;
			return new Dock(theme);
		});
		ctx.ui.setHeader((tui, theme) => {
			rt.tui = tui;
			return new Header(theme);
		});
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			rt.tui = tui;
			return new ChromaEditor(tui, theme, keybindings);
		});
		refreshThinkingLabel(ctx);

		if (rt.config.planWidget) registerPlanTool();
		refreshGit(ctx);
		rt.requestRender();
	});

	pi.on("session_shutdown", async () => {
		rt.enabled = false;
		uninstallBlockFrames();
		rt.ticker.dispose();
		if (gitTimer) clearTimeout(gitTimer);
		rt.tui = undefined;
	});

	pi.on("model_select", async (_e, ctx) => {
		if (!rt.enabled) return;
		rt.ctx = ctx;
		rt.requestRender();
	});

	pi.on("thinking_level_select", async (_e, ctx) => {
		if (!rt.enabled) return;
		rt.ctx = ctx;
		rt.requestRender();
	});

	// ── runs ──────────────────────────────────────────────────────────────
	pi.on("before_agent_start", async (_e, ctx) => {
		if (!rt.enabled) return;
		rt.ctx = ctx;
		rt.run.begin(Date.now());
		rt.ticker.setRunActive(true);
		// A finished plan stays for exactly one idle period, then disappears.
		if (rt.plan?.length && rt.plan.every((i) => i.state === "done")) rt.plan = undefined;
		rt.requestRender();
	});

	pi.on("message_start", async (e) => {
		if (!rt.enabled) return;
		if ((e.message as { role?: string }).role === "assistant") rt.run.messageStart();
	});

	pi.on("message_update", async (e, ctx) => {
		if (!rt.enabled || !rt.run.active) return;
		const now = Date.now();
		const ev = e.assistantMessageEvent;
		switch (ev.type) {
			case "thinking_start":
				rt.thinkStartedAt.set(ev.contentIndex, now);
				rt.run.delta(now, "thinking", 0);
				ctx.ui.setHiddenThinkingLabel(thinkingLabel());
				break;
			case "thinking_delta":
				rt.run.delta(now, "thinking", ev.delta.length);
				break;
			case "thinking_end": {
				const started = rt.thinkStartedAt.get(ev.contentIndex) ?? now;
				rt.thinkStartedAt.delete(ev.contentIndex);
				const ms = Math.max(0, now - started);
				const tokens = Math.ceil(ev.content.length / 4);
				rt.lastThinking = { ms, tokens };
				ctx.ui.setHiddenThinkingLabel(thinkingLabel({ duration: elapsed(ms), tokens }));
				break;
			}
			case "text_start":
				rt.run.delta(now, "text", 0);
				break;
			case "text_delta":
				rt.run.delta(now, "text", ev.delta.length);
				break;
			case "toolcall_start":
				rt.run.delta(now, "tool", 0);
				break;
			case "toolcall_delta":
				rt.run.delta(now, "tool", ev.delta.length);
				break;
			default:
				return;
		}
	});

	pi.on("message_end", async (e, ctx) => {
		if (!rt.enabled) return;
		rt.ctx = ctx;
		const m = e.message as { role?: string; provider?: string; model?: string; usage?: UsageLike };
		if (m.role !== "assistant") return;
		const model = m.provider && m.model ? `${m.provider}/${m.model}` : undefined;
		rt.run.messageEnd(Date.now(), m.usage, model);
		addUsage(rt.totals, m.usage);
		rt.requestRender();
	});

	pi.on("tool_execution_start", async (e) => {
		if (!rt.enabled) return;
		rt.ticker.toolStart(e.toolCallId);
		if (!e.parentToolCallId) rt.run.toolStart(e.toolName);
		rt.requestRender();
	});

	pi.on("tool_execution_end", async (e, ctx) => {
		if (!rt.enabled) return;
		rt.ticker.toolEnd(e.toolCallId);
		if (!e.parentToolCallId) rt.run.toolEnd();
		if (e.toolName === "edit" || e.toolName === "write" || e.toolName === "bash") refreshGit(ctx);
		rt.requestRender();
	});

	pi.on("session_compact", async (_e, ctx) => {
		if (!rt.enabled) return;
		rt.ctx = ctx;
		rt.rebuildFromEntries(ctx.sessionManager.getEntries() as unknown as EntryLike[]);
		rt.requestRender();
	});

	pi.on("agent_settled", async (e, ctx) => {
		if (!rt.enabled) return;
		rt.ctx = ctx;
		if (rt.run.active) {
			const stats = rt.run.finish(Date.now(), e.aborted);
			if (rt.config.turnStats && (stats.outTokens > 0 || stats.aborted)) {
				pi.appendEntry(TURN_STATS_TYPE, stats);
				if (stats.decodeTps !== null) rt.tps = [...rt.tps, stats.decodeTps].slice(-8);
			}
		}
		rt.ticker.setRunActive(false);
		refreshGit(ctx);
		rt.requestRender();
	});
}

// ── helpers ─────────────────────────────────────────────────────────────

function reconstructPlan(ctx: ExtensionContext): PlanItem[] | undefined {
	let plan: PlanItem[] | undefined;
	for (const entry of ctx.sessionManager.getBranch() as unknown as Array<{
		type: string;
		message?: { role?: string; toolName?: string; details?: { items?: PlanItem[] } };
	}>) {
		if (entry.type !== "message" || entry.message?.role !== "toolResult" || entry.message.toolName !== PLAN_TOOL) continue;
		const items = entry.message.details?.items;
		if (Array.isArray(items)) plan = items;
	}
	if (plan?.length && plan.every((i) => i.state === "done")) return undefined;
	return plan;
}

function registerTransformer(pi: ExtensionAPI): void {
	pi.registerMarkdownTransformer((markdown, ctx) => {
		if (!rt.enabled) return markdown;
		if (!markdown.trim()) return markdown;
		if (framesActive()) {
			// Framed blocks: an invisible sentinel tells the patched Markdown render what this block is.
			const kind = ctx.messageType === "assistant-thinking" ? "thinking" : ctx.messageType === "user" ? "user" : "assistant";
			let model: string | undefined;
			if (kind === "assistant") {
				model = rt.modelId;
				if (ctx.messageId) {
					try {
						const entry = rt.ctx?.sessionManager.getEntry(ctx.messageId) as { message?: { model?: string } } | undefined;
						if (entry?.message?.model) model = entry.message.model;
					} catch {
						/* stale context: keep the current model */
					}
				}
			}
			return framedMarkdown(kind, markdown, { model, ts: ctx.timestamp });
		}
		if (ctx.messageType === "assistant-thinking") return markdown;
		const who = ctx.messageType === "user" ? "user" : "assistant";
		const g = rt.g;
		const style = rt.style;
		let model: string | undefined;
		if (who === "assistant") {
			model = rt.modelId;
			if (ctx.messageId) {
				try {
					const entry = rt.ctx?.sessionManager.getEntry(ctx.messageId) as { message?: { model?: string } } | undefined;
					if (entry?.message?.model) model = entry.message.model;
				} catch {
					/* stale context: keep the current model */
				}
			}
		}
		const time = ctx.timestamp ? clock(ctx.timestamp) : undefined;
		const header = rt.painter().segs(labelSegs(style, g, who, model, who === "user" ? time : undefined));
		const body = who === "user" && style === "rail" ? blockquote(markdown) : markdown;
		// A hard break keeps the header glued to the first paragraph; blocks that cannot follow a paragraph
		// directly (fences, tables, ordered lists …) get a blank line instead.
		const glue = (/^[\p{L}\p{N}"'`*_\[(]/u.test(body) || /^[-+] \S/.test(body)) && !/^\d+[.)]/.test(body) ? "  \n" : "\n\n";
		return `${header}${body.startsWith(">") ? "  \n" : glue}${body}`;
	});
}

function registerChromaCommand(pi: ExtensionAPI): void {
	const apply = {
		style(ctx: ExtensionContext, style: StyleName) {
			rt.config.style = style;
			rt.styleOverride = undefined;
			saveConfig(rt.config);
			rt.invalidatePainter();
			const res = ctx.ui.setTheme(themeName(style, ctx));
			refreshThinkingLabel(ctx);
			rt.tui?.invalidate();
			rt.requestRender();
			if (!res.success) ctx.ui.notify(`pi-chroma: could not switch theme (${res.error ?? "unknown error"})`, "error");
			else {
				ctx.ui.notify(
					`Style: ${STYLE_TITLES[style]} · pi pinned ${themeName(style, ctx)}. To follow your terminal's light/dark mode set Theme → chroma-${style}-light/chroma-${style}-dark in /settings`,
					"info",
				);
			}
		},
		glyphs(ctx: ExtensionContext, glyphs: (typeof GLYPH_NAMES)[number]) {
			rt.config.glyphs = glyphs;
			saveConfig(rt.config);
			refreshThinkingLabel(ctx);
			rt.tui?.invalidate();
			rt.requestRender();
			ctx.ui.notify(`Glyphs: ${glyphs}`, "info");
		},
		frames(ctx: ExtensionContext, on: boolean) {
			rt.config.frames = on;
			saveConfig(rt.config);
			refreshThinkingLabel(ctx);
			rt.tui?.invalidate();
			rt.requestRender();
			ctx.ui.notify(`Block frames: ${on ? "on" : "off"}${on && !framesActive() ? " (unavailable: pi's render classes changed)" : ""}`, "info");
		},
		motion(ctx: ExtensionContext, motion: (typeof MOTION_NAMES)[number]) {
			rt.config.motion = motion;
			saveConfig(rt.config);
			rt.ticker.setMotion(rt.motion);
			rt.requestRender();
			ctx.ui.notify(`Motion: ${motion}`, "info");
		},
	};

	pi.registerCommand("chroma", {
		description: "pi-chroma: switch style, glyphs, motion, block frames (/chroma style|glyphs|motion|frames <value>)",
		getArgumentCompletions(prefix) {
			const words = prefix.split(/\s+/);
			const opts: Record<string, readonly string[]> = { style: STYLE_NAMES, glyphs: GLYPH_NAMES, motion: MOTION_NAMES, frames: ["on", "off"] };
			if (words.length <= 1) {
				return Object.keys(opts)
					.filter((k) => k.startsWith(words[0] ?? ""))
					.map((k) => ({ value: k, label: k }));
			}
			const values = opts[words[0]];
			if (!values) return null;
			return values.filter((v) => v.startsWith(words[1] ?? "")).map((v) => ({ value: `${words[0]} ${v}`, label: v }));
		},
		async handler(args, ctx) {
			if (ctx.mode !== "tui" || !rt.enabled) {
				ctx.ui.notify("pi-chroma only runs in the interactive TUI", "warning");
				return;
			}
			rt.ctx = ctx;
			const [what, value] = args.trim().split(/\s+/);
			if (what && value) {
				if (what === "style" && isStyle(value)) return apply.style(ctx, value);
				if (what === "glyphs" && (GLYPH_NAMES as string[]).includes(value)) return apply.glyphs(ctx, value as never);
				if (what === "motion" && (MOTION_NAMES as string[]).includes(value)) return apply.motion(ctx, value as never);
				if (what === "frames" && (value === "on" || value === "off")) return apply.frames(ctx, value === "on");
				ctx.ui.notify(`Unknown option: ${what} ${value}`, "error");
				return;
			}
			const pick = await ctx.ui.select("pi-chroma", [
				`Style · ${rt.style}`,
				`Glyphs · ${rt.config.glyphs}`,
				`Motion · ${rt.config.motion}`,
				`Block frames · ${rt.config.frames ? "on" : "off"}`,
			]);
			if (!pick) return;
			if (pick.startsWith("Style")) {
				const s = await ctx.ui.select("Style", [...STYLE_NAMES]);
				if (isStyle(s)) apply.style(ctx, s);
			} else if (pick.startsWith("Glyphs")) {
				const gl = await ctx.ui.select("Glyphs", [...GLYPH_NAMES]);
				if (gl && (GLYPH_NAMES as string[]).includes(gl)) apply.glyphs(ctx, gl as never);
			} else if (pick.startsWith("Block frames")) {
				const f = await ctx.ui.select("Block frames", ["on", "off"]);
				if (f === "on" || f === "off") apply.frames(ctx, f === "on");
			} else {
				const mo = await ctx.ui.select("Motion", [...MOTION_NAMES]);
				if (mo && (MOTION_NAMES as string[]).includes(mo)) apply.motion(ctx, mo as never);
			}
		},
	});
}
