// Prism — Charm-style softness: rounded boxes, capped pills, chips (guide §9).
import { bar, box, clipSegs, lr, row, segW, sp, spark as sparkSegs, w, type Row, type Seg } from "../grid.ts";
import { middleEllipsis, pct, tokens } from "../format.ts";
import { bold, chipUnit, fitArg, fitFooter, INLINE_CODE, pill, planRows, shimmer, spinFrame, st, statsPlan } from "./common.ts";
import type { Env, FooterV, StyleImpl, ToolV } from "./types.ts";
import type { FooterFlags } from "./common.ts";

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
	const levelPill =
		v.level === "off" || v.level === "minimal"
			? pill(g, ` ${g.brain} ${v.level} `, "panel", "fg")
			: pill(g, ` ${g.brain} ${v.level} `, v.levelColor);
	const gauge: Seg = [g.gauge + " ", st(c)];
	const percent: Seg = [` ${pct(v.fraction)}`, bold("fg")];
	const build = (f: FooterFlags) => {
		const ctxBar = bar(v.fraction, f.shortBar ? 8 : 14, "━", "━", st(c), st("border"));
		const used: Seg[] = f.totals ? [[` ${tokens(v.usedTokens)}/${tokens(v.windowTokens)}`, st("muted")]] : [];
		const providerPill: Seg[] =
			f.provider === "full"
				? [...pill(g, ` ${g.cloud} ${v.provider} `, "s1"), sp(1)]
				: f.provider === "glyph"
					? [...pill(g, ` ${g.cloud || "·"} `, "s1"), sp(1)]
					: [];
		const left: Seg[] = f.minimal
			? [sp(1), ...pill(g, ` ${g.chip} ${v.model} `, "s2"), sp(2), gauge, percent]
			: [sp(1), ...providerPill, ...pill(g, ` ${g.chip} ${v.model} `, "s2"), sp(1), ...levelPill, sp(2), gauge, ...ctxBar, percent, ...used];
		const right: Seg[] = [];
		const group = (segs: Seg[]) => {
			if (right.length) right.push(sp(2));
			right.push(...segs);
		};
		if (v.sessionRow && f.io) group([[g.up + " ", st("user")], [tokens(v.sessIn), st("fg")], sp(1), [g.down + " ", st("accent")], [tokens(v.sessOut), st("fg")]]);
		if (v.sessionRow && f.io && f.cost && v.cost > 0) group([[g.dollar + " ", st("tool")], [v.cost.toFixed(2), st("fg")]]);
		if (v.sessionRow && f.io && f.spark && v.tps.length >= 3) group([["tps ", st("dim")], ...sparkSegs(v.tps.slice(-f.spark), g.spark, st("s4"))]);
		if (f.branch && v.branch) {
			if (right.length) right.push(sp(2));
			right.push(...pill(g, ` ${g.branch} ${v.branch} `, "s5"), ...(v.dirty > 0 ? ([[` ±${v.dirty} `, bold("warn")]] as Seg[]) : [sp(1)]));
		} else if (right.length) right.push(sp(1));
		return { left, right };
	};
	return [fitFooter(W, build)];
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
