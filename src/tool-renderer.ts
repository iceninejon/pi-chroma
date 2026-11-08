// Tool frames (guide §9–§11, M5): registerToolRenderer wrapping next(), renderShell "self".
//
// pi renders a tool row as [renderCall component, renderResult component] inside one container.
// We draw the whole frame from the renderCall slot (header + body + bottom border) and keep the
// renderResult slot empty, so the frame is one component that always sees the latest result.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, type Component } from "@earendil-works/pi-tui";
import { rt } from "./runtime.ts";
import { toolView } from "./tools.ts";

const BUILT_IN = new Set(["read", "bash", "edit", "write"]);

interface FrameState {
	frame?: Frame;
	empty?: Container;
	foreign?: Component;
}

/** The subset of pi's ToolRenderContext this module reads (the type itself is not exported). */
interface Ctx {
	state: FrameState;
	args: Record<string, unknown>;
	isPartial: boolean;
	isError: boolean;
	expanded: boolean;
	durationMs: number | undefined;
	outputPad: number;
	keyText(keybinding: string): string;
}

interface Result {
	content: Array<{ type: string; text?: string }>;
	details?: unknown;
}

function textOf(result: Result | undefined): string | undefined {
	if (!result) return undefined;
	return result.content
		.filter((c) => c.type === "text" && typeof c.text === "string")
		.map((c) => c.text as string)
		.join("\n");
}

function normalizeKey(k: string): string {
	return k.replace(/^escape$/i, "esc");
}

class Frame implements Component {
	toolName: string;
	ctx: Ctx;
	result: Result | undefined;
	foreign: Component | undefined;

	constructor(toolName: string, ctx: Ctx) {
		this.toolName = toolName;
		this.ctx = ctx;
	}

	invalidate(): void {
		this.foreign?.invalidate?.();
	}

	render(width: number): string[] {
		try {
			const c = this.ctx;
			const env = rt.env(width, c.outputPad);
			const impl = rt.impl;
			let foreign: string[] | undefined;
			if (this.foreign) {
				const inner = Math.max(10, width - 2 * c.outputPad - 6);
				foreign = this.foreign.render(inner).map((l) => l.replace(/\s+$/, ""));
				while (foreign.length && !foreign[foreign.length - 1].trim()) foreign.pop();
			}
			const view = toolView(
				{
					name: this.toolName,
					args: c.args,
					text: textOf(this.result),
					details: this.result?.details,
					isError: c.isError,
					pending: c.isPartial,
					durationMs: c.durationMs,
					expanded: c.expanded,
					spin: impl.spinner(env),
					foreign,
				},
				env.g,
			);
			return rt.painter().rows(impl.tool(env, view), width);
		} catch (e) {
			return [`[pi-chroma] tool frame failed: ${(e as Error).message}`.slice(0, Math.max(0, width))];
		}
	}
}

export function registerToolFrames(pi: ExtensionAPI): void {
	pi.registerToolRenderer((toolName, next) => {
		const base = next();
		// The plan tool draws its own one-line row; the plan itself lives in the dock.
		if (toolName === "plan_update") return base;
		return {
			renderShell: "self",
			renderCall(_args, _theme, context) {
				const ctx = context as unknown as Ctx;
				const state = ctx.state;
				try {
					const k = ctx.keyText("app.interrupt");
					if (k) rt.abortKey = normalizeKey(k);
				} catch {
					/* keybinding lookup unavailable */
				}
				const frame = state.frame ?? (state.frame = new Frame(toolName, ctx));
				frame.ctx = ctx;
				return frame;
			},
			renderResult(result, options, theme, context) {
				const ctx = context as unknown as Ctx;
				const state = ctx.state;
				const frame = state.frame ?? (state.frame = new Frame(toolName, ctx));
				frame.ctx = ctx;
				frame.result = result as Result;
				// Tools with their own renderer (MCP tools, other extensions): nest their output in our frame.
				if (!BUILT_IN.has(toolName) && base?.renderResult) {
					try {
						state.foreign = base.renderResult(result, options, theme, { ...context, lastComponent: state.foreign } as never);
						frame.foreign = state.foreign;
					} catch {
						frame.foreign = undefined;
					}
				}
				return (state.empty ??= new Container());
			},
		};
	});
}
