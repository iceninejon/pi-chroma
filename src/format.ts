// Number / time formatting (guide §12.1). Pure: no pi imports.

/** Token counts: `684`, `61.2k`, `200k`, `1.42M`. */
export function tokens(n: number): string {
	if (!Number.isFinite(n) || n < 0) n = 0;
	n = Math.round(n);
	if (n < 1000) return String(n);
	if (n < 1e6) {
		const v = (n / 1000).toFixed(1).replace(/\.0$/, "");
		// 999.96k would round to "1000k": promote to M instead.
		if (v === "1000") return "1.00M";
		return `${v}k`;
	}
	return `${(n / 1e6).toFixed(2)}M`;
}

/** Context percentage (integer, rounded) with `%`. */
export function pct(fraction: number): string {
	return `${Math.round(clamp01(fraction) * 100)}%`;
}

/** Decode TPS: 1 decimal. */
export function tps(v: number): string {
	return v.toFixed(1);
}

/** TTFT: 2 decimals under 10 s, else 1 decimal, with `s`. */
export function ttft(ms: number): string {
	const s = ms / 1000;
	return s < 10 ? `${s.toFixed(2)}s` : `${s.toFixed(1)}s`;
}

/** Elapsed / total: `13.4s`, `1m 04s`, `1h 02m`. */
export function elapsed(ms: number): string {
	const s = Math.max(0, ms) / 1000;
	if (Math.round(s * 10) / 10 < 60) return `${s.toFixed(1)}s`;
	// Round to whole seconds first, so 59.96 → "1m 00s" never prints "60.0s".
	const total = Math.round(s);
	if (total < 3600) {
		const m = Math.floor(total / 60);
		return `${m}m ${String(total % 60).padStart(2, "0")}s`;
	}
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Turn cost: 3 decimals, no currency symbol. */
export function turnCost(usd: number): string {
	return usd.toFixed(3);
}

/** Session cost: 2 decimals, optional `$` prefix. */
export function sessionCost(usd: number, dollar = false): string {
	return `${dollar ? "$" : ""}${usd.toFixed(2)}`;
}

/** Tool durations: `0.3s`, `<0.1s`. */
export function toolDuration(ms: number): string {
	if (ms < 100) return "<0.1s";
	return `${(ms / 1000).toFixed(1)}s`;
}

/** Local 24-hour clock `HH:MM:SS`. */
export function clock(date: Date | number | string): string {
	const d = date instanceof Date ? date : new Date(date);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** `$HOME` → `~`. */
export function tildePath(path: string, home = process.env.HOME): string {
	if (home && (path === home || path.startsWith(home + "/"))) return `~${path.slice(home.length)}`;
	return path;
}

/** Middle-ellipsis a path so it fits in `max` cells; keeps the file name. */
export function middleEllipsis(text: string, max: number): string {
	const chars = Array.from(text);
	if (chars.length <= max) return text;
	if (max <= 1) return "…".slice(0, max);
	const keep = max - 1;
	const tail = Math.ceil(keep * 0.6);
	const head = keep - tail;
	return chars.slice(0, head).join("") + "…" + chars.slice(chars.length - tail).join("");
}

export function clamp01(v: number): number {
	return Math.min(1, Math.max(0, v));
}
