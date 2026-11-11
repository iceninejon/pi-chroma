// Rail — no boxes: a coloured gutter rail and a glyph mark each block (guide §11).
import { bar, clipSegs, lr, row, segW, sp, spark as sparkSegs, w, type ColorKey, type Row, type Seg } from "../grid.ts";
import { middleEllipsis, pct, tokens } from "../format.ts";
import { bold, chipUnit, fitArg, fitFooter, INLINE_CODE, planRows, shimmer, spinFrame, st, statsPlan } from "./common.ts";
import type { Env, FooterV, StatusV, StyleImpl, ToolV } from "./types.ts";
import type { FooterFlags } from "./common.ts";

const rail = (env: Env, c: ColorKey, ch = "▎"): Seg[] => [sp(env.pad), [ch, st(c)], sp(2)];

function statusLine(env: Env, v: StatusV): Row[] {
	const { g, W } = env;
	const left: Seg[] = [
		sp(1),
		[spinFrame(env, g.spinner.rail), bold("accent")],
		sp(2),
		...shimmer(v.verb + "…", st("accent"), env),
		sp(3),
		[v.elapsed, st("fg")],
		[" elapsed", st("dim")],
	];
	const ttft: Seg[] = [sp(2), ["ttft ", st("dim")], [v.ttft, st("fg")]];
	const tok: Seg[] = [sp(2), [g.down + " ", st("accent")], [v.tokens, st("fg")]];
	const hint: Seg[] = [[`${v.abortKey} to interrupt `, st("dim")]];
	if (W >= 100) return [lr([...left, ...ttft, ...tok], hint, W)];
	if (W >= 80) return [lr([...left, ...ttft, ...tok], [], W)];
	if (W >= 60) return [lr([...left, ...tok], [], W)];
	return [lr(left, [], W)];
}

function footerRows(env: Env, v: FooterV): Row[] {
	const { g, W } = env;
	const c = v.color;
	const lvl: Seg[] = [[g.brain + " ", st(v.levelColor)], [v.level, st("fg")]];
	const build = (f: FooterFlags) => {
		const ctxBar = bar(v.fraction, f.shortBar ? 8 : 16, "━", "╌", st(c), st("border"));
		const ctx: Seg[] = [
			["ctx ", st("dim")],
			...ctxBar,
			[` ${pct(v.fraction)}`, bold("fg")],
			...(f.totals ? ([[` ${tokens(v.usedTokens)}/${tokens(v.windowTokens)}`, st("muted")]] as Seg[]) : []),
		];
		const prov: Seg[] =
			f.provider === "full"
				? [[g.cloud ? g.cloud + " " : "", st("s1")], [v.provider, st("fg")], ["/", st("dim")], [v.model, bold("fg")]]
				: f.provider === "glyph"
					? [[g.cloud ? g.cloud + " " : "", st("s1")], [v.model, bold("fg")]]
					: [[v.model, bold("fg")]];
		const left: Seg[] = f.minimal
			? [sp(1), ...prov, sp(3), ["ctx ", st("dim")], [pct(v.fraction), bold("fg")]]
			: [sp(1), ...prov, sp(3), ...lvl, sp(3), ...ctx];
		const right: Seg[] = [];
		const group = (segs: Seg[]) => {
			if (right.length) right.push(sp(3));
			right.push(...segs);
		};
		if (v.sessionRow && f.io) group([[g.up + " ", st("user")], [tokens(v.sessIn), st("fg")], sp(1), [g.down + " ", st("accent")], [tokens(v.sessOut), st("fg")]]);
		if (v.sessionRow && f.io && f.cost && v.cost > 0) group([[`$${v.cost.toFixed(2)}`, st("tool")]]);
		if (v.sessionRow && f.io && f.spark && v.tps.length >= 3) group([...sparkSegs(v.tps.slice(-f.spark), g.railSpark, st("s4")), [" tps", st("dim")]]);
		if (f.branch && v.branch) {
			if (right.length) right.push(sp(3));
			right.push([g.branch ? g.branch + " " : "", st("s5")], [v.branch, st("fg")], [v.dirty ? ` ±${v.dirty} ` : " ", st("warn")]);
		} else if (right.length) right.push(sp(1));
		return { left, right };
	};
	return [fitFooter(W, build)];
}

function toolFrame(env: Env, v: ToolV): Row[] {
	const { g, W } = env;
	const c = v.state === "err" ? "err" : "tool";
	const statusTxt = v.state === "pending" ? `${v.spin} running` : `${v.state === "err" ? g.cross : g.check} ${v.status}`;
	const sc = v.state === "pending" ? "tool" : v.state === "err" ? "err" : "ok";
	const lead: Seg[] = [...rail(env, c), [`${v.icon} ${v.name}`, bold(c)], sp(2)];
	const budget = W - segW(lead) - w(statusTxt) - 2;
	const arg = fitArg(v.arg, budget, v.name !== "bash", middleEllipsis);
	const head = lr([...lead, [arg, st("fg")]], clipSegs([[statusTxt + " ", st(sc)]], Math.max(8, Math.floor(W / 2))), W);
	const inner = Math.max(1, W - env.pad - 6);
	const body = v.body.map((b): Row => {
		const clipped = clipSegs(b.segs, inner);
		const padded: Seg[] = b.band ? [...clipped, sp(inner - segW(clipped), { bg: b.band })] : clipped;
		return row([...rail(env, c), sp(2), ...padded]);
	});
	return [head, ...body];
}

export const railStyle: StyleImpl = {
	name: "rail",
	spinner: (env) => spinFrame(env, env.g.spinner.rail),
	status: statusLine,
	warning(env, v) {
		const g = env.g;
		const tail: Seg[] = v.compactionEnabled
			? [[`  auto-compaction runs at ${v.pointPct}% · `, st("muted")], ["/compact", INLINE_CODE], [" to compact now", st("muted")]]
			: [["  compaction is off", st("muted")]];
		return [row(clipSegs([...rail(env, "warn"), [g.warn + " ", bold("warn")], [`context ${v.pct} full`, bold("warn")], ...tail], env.W))];
	},
	plan(env, v) {
		const g = env.g;
		return [
			row(clipSegs([...rail(env, "tool"), [`${g.tasks} plan`, bold("tool")], [`  ${v.done}/${v.items.length}`, st("dim")]], env.W)),
			...planRows(g, v.items, Math.max(1, env.W - env.pad - 5)).map((s) => row([...rail(env, "tool"), sp(2), ...s])),
		];
	},
	footer: footerRows,
	tool: toolFrame,
	stats(env, v) {
		const plan = statsPlan(env.W, v.chips);
		const out: Row[] = plan.groups.map((grp, gi) => {
			const segs: Seg[] = [sp(6)];
			if (gi === 0 && v.interrupted) segs.push(["interrupted", bold("warn")], sp(2));
			for (const c of grp) {
				const unit = chipUnit(c, plan);
				if (plan.icons && c.icon) segs.push([c.icon + " ", st(c.color)]);
				segs.push([c.value, bold("fg")]);
				if (unit) segs.push([" " + unit, st("muted")]);
				segs.push(sp(2));
			}
			return row(clipSegs(segs, env.W));
		});
		// Turn separator: blank row, then a hairline rule.
		out.push(row([]), row([sp(1), ["┄".repeat(Math.max(0, env.W - 2)), st("border")]]));
		return out;
	},
	banner(env, v) {
		const g = env.g;
		return [
			row([]),
			row(clipSegs([...rail(env, "accent"), [`${g.bot} pi`, bold("accent")], ["  ready", st("muted")]], env.W)),
			row(clipSegs([...rail(env, "accent"), [`${v.model} via ${v.provider}  ·  ${v.cwd}${v.branch ? `  ·  ${v.branch}` : ""}`, st("dim")]], env.W)),
			row([]),
		];
	},
	collapsedThinking: (env, d, tok) => `${env.g.brain} thought for ${d}  ·  ${tok} tok  ·  ▸ collapsed`,
	editor: {
		innerWidth: (env) => Math.max(4, env.W - 6),
		top(env, v) {
			const g = env.g;
			const title: Seg[] = clipSegs([["── ", st("border")], [`${g.folder} ${v.cwd} `, st("muted")]], env.W);
			return row([...title, ["─".repeat(Math.max(0, env.W - segW(title))), st("border")]]);
		},
		bottom(env) {
			const hint = ` ${env.g.enter} send `;
			const h = w(hint) + 2 <= env.W ? hint : "";
			return row([["─".repeat(Math.max(0, env.W - 2 - w(h))), st("border")], [h, st("dim")], ["──".slice(0, Math.min(2, env.W)), st("border")]]);
		},
		wrap(env, _v, _c, first) {
			return { left: [sp(1), [first ? env.g.chev + " " : "  ", bold("accent")]], right: [] };
		},
	},
};
