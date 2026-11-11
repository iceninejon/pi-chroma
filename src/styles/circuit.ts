// Circuit — dense powerline HUD: full-width bands, arrow-cut labels, block gauges (guide §10).
import { bar, box, clipSegs, lr, row, segW, sp, spark as sparkSegs, w, type ColorKey, type Row, type Seg } from "../grid.ts";
import { middleEllipsis, pct, tokens } from "../format.ts";
import { bold, chain, chipUnit, fitArg, fitFooter, INLINE_CODE, planRows, seg, shimmer, spinFrame, st, statsPlan } from "./common.ts";
import type { Env, FooterV, StatusV, StyleImpl, ToolV } from "./types.ts";
import type { FooterFlags } from "./common.ts";

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
	const build = (f: FooterFlags) => {
		const gaugeSegs = bar(v.fraction, f.shortBar ? 6 : 10, "█", "░", { fg: c, bg: "panel" }, { fg: "dim", bg: "panel" });
		const body: Seg[] = [
			[` ${g.gauge ? g.gauge + " " : ""}`, { fg: c, bg: "panel" }],
			...gaugeSegs,
			[` ${pct(v.fraction)} `, { fg: "fg", bg: "panel", b: true }],
			...(f.totals ? ([[`${tokens(v.usedTokens)}/${tokens(v.windowTokens)} `, { fg: "muted", bg: "panel" }]] as Seg[]) : []),
		];
		const tail: Seg[] = g.caps === "nerd" ? [...body, [g.plR, st("panel")]] : body;
		const items: { label: string; c: ColorKey; fg?: ColorKey }[] = [];
		if (f.provider === "full") items.push({ label: ` ${g.cloud ? g.cloud + " " : ""}${v.provider.toUpperCase()} `, c: "s1" });
		else if (f.provider === "glyph") items.push({ label: ` ${g.cloud || "·"} `, c: "s1" });
		items.push({ label: ` ${g.chip ? g.chip + " " : ""}${v.model} `, c: "s2" });
		if (!f.minimal) items.push({ label: ` ${g.brain} ${upperLevel} `, c: levelFill, fg: levelFg });
		const head: Seg[] = [];
		if (g.caps === "nerd") {
			items.forEach((it, i) => {
				head.push([it.label, { bg: it.c, fg: it.fg ?? "onSeg", b: true }]);
				head.push([g.plR, { fg: it.c, bg: items[i + 1]?.c ?? "panel" }]);
			});
		} else {
			head.push(...chain(g, items), sp(1));
		}
		const left: Seg[] = [...head, ...tail];
		const right: Seg[] = [];
		const group = (segs: Seg[]) => {
			if (right.length) right.push(sp(2));
			right.push(...segs);
		};
		if (v.sessionRow && f.io) group([[g.up + " ", st("user")], [tokens(v.sessIn), st("fg")], sp(1), [g.down + " ", st("accent")], [tokens(v.sessOut), st("fg")]]);
		if (v.sessionRow && f.io && f.cost && v.cost > 0) group([[`$${v.cost.toFixed(2)}`, bold("tool")]]);
		if (v.sessionRow && f.io && f.spark && v.tps.length >= 3) group([["TPS ", st("muted")], ...sparkSegs(v.tps.slice(-f.spark), g.spark, st("s4"))]);
		if (f.branch && v.branch) {
			if (right.length) right.push(sp(2));
			const label = ` ${g.branch ? g.branch + " " : ""}${v.branch}${v.dirty ? ` ±${v.dirty}` : ""} `;
			if (g.caps === "nerd") right.push([g.plL, st("s5")], [label, { bg: "s5", fg: "onSeg", b: true }]);
			else right.push([label, { bg: g.caps === "plain" ? "s5" : undefined, fg: g.caps === "plain" ? "onSeg" : "s5", b: true }]);
		} else if (right.length) right.push(sp(1));
		return { left, right };
	};
	return [fitFooter(W, build)];
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
