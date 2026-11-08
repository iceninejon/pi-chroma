// Tool call → ToolV view model (guide §9.5–§11.5 "Tool body" rows). Pure: no pi imports.
import { toolDuration } from "./format.ts";
import type { Glyphs } from "./glyphs.ts";
import type { Seg } from "./grid.ts";
import type { BodyRow, ToolState, ToolV } from "./styles/types.ts";

export interface ToolInput {
	name: string;
	args: Record<string, unknown> | undefined;
	/** Text content of the result (undefined while no result exists yet) */
	text: string | undefined;
	details: unknown;
	isError: boolean;
	/** No final result yet */
	pending: boolean;
	durationMs: number | undefined;
	expanded: boolean;
	/** Spinner frame for the active style */
	spin: string;
	/** Pre-rendered ANSI lines from the tool's own renderer, used for tools we have no body for */
	foreign?: string[];
}

const COLLAPSED_READ = 3;
const COLLAPSED_BASH = 4;
const COLLAPSED_GENERIC = 6;
const COLLAPSED_EDIT = 8;

const s = (v: unknown): string | undefined => (typeof v === "string" && v.length ? v : undefined);

export function iconFor(name: string, g: Glyphs): string {
	switch (name) {
		case "read":
			return g.file;
		case "bash":
			return g.term;
		case "edit":
		case "write":
			return g.pencil;
		default:
			return g.tool;
	}
}

/** Strip the trailing pi continuation notice from `read` output and report the file's line count. */
export function parseReadText(text: string, offset: number): { lines: string[]; total: number } {
	let body = text;
	let total: number | undefined;
	const m = body.match(/\n\n\[(?:Showing lines (\d+)-(\d+) of (\d+)[^\]]*|(\d+) more lines in file[^\]]*)\]\s*$/);
	if (m) {
		body = body.slice(0, m.index);
		if (m[3]) total = Number(m[3]);
	}
	const lines = body.split("\n");
	if (lines.length && lines[lines.length - 1] === "") lines.pop();
	return { lines, total: total ?? lines.length + Math.max(0, offset - 1) };
}

export function parseBashText(text: string): { output: string[]; exit: number | null } {
	let body = text;
	let exit: number | null = null;
	const m = body.match(/(?:\n\n|^)Command exited with code (\d+)\s*$/);
	if (m) {
		exit = Number(m[1]);
		body = body.slice(0, m.index);
	}
	if (/(?:\n\n|^)Command (?:timed out|aborted|terminated)[^\n]*\s*$/.test(body)) exit ??= 1;
	const lines = body.replace(/\r/g, "").split("\n");
	while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
	while (lines.length && lines[0].trim() === "") lines.shift();
	return { output: lines, exit };
}

export interface DiffLine {
	sign: "+" | "-" | " " | "…";
	num: string;
	code: string;
}

/** Parse pi's display diff (`+NN text`, `-NN text`, ` NN text`, `... `). */
export function parseDiff(diff: string): DiffLine[] {
	const out: DiffLine[] = [];
	for (const raw of diff.split("\n")) {
		if (!raw) continue;
		const m = raw.match(/^([+\- ])\s*(\d*) ?(.*)$/);
		if (!m) continue;
		if (m[1] === " " && !m[2]) {
			out.push({ sign: "…", num: "", code: m[3] });
			continue;
		}
		out.push({ sign: m[1] as DiffLine["sign"], num: m[2], code: m[3] });
	}
	return out;
}

export function countDiff(lines: DiffLine[]): { add: number; del: number } {
	let add = 0;
	let del = 0;
	for (const l of lines) {
		if (l.sign === "+") add++;
		else if (l.sign === "-") del++;
	}
	return { add, del };
}

const dimItalic = { fg: "dim", i: true } as const;

function pendingRow(spin: string, text: string, fg: "dim" | "tool" = "dim"): BodyRow {
	return { segs: [[`${spin} ${text}`, { fg, i: true }]] };
}

function textRows(lines: string[], limit: number, expanded: boolean, fg: "muted" | "err" = "muted"): BodyRow[] {
	const shown = expanded ? lines : lines.slice(0, limit);
	const rows: BodyRow[] = shown.map((l) => ({ segs: [[l.replace(/\t/g, "  "), { fg }]] as Seg[] }));
	if (lines.length > shown.length) rows.push({ segs: [[`… ${lines.length - shown.length} more ${plural(lines.length - shown.length, "line")}`, dimItalic]] });
	return rows;
}

function badgeLine(line: string): Seg[] {
	const m = line.match(/^(\s*)(PASS|FAIL)\b(.*)$/);
	if (!m) return [[line.replace(/\t/g, "  "), { fg: "fg" }]];
	const ok = m[2] === "PASS";
	return [
		[m[1], { fg: "fg" }],
		[` ${m[2]} `, { fg: "onSeg", bg: ok ? "ok" : "err", b: true }],
		[m[3], { fg: "muted" }],
	];
}

function summarizeArgs(args: Record<string, unknown> | undefined): string {
	if (!args) return "";
	const prefer = ["command", "pattern", "query", "url", "path", "file_path", "file", "name", "prompt", "text"];
	for (const k of prefer) {
		const v = s(args[k]);
		if (v) return v.split("\n")[0];
	}
	const parts: string[] = [];
	for (const [k, v] of Object.entries(args)) {
		if (typeof v === "string") parts.push(`${k}=${v.split("\n")[0]}`);
		else if (typeof v === "number" || typeof v === "boolean") parts.push(`${k}=${v}`);
		if (parts.length >= 3) break;
	}
	return parts.join(" ");
}

export function headerArg(name: string, args: Record<string, unknown> | undefined): string {
	if (name === "read") {
		const p = s(args?.path) ?? "";
		const off = typeof args?.offset === "number" ? args.offset : undefined;
		const lim = typeof args?.limit === "number" ? args.limit : undefined;
		if (off !== undefined && lim !== undefined) return `${p}:${off}-${off + lim - 1}`;
		return p;
	}
	if (name === "bash") {
		const c = s(args?.command) ?? "";
		const first = c.split("\n")[0];
		return c.includes("\n") ? first + " …" : first;
	}
	if (name === "edit" || name === "write") return s(args?.path) ?? "";
	return summarizeArgs(args);
}

export function toolView(i: ToolInput, g: Glyphs): ToolV {
	const state: ToolState = i.pending ? "pending" : i.isError ? "err" : "ok";
	const dur = i.durationMs !== undefined ? ` · ${toolDuration(i.durationMs)}` : "";
	const view: ToolV = {
		name: i.name,
		icon: iconFor(i.name, g),
		arg: headerArg(i.name, i.args),
		state,
		status: "",
		body: [],
		spin: i.spin,
	};
	const text = i.text ?? "";

	switch (i.name) {
		case "read": {
			if (state === "pending") {
				view.body = [pendingRow(i.spin, "reading…")];
				break;
			}
			if (state === "err") {
				view.status = firstLine(text) || "error";
				view.body = textRows(text.split("\n"), COLLAPSED_GENERIC, i.expanded, "err");
				break;
			}
			const offset = typeof i.args?.offset === "number" ? i.args.offset : 1;
			const { lines, total } = parseReadText(text, offset);
			view.status = `${total} ${total === 1 ? "line" : "lines"}${dur}`;
			if (lines.length === 1 && lines[0] === "" && !text) {
				view.body = [];
				break;
			}
			const shown = i.expanded ? lines : lines.slice(0, COLLAPSED_READ);
			const numW = Math.max(4, String(offset + shown.length - 1).length);
			view.body = shown.map((l, k) => ({
				segs: [
					[String(offset + k).padStart(numW) + "  ", { fg: "dim" }],
					[l.replace(/\t/g, "  "), { fg: "muted" }],
				] as Seg[],
			}));
			if (total > shown.length + Math.max(0, offset - 1)) {
				const more = total - shown.length - Math.max(0, offset - 1);
				view.body.push({ segs: [[" ".repeat(numW + 2) + `… ${more} more ${plural(more, "line")}`, dimItalic]] });
			}
			break;
		}
		case "bash": {
			const cmd = s(i.args?.command) ?? "";
			const head: BodyRow = { segs: [["$ ", { fg: "dim" }], [cmd.split("\n")[0], { fg: "fg", b: true }]] };
			if (state === "pending") {
				view.body = [head, pendingRow(i.spin, "running…", "tool")];
				break;
			}
			const { output, exit } = parseBashText(text);
			const code = exit ?? (state === "err" ? 1 : 0);
			view.status = `exit ${code}${dur}`;
			const shown = i.expanded ? output : output.slice(-COLLAPSED_BASH);
			const rows: BodyRow[] = [head];
			if (output.length > shown.length) rows.push({ segs: [[`… ${output.length - shown.length} earlier ${plural(output.length - shown.length, "line")}`, dimItalic]] });
			for (const l of shown) rows.push({ segs: badgeLine(l) });
			view.body = rows;
			break;
		}
		case "edit": {
			if (state === "pending") {
				view.body = [pendingRow(i.spin, "applying edit…")];
				break;
			}
			const diff = (i.details as { diff?: string } | undefined)?.diff;
			if (state === "err" || !diff) {
				view.status = state === "err" ? firstLine(text) || "error" : "done";
				view.body = text ? textRows(text.split("\n"), COLLAPSED_GENERIC, i.expanded, state === "err" ? "err" : "muted") : [];
				if (state !== "err") view.status += dur;
				break;
			}
			const lines = parseDiff(diff);
			const { add, del } = countDiff(lines);
			view.status = `+${add} −${del}${dur}`;
			const changed = lines.filter((l) => l.sign === "+" || l.sign === "-");
			const list = i.expanded ? lines : changed.slice(0, COLLAPSED_EDIT);
			view.body = list.map((l): BodyRow => {
				if (l.sign === "…") return { segs: [[" ".repeat(5) + "…", dimItalic]] };
				const band = l.sign === "+" ? "addBg" : l.sign === "-" ? "delBg" : undefined;
				const signFg = l.sign === "+" ? "add" : l.sign === "-" ? "del" : "dim";
				return {
					band,
					segs: [
						[l.num.padStart(4) + " ", { fg: "dim", bg: band }],
						[l.sign + " ", { fg: signFg, b: true, bg: band }],
						[l.code.replace(/\t/g, "  "), { fg: l.sign === " " ? "muted" : "fg", bg: band }],
					] as Seg[],
				};
			});
			if (!i.expanded && changed.length > list.length) {
				view.body.push({ segs: [[`     … ${changed.length - list.length} more changed ${plural(changed.length - list.length, "line")}`, dimItalic]] });
			}
			break;
		}
		case "write": {
			if (state === "pending") {
				view.body = [pendingRow(i.spin, "writing…")];
				break;
			}
			if (state === "err") {
				view.status = firstLine(text) || "error";
				view.body = textRows(text.split("\n"), COLLAPSED_GENERIC, i.expanded, "err");
				break;
			}
			const content = s(i.args?.content) ?? "";
			const lines = content.split("\n");
			if (lines.length && lines[lines.length - 1] === "") lines.pop();
			view.status = `${lines.length} ${lines.length === 1 ? "line" : "lines"}${dur}`;
			const shown = i.expanded ? lines : lines.slice(0, COLLAPSED_READ);
			view.body = shown.map((l, k) => ({
				segs: [
					[String(k + 1).padStart(4) + " ", { fg: "dim", bg: "addBg" }],
					["+ ", { fg: "add", b: true, bg: "addBg" }],
					[l.replace(/\t/g, "  "), { fg: "fg", bg: "addBg" }],
				] as Seg[],
				band: "addBg",
			}));
			if (lines.length > shown.length) view.body.push({ segs: [[`     … ${lines.length - shown.length} more ${plural(lines.length - shown.length, "line")}`, dimItalic]] });
			break;
		}
		default: {
			if (state === "pending") {
				view.body = i.foreign?.length ? i.foreign.map((l) => ({ segs: [[l]] as Seg[] })) : [pendingRow(i.spin, "running…", "tool")];
				break;
			}
			view.status = (state === "err" ? firstLine(text) || "error" : "done") + (state === "err" ? "" : dur);
			if (i.foreign) view.body = i.foreign.map((l) => ({ segs: [[l]] as Seg[] }));
			else view.body = text.trim() ? textRows(text.replace(/\s+$/, "").split("\n"), COLLAPSED_GENERIC, i.expanded, state === "err" ? "err" : "muted") : [];
		}
	}
	return view;
}

const plural = (n: number, word: string): string => (n === 1 ? word : `${word}s`);

function firstLine(t: string, max = 40): string {
	const l = t.split("\n").find((x) => x.trim())?.trim() ?? "";
	const chars = Array.from(l);
	return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : l;
}
