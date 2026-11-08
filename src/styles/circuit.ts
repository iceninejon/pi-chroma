// Circuit — dense powerline HUD: full-width bands, arrow-cut labels, block gauges (guide §10).
import { bar, box, clipSegs, lr, row, segW, sp, w, type Row, type Seg } from "../grid.ts";
import { middleEllipsis, pct, tokens } from "../format.ts";
import { bold, chain, chipUnit, fitArg, fitSpark, INLINE_CODE, planRows, seg, shimmer, spinFrame, st, statsPlan } from "./common.ts";
import type { Env, FooterV, StatusV, StyleImpl, ToolV } from "./types.ts";

function statusLine(env: Env, v: StatusV): Row[] {
	const { g, W } = env;
	const left: Seg[] = [
		...seg(g, ` ${spinFrame(env, g.spinner.circuit)} `, "accent"),
		sp(1),
		...shimmer(v.verb.toUpperCase() + "…", bold("accent"), env),
		sp(3),
		[g.clock + " ", st("s3")],
		[v.elapsed, bold("fg")],
	];
	const ttft: Seg[] = [sp(2), [g.timer + " ttft ", st("s1")], [v.ttft, bold("fg")]];
	const tok: Seg[] = [sp(2), [g.down + " ", st("accent")], [v.tokens, bold("fg")]];
	const hint: Seg[] = [[`${v.abortKey.toUpperCase()} interrupt `, st("dim")]];
	if (W >= 100) return [lr([...left, ...ttft, ...tok], hint, W)];
	if (W >= 80) return [lr([...left, ...ttft, ...tok], [], W)];
	if (W >= 60) return [lr([...left, ...tok], [], W)];
	return [lr(left, [], W)];
}

function footerRows(env: Env, v: FooterV): Row[] {
	const { g, W } = env;
	const c = v.color;
	const upperLevel = v.level.toUpperCase();
	const levelFill = v.level === "off" || v.level === "minimal" ? ("panel" as const) : v.levelColor;
	const levelFg = v.level === "off" || v.level === "minimal" ? ("fg" as const) : ("onSeg" as const);
	const right: Seg[] = v.branch
		? g.caps === "nerd"
			? [[g.plL, st("s5")], [` ${g.branch} ${v.branch}${v.dirty ? ` ±${v.dirty}` : ""} `, { bg: "s5", fg: "onSeg", b: true }]]
			: [[` ${g.branch ? g.branch + " " : ""}${v.branch}${v.dirty ? ` ±${v.dirty}` : ""} `, { bg: g.caps === "plain" ? "s5" : undefined, fg: g.caps === "plain" ? "onSeg" : "s5", b: true }]]
		: [];
	const gaugeSegs = (n: number): Seg[] => bar(v.fraction, n, "█", "░", { fg: c, bg: "panel" }, { fg: "dim", bg: "panel" });
	const tail = (barN: number, withTotals: boolean): Seg[] => {
		const body: Seg[] = [
			[` ${g.gauge ? g.gauge + " " : ""}`, { fg: c, bg: "panel" }],
			...gaugeSegs(barN),
			[` ${pct(v.fraction)} `, { fg: "fg", bg: "panel", b: true }],
			...(withTotals ? ([[`${tokens(v.usedTokens)}/${tokens(v.windowTokens)} `, { fg: "muted", bg: "panel" }]] as Seg[]) : []),
		];
		return g.caps === "nerd" ? [...body, [g.plR, st("panel")]] : body;
	};
	const build = (providerLabel: string, model: boolean, barN: number, totals: boolean): Seg[] => {
		const items = [
			{ label: ` ${g.cloud ? g.cloud + " " : ""}${providerLabel} `, c: "s1" as const },
			...(model ? [{ label: ` ${g.chip ? g.chip + " " : ""}${v.model} `, c: "s2" as const }] : []),
			{ label: ` ${g.brain} ${upperLevel} `, c: levelFill, fg: levelFg },
		];
		// the last arrow transitions into the panel gauge segment
		const out: Seg[] = [];
		if (g.caps === "nerd") {
			items.forEach((it, i) => {
				out.push([it.label, { bg: it.c, fg: ("fg" in it ? it.fg : "onSeg") as "onSeg", b: true }]);
				out.push([g.plR, { fg: it.c, bg: items[i + 1]?.c ?? "panel" }]);
			});
		} else {
			out.push(...chain(g, items), sp(1));
		}
		return [...out, ...tail(barN, totals)];
	};
	const levels: Seg[][] = [
		build(v.provider.toUpperCase(), true, 10, true),
		build(v.provider.toUpperCase(), true, 10, false),
		build(v.provider.toUpperCase(), true, 6, false),
		build("", true, 6, false),
		[...seg(g, ` ${g.chip ? g.chip + " " : ""}${v.model} `, "s2", "panel"), ...tail(6, false)],
	];
	const start = W >= 100 ? 0 : W >= 80 ? 1 : W >= 60 ? 3 : 4;
	let r1: Row | undefined;
	for (let i = start; i < levels.length; i++) {
		if (segW(levels[i]) + segW(right) + 1 <= W) {
			r1 = lr(levels[i], right, W);
			break;
		}
	}
	r1 ??= lr(clipSegs(levels[levels.length - 1], W), [], W);
	const rows: Row[] = [r1];

	if (v.sessionRow && W >= 60) {
		const barN = (n: number): Seg[] => [["▕", st("dim")], ...bar(v.fraction, n, "█", "░", st(c), st("dim")), ["▏", st("dim")]];
		const names = (providerToo: boolean): Seg[] => [[providerToo ? `${v.provider}/${v.model}` : v.model, st("fg")]];
		const win = (n: number): Seg[] => [[tokens(v.windowTokens) + " ", st("muted")], ...barN(n), [pct(v.fraction), bold("fg")]];
		const io: Seg[] = [sp(2), [g.up + " ", st("user")], [tokens(v.sessIn), st("fg")], sp(1), [g.down + " ", st("accent")], [tokens(v.sessOut), st("fg")]];
		const cost: Seg[] = v.cost > 0 ? [sp(2), [`$${v.cost.toFixed(2)}`, bold("tool")]] : [];
		const spkFor = (avail: number): Seg[] =>
			fitSpark(v.tps, avail, 5, (sp4) => [["TPS ", st("muted")], ...sp4.map((x) => [x[0], st("s4")] as Seg), sp(1)], g.spark);
		const head2: Seg[] = [[" SESSION ", bold("muted")]];
		const cand: { left: Seg[]; right: Seg[]; fit?: boolean }[] = [
			{ left: [...head2, ...names(true), sp(2), ...win(10), ...io, ...cost], right: [] as Seg[], fit: true },
			{ left: [...head2, ...names(true), sp(2), ...win(10), ...io, ...cost], right: [] as Seg[] },
			{ left: [...head2, ...names(true), sp(2), ...win(10), ...io], right: [] as Seg[] },
			{ left: [...head2, ...names(false), sp(2), ...win(4), ...io], right: [] as Seg[] },
		];
		const s2 = W >= 100 ? 0 : W >= 80 ? 1 : 3;
		let r2: Row | undefined;
		for (let i = s2; i < cand.length; i++) {
			if (cand[i].fit) cand[i].right = spkFor(W - segW(cand[i].left) - 1);
			if (segW(cand[i].left) + segW(cand[i].right) + 1 <= W) {
				r2 = lr(cand[i].left, cand[i].right, W, "panel");
				break;
			}
		}
		rows.push(r2 ?? lr(clipSegs(cand[cand.length - 1].left, W), [], W, "panel"));
	}
	return rows;
}

function toolFrame(env: Env, v: ToolV): Row[] {
	const { g, W } = env;
	const c = v.state === "err" ? "err" : "tool";
	const band = v.state === "err" ? "errBg" : "toolBg";
	const statusTxt = v.state === "pending" ? `${v.spin} running` : `${v.state === "err" ? g.cross : g.check} ${v.status}`;
	const sc = v.state === "pending" ? "tool" : v.state === "err" ? "err" : "ok";
	const label = ` ${v.icon} ${v.name.toUpperCase()} `;
	const lead = seg(g, label, c);
	const budget = W - segW(lead) - 1 - w(statusTxt) - 2 - 1;
	const arg = fitArg(v.arg, budget, v.name !== "bash", middleEllipsis);
	const head = lr([...lead, sp(1), [arg, bold("fg")]], clipSegs([[statusTxt + " ", bold(sc)]], Math.max(8, Math.floor(W / 2))), W, band);
	const body = v.body.map((b): Row => {
		const inner = W - 4;
		const clipped = clipSegs(b.segs, inner);
		const padded: Seg[] = b.band ? [...clipped, sp(inner - segW(clipped), { bg: b.band })] : clipped;
		return row([sp(1), ["▌ ", st(c)], ...padded]);
	});
	return [head, ...body];
}

export const circuit: StyleImpl = {
	name: "circuit",
	spinner: (env) => spinFrame(env, env.g.spinner.circuit),
	status: statusLine,
	warning(env, v) {
		const g = env.g;
		const tail: Seg[] = v.compactionEnabled
			? [[` auto-compaction runs at ${v.pointPct}% — run `, st("fg")], ["/compact", INLINE_CODE], [" to compact now", st("fg")]]
			: [[" compaction is off", st("fg")]];
		return [row(clipSegs([...seg(g, ` ${g.warn} CONTEXT ${v.pct} `, "warn"), ...tail], env.W), "warnBg")];
	},
	plan(env, v) {
		const g = env.g;
		const head = row(
			clipSegs(
				[
					...seg(g, ` ${g.tasks} PLAN `, "tool"),
					[` ${v.done}/${v.items.length}  `, st("muted")],
					...bar(v.items.length ? v.done / v.items.length : 0, 8, "█", "░", st("ok"), st("border")),
				],
				env.W,
			),
		);
		return [head, ...planRows(g, v.items, Math.max(1, env.W - 2)).map((s) => row([sp(2), ...s]))];
	},
	footer: footerRows,
	tool: toolFrame,
	stats(env, v) {
		const g = env.g;
		const plan = statsPlan(env.W, v.chips);
		return plan.groups.map((grp, gi) => {
			const items: { label: string; c: import("../grid.ts").ColorKey; fg?: import("../grid.ts").ColorKey }[] = [];
			if (gi === 0 && v.interrupted) items.push({ label: ` ${g.warn} interrupted `, c: "warn" });
			for (const c of grp) {
				const unit = chipUnit(c, plan);
				items.push({ label: ` ${plan.icons && c.icon ? c.icon + " " : ""}${c.value}${unit ? " " + unit : ""} `, c: c.color });
			}
			return row(clipSegs([sp(1), ...chain(g, items)], env.W));
		});
	},
	banner(env, v) {
		const g = env.g;
		return [
			row([]),
			row(clipSegs([...seg(g, ` ${g.bot} PI `, "accent"), [`  ready  ·  ${v.model} via ${v.provider}`, st("muted")]], env.W)),
			row(clipSegs([sp(2), [`${g.folder} ${v.cwd}${v.branch ? `   ${g.branch} ${v.branch}${v.dirty ? ` ±${v.dirty}` : ""}` : ""}`, st("dim")]], env.W)),
			row([]),
		];
	},
	collapsedThinking: (env, d, tok) => `${env.g.brain} thought for ${d}  ·  ${tok} tok  ·  ▸ collapsed`,
	editor: {
		innerWidth: (env) => Math.max(4, env.W - 6),
		top(env, v) {
			return box({
				width: env.W,
				corners: "┌┐└┘",
				bc: v.busy ? "border" : "accent",
				title: [[` ${env.g.folder} ${v.cwd} `, st("muted")]],
				status: [],
				body: [],
			})[0];
		},
		bottom(env, v) {
			const rows = box({
				width: env.W,
				corners: "┌┐└┘",
				bc: v.busy ? "border" : "accent",
				title: [],
				status: [[` ${env.g.enter} SEND `, st("dim")]],
				body: [],
			});
			return rows[rows.length - 1];
		},
		wrap(env, v, _c, first) {
			const bc = v.busy ? "border" : "accent";
			return { left: [["│ ", st(bc)], [first ? env.g.chev + " " : "  ", bold("accent")]], right: [[" │", st(bc)]] };
		},
	},
};
