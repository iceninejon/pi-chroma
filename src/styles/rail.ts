// Rail — no boxes: a coloured gutter rail and a glyph mark each block (guide §11).
import { bar, clipSegs, lr, row, segW, sp, w, type ColorKey, type Row, type Seg } from "../grid.ts";
import { middleEllipsis, pct, tokens } from "../format.ts";
import { bold, chipUnit, fitArg, fitSpark, INLINE_CODE, planRows, shimmer, spinFrame, st, statsPlan } from "./common.ts";
import type { Env, FooterV, StatusV, StyleImpl, ToolV } from "./types.ts";

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
	const right: Seg[] = v.branch
		? [[g.branch ? g.branch + " " : "", st("s5")], [v.branch, st("fg")], [v.dirty ? ` ±${v.dirty} ` : " ", st("warn")]]
		: [];
	const ctxBar = (n: number): Seg[] => bar(v.fraction, n, "━", "╌", st(c), st("border"));
	const lvl: Seg[] = [[g.brain + " ", st(v.levelColor)], [v.level, st("fg")]];
	const prov: Seg[] = [[g.cloud ? g.cloud + " " : "", st("s1")], [v.provider, st("fg")], ["/", st("dim")], [v.model, bold("fg")]];
	const ctx = (n: number, totals: boolean): Seg[] => [
		["ctx ", st("dim")],
		...ctxBar(n),
		[` ${pct(v.fraction)}`, bold("fg")],
		...(totals ? ([[` ${tokens(v.usedTokens)}/${tokens(v.windowTokens)}`, st("muted")]] as Seg[]) : []),
	];
	const levels: Seg[][] = [
		[sp(1), ...prov, sp(3), ...lvl, sp(3), ...ctx(16, true)],
		[sp(1), ...prov, sp(3), ...lvl, sp(3), ...ctx(16, false)],
		[sp(1), ...prov, sp(3), ...lvl, sp(3), ...ctx(8, false)],
		[sp(1), [g.cloud ? g.cloud + " " : "", st("s1")], [v.model, bold("fg")], sp(3), ...lvl, sp(3), ...ctx(8, false)],
		[sp(1), [v.model, bold("fg")], sp(3), ["ctx ", st("dim")], [pct(v.fraction), bold("fg")]],
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
		const barN = (n: number): Seg[] => bar(v.fraction, n, "━", "╌", st(c), st("border"));
		const head: Seg[] = [sp(1), ["session  ", st("dim")]];
		const names = (providerToo: boolean): Seg[] => [
			[providerToo ? `${v.provider} · ${v.model} · ${tokens(v.windowTokens)}` : `${v.model} · ${tokens(v.windowTokens)}`, st("muted")],
		];
		const win = (n: number): Seg[] => [...barN(n), [` ${pct(v.fraction)}`, st("muted")]];
		const io: Seg[] = [sp(3), [g.up + " ", st("user")], [tokens(v.sessIn), st("fg")], sp(1), [g.down + " ", st("accent")], [tokens(v.sessOut), st("fg")]];
		const cost: Seg[] = v.cost > 0 ? [sp(3), [`$${v.cost.toFixed(2)}`, st("tool")]] : [];
		const spkFor = (avail: number): Seg[] =>
			fitSpark(v.tps, avail, 5, (sp4) => [...sp4.map((x) => [x[0], st("s4")] as Seg), [" tps ", st("dim")]], g.railSpark);
		const cand: { left: Seg[]; right: Seg[]; fit?: boolean }[] = [
			{ left: [...head, ...names(true), sp(2), ...win(8), ...io, ...cost], right: [] as Seg[], fit: true },
			{ left: [...head, ...names(true), sp(2), ...win(8), ...io, ...cost], right: [] as Seg[] },
			{ left: [...head, ...names(true), sp(2), ...win(8), ...io], right: [] as Seg[] },
			{ left: [...head, ...names(false), sp(2), ...win(4), ...io], right: [] as Seg[] },
		];
		const s2 = W >= 100 ? 0 : W >= 80 ? 1 : 3;
		let r2: Row | undefined;
		for (let i = s2; i < cand.length; i++) {
			if (cand[i].fit) cand[i].right = spkFor(W - segW(cand[i].left) - 1);
			if (segW(cand[i].left) + segW(cand[i].right) + 1 <= W) {
				r2 = lr(cand[i].left, cand[i].right, W);
				break;
			}
		}
		rows.push(r2 ?? lr(clipSegs(cand[cand.length - 1].left, W), [], W));
	}
	return rows;
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
