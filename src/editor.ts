// Editor chrome (guide §9.5/§10.5/§11.5 "Editor"): wraps CustomEditor.render() with the style's frame.
import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, renderFakeCursor, truncateToWidth, type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import { tildePath } from "./format.ts";
import { segW } from "./grid.ts";
import { rt } from "./runtime.ts";

const MAX_ROWS = 3;

interface EditorInternals {
	renderedVisibleLineCount?: number;
	scrollOffset?: number;
	focused?: boolean;
}

export class ChromaEditor extends CustomEditor {
	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
		super(tui, theme, keybindings, { paddingX: 0 });
	}

	render(width: number): string[] {
		if (!rt.enabled) return super.render(width);
		try {
			return this.renderChrome(width);
		} catch {
			return super.render(width);
		}
	}

	private renderChrome(width: number): string[] {
		const impl = rt.impl;
		const env = rt.env(width);
		const painter = rt.painter();
		const v = { cwd: tildePath(rt.ctx?.cwd ?? process.cwd()), busy: rt.run.active };
		const inner = impl.editor.innerWidth(env);
		const raw = super.render(inner);
		const internals = this as unknown as EditorInternals;
		const visible = internals.renderedVisibleLineCount ?? Math.max(1, raw.length - 2);
		let content = raw.slice(1, 1 + visible);
		const after = raw.slice(2 + visible); // autocomplete list, if any
		const scrolled = (internals.scrollOffset ?? 0) > 0;

		// Placeholder: shown while the editor is empty.
		if (this.getText().length === 0 && content.length) {
			const ph = rt.run.active ? "Queue a follow-up…" : "Ask pi to build, fix or explain…";
			const first = Array.from(ph)[0];
			const rest = ph.slice(first.length);
			const body = (internals.focused ? CURSOR_MARKER : "") + renderFakeCursor(first) + painter.paint(rest, { fg: "dim", i: true });
			content = [body + " ".repeat(Math.max(0, inner - Array.from(ph).length))];
		}

		// Max three visible rows, window kept on the cursor.
		let start = 0;
		if (content.length > MAX_ROWS) {
			let cursorRow = content.findIndex((l) => l.includes(CURSOR_MARKER));
			if (cursorRow < 0) cursorRow = content.length - 1;
			start = Math.min(Math.max(0, cursorRow - (MAX_ROWS - 1)), content.length - MAX_ROWS);
			content = content.slice(start, start + MAX_ROWS);
		}

		const out: string[] = [painter.row(impl.editor.top(env, v), width)];
		content.forEach((line, i) => {
			const first = i === 0 && start === 0 && !scrolled;
			const { left, right } = impl.editor.wrap(env, v, line, first);
			const l = painter.segs(left);
			const r = painter.segs(right);
			out.push(truncateToWidth(l + line + r, width, ""));
		});
		out.push(painter.row(impl.editor.bottom(env, v), width));
		if (after.length) {
			const { left } = impl.editor.wrap(env, v, "", false);
			const indent = " ".repeat(segW(left));
			for (const a of after) out.push(truncateToWidth(indent + a, width, ""));
		}
		return out;
	}
}
