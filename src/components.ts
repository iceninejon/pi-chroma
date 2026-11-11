// Dock (status line / warning / plan), footer and startup header components.
import type { Component } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { BLANK, type Row } from "./grid.ts";
import { rt } from "./runtime.ts";

abstract class RowsComponent implements Component {
	protected fallback: Theme | undefined;

	constructor(theme?: Theme) {
		this.fallback = theme;
	}

	protected abstract rows(width: number): Row[];

	render(width: number): string[] {
		try {
			return rt.painter(this.fallback).rows(this.rows(width), width);
		} catch {
			return [];
		}
	}

	invalidate(): void {
		/* nothing cached: rows are rebuilt on every render */
	}
}

/**
 * One widget above the editor so the order is fixed (guide §5.3):
 * row 1 = warning (idle + pressure) | status line (busy) | blank; then the plan block.
 */
export class Dock extends RowsComponent {
	protected rows(width: number): Row[] {
		const impl = rt.impl;
		const env = rt.env(width);
		const out: Row[] = [];
		const cs = rt.contextState();
		if (!rt.run.active && cs.warn && cs.window > 0) out.push(...impl.warning(env, rt.warningView(cs)));
		else if (rt.run.active) out.push(...impl.status(env, rt.statusView()));
		else out.push(BLANK);
		const plan = rt.planView();
		if (plan) out.push(...impl.plan(env, plan));
		return out;
	}
}

export class Footer extends RowsComponent {
	protected rows(width: number): Row[] {
		const rows = rt.impl.footer(rt.env(width), rt.footerView());
		// Padding under the footer keeps clear of a multiplexer's status bar.
		for (let i = 0; i < rt.config.bottomPad; i++) rows.push(BLANK);
		return rows;
	}
}

export class Header extends RowsComponent {
	protected rows(width: number): Row[] {
		return rt.impl.banner(rt.env(width), rt.bannerView());
	}
}
