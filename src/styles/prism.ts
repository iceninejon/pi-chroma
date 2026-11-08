// Prism — Charm-style softness: rounded boxes, capped pills, chips (guide §9).
import { bar, box, clipSegs, lr, row, segW, sp, w, type Row, type Seg } from "../grid.ts";
import { middleEllipsis, pct, tokens } from "../format.ts";
import { bold, chipUnit, fitArg, fitSpark, INLINE_CODE, pill, planRows, shimmer, spinFrame, st, statsPlan } from "./common.ts";
import type { Env, FooterV, StyleImpl, ToolV } from "./types.ts";

const indentOf = (env: Env) => env.pad;
const boxW = (env: Env) => Math.max(8, env.W - 2 * env.pad);

function statusLine(env: Env, v: import("./types.ts").StatusV): Row[] {
	const { g, W } = env;
	const hint = `${v.abortKey} to interrupt`;
	const left: Seg[] = [
		sp(2),
		[spinFrame(env, g.spinner.prism), bold("accent")],
		sp(1),
		...shimmer(v.verb + "…", bold("accent"), env),
		sp(3),
		[g.clock + " ", st("s3")],
		[v.elapsed, st("fg")],
	];
	const ttft: Seg[] = [sp(2), [g.timer + " ", st("s1")], [v.ttft, st("fg")]];
	const tok: Seg[] = [sp(2), [g.down + " ", st("accent")], [v.tokens, st("fg")]];
	const full = [...left, ...ttft, ...tok];
	const hintSegs: Seg[] = [[hint + "  ", st("dim")]];
	if (W >= 100) return [lr(full, hintSegs, W)];
	if (W >= 80) return [lr(full, [], W)];
	if (W >= 60) return [lr([...left, ...tok], [], W)];
	return [lr(left, [], W)];
}

function footerRows(env: Env, v: FooterV): Row[] {
	const { g, W } = env;
	const c = v.color;
	const ctxBar = (n: number): Seg[] => bar(v.fraction, n, "━", "━", st(c), st("border"));
	const levelPill =
		v.level === "off" || v.level === "minimal"
			? pill(g, ` ${g.brain} ${v.level} `, "panel", "fg")
			: pill(g, ` ${g.brain} ${v.level} `, v.levelColor);
	const right: Seg[] = v.branch
		? [...pill(g, ` ${g.branch} ${v.branch} `, "s5"), ...(v.dirty > 0 ? [[` ±${v.dirty} `, bold("warn")] as Seg] : [sp(1)])]
		: [];
	const gauge: Seg = [g.gauge + " ", st(c)];
	const used: Seg = [` ${tokens(v.usedTokens)}/${tokens(v.windowTokens)}`, st("muted")];
	const percent: Seg = [` ${pct(v.fraction)}`, bold("fg")];
	const levels: Seg[][] = [
		// 0 full
		[sp(1), ...pill(g, ` ${g.cloud} ${v.provider} `, "s1"), sp(1), ...pill(g, ` ${g.chip} ${v.model} `, "s2"), sp(1), ...levelPill, sp(2), gauge, ...ctxBar(14), percent, used],
		// 1 drop used/total
		[sp(1), ...pill(g, ` ${g.cloud} ${v.provider} `, "s1"), sp(1), ...pill(g, ` ${g.chip} ${v.model} `, "s2"), sp(1), ...levelPill, sp(2), gauge, ...ctxBar(14), percent],
		// 2 shorten bar
		[sp(1), ...pill(g, ` ${g.cloud} ${v.provider} `, "s1"), sp(1), ...pill(g, ` ${g.chip} ${v.model} `, "s2"), sp(1), ...levelPill, sp(2), gauge, ...ctxBar(8), percent],
		// 3 provider pill → glyph only
		[sp(1), ...pill(g, ` ${g.cloud || "·"} `, "s1"), sp(1), ...pill(g, ` ${g.chip} ${v.model} `, "s2"), sp(1), ...levelPill, sp(2), gauge, ...ctxBar(8), percent],
		// 4 model + context % only
		[sp(1), ...pill(g, ` ${g.chip} ${v.model} `, "s2"), sp(2), gauge, percent],
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
		const barN = (n: number) => bar(v.fraction, n, "━", "━", st(c), st("border"));
		const head: Seg[] = [sp(2), ["session  ", bold("dim")]];
		const names = (providerToo: boolean): Seg[] =>
			providerToo ? [[v.provider, st("muted")], [" › ", st("dim")], [v.model, st("muted")]] : [[v.model, st("muted")]];
		const win = (n: number): Seg[] => [[tokens(v.windowTokens) + " ", st("muted")], ...barN(n), [` ${pct(v.fraction)}`, bold("muted")]];
		const io: Seg[] = [sp(2), [g.up + " ", st("user")], [tokens(v.sessIn), st("fg")], sp(1), [g.down + " ", st("accent")], [tokens(v.sessOut), st("fg")]];
		const cost: Seg[] = v.cost > 0 ? [sp(2), [g.dollar + " ", st("tool")], [v.cost.toFixed(2), st("fg")]] : [];
		const spkFor = (avail: number): Seg[] =>
			fitSpark(v.tps, avail, 6, (sp4) => [["tps ", st("dim")], ...sp4.map((x) => [x[0], st("s4")] as Seg), sp(2)], g.spark);
		const cand: { left: Seg[]; right: Seg[]; fit?: boolean }[] = [
			{ left: [...head, ...names(true), sp(2), ...win(6), ...io, ...cost], right: [] as Seg[], fit: true },
			{ left: [...head, ...names(true), sp(2), ...win(6), ...io, ...cost], right: [] },
			{ left: [...head, ...names(true), sp(2), ...win(6), ...io], right: [] },
			{ left: [...head, ...names(false), sp(2), ...win(4), ...io], right: [] },
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
	const { g } = env;
	const X = boxW(env);
	const c = v.state === "err" ? "err" : "tool";
	const statusTxt =
		v.state === "pending" ? `${v.spin} running` : `${v.state === "err" ? g.cross : g.check} ${v.status}`;
	const sc = v.state === "pending" ? "tool" : v.state === "err" ? "err" : "ok";
	const title: Seg[] = [[` ${v.icon} ${v.name} `, bold(c)]];
	const budget = X - 3 - w(` ${v.icon} ${v.name} `) - w(` ${statusTxt} `) - 3;
	const isPath = v.name !== "bash";
	const arg = fitArg(v.arg, budget, isPath, middleEllipsis);
	if (arg) title.push([arg + " ", st("muted")]);
	return box({
		width: X,
		indent: indentOf(env),
		bc: c,
		title,
		status: [[` ${statusTxt} `, bold(sc)]],
		body: v.body.map((b) => b.segs),
		rowFill: v.body.map((b) => (b.band ? { bg: b.band } : undefined)),
	});
}

export const prism: StyleImpl = {
	name: "prism",
	spinner: (env) => spinFrame(env, env.g.spinner.prism),
	status: statusLine,
	warning(env, v) {
		const g = env.g;
		const tail: Seg[] = v.compactionEnabled
			? [[` — auto-compaction runs at ${v.pointPct}%. Run `, st("muted")], ["/compact", INLINE_CODE], [" to compact now.", st("muted")]]
			: [[" — compaction is off", st("muted")]];
		return [lr([sp(2), [g.warn + " ", bold("warn")], [`Context ${v.pct} full`, bold("warn")], ...tail], [], env.W)];
	},
	plan(env, v) {
		const X = boxW(env);
		const g = env.g;
		return box({
			width: X,
			indent: indentOf(env),
			bc: "border",
			title: [[` ${g.tasks} plan `, bold("tool")], [`${v.done}/${v.items.length} `, st("dim")]],
			status: [],
			body: planRows(g, v.items, X - 4),
		});
	},
	footer: footerRows,
	tool: toolFrame,
	stats(env, v) {
		const g = env.g;
		const plan = statsPlan(env.W, v.chips);
		const mk = (chips: typeof v.chips, lead: Seg[]): Row => {
			const segs: Seg[] = [sp(2), ...lead];
			for (const c of chips) {
				const unit = chipUnit(c, plan);
				const text: Seg[] = [
					...(plan.icons && c.icon ? [[c.icon + " ", { fg: c.color, bg: "panel" }] as Seg] : []),
					[c.value, { fg: "fg", bg: "panel", b: true }],
					...(unit ? [[" " + unit, { fg: "muted", bg: "panel" }] as Seg] : []),
				];
				if (g.caps === "nerd") segs.push([g.rndL, st("panel")], ...text, [g.rndR, st("panel")]);
				else if (g.caps === "plain") segs.push([" ", { bg: "panel" }], ...text, [" ", { bg: "panel" }]);
				else segs.push(["[", st("dim")], ...text.map(([t, s]) => [t, { ...s, bg: undefined }] as Seg), ["]", st("dim")]);
				segs.push(sp(1));
			}
			return row(clipSegs(segs, env.W));
		};
		const lead: Seg[] = v.interrupted ? pill(g, " interrupted ", "panel", "warn") : [];
		return plan.groups.map((grp, i) => mk(grp, i === 0 && lead.length ? [...lead, sp(1)] : []));
	},
	banner(env, v) {
		const g = env.g;
		return [
			row([]),
			row(clipSegs([sp(2), [`${g.bot} pi`, bold("accent")], ["  ·  ready", st("muted")]], env.W)),
			row(
				clipSegs(
					[
						sp(2),
						[`${v.model} via ${v.provider}`, st("dim")],
						...(v.branch ? ([["  ·  ", st("dim")], [`${g.branch} ${v.branch}`, st("dim")]] as Seg[]) : []),
					],
					env.W,
				),
			),
			row([]),
		];
	},
	collapsedThinking: (env, d, tok) => `${env.g.brain} Thought for ${d}  ·  ${tok} tokens  ·  ▸ collapsed`,
	editor: {
		innerWidth: (env) => Math.max(4, boxW(env) - 6),
		top(env, v) {
			const X = boxW(env);
			const g = env.g;
			const bc = v.busy ? "border" : "accent";
			return box({
				width: X,
				indent: indentOf(env),
				bc,
				title: [[` ${g.folder} ${v.cwd} `, st("muted")]],
				status: [],
				body: [],
			})[0];
		},
		bottom(env, v) {
			const X = boxW(env);
			const g = env.g;
			const bc = v.busy ? "border" : "accent";
			const rows = box({
				width: X,
				indent: indentOf(env),
				bc,
				title: [],
				status: [[` ${g.enter} send `, st("dim")]],
				body: [],
			});
			return rows[rows.length - 1];
		},
		wrap(env, v, _content, first) {
			const bc = v.busy ? "border" : "accent";
			return {
				left: [sp(indentOf(env)), ["│ ", st(bc)], [first ? env.g.chev + " " : "  ", bold("accent")]],
				right: [[" │", st(bc)]],
			};
		},
	},
};
