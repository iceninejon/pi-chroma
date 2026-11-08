// One shared 80 ms ticker (guide §8). Runs only while a run is active or a tool is pending.
import type { Motion } from "./styles/types.ts";

export const TICK_MS = 80;

export class Ticker {
	tick = 0;
	private timer: ReturnType<typeof setInterval> | undefined;
	private motion: Motion = "full";
	private runActive = false;
	private readonly pendingTools = new Set<string>();
	private onTick: (() => void) | undefined;

	/** Called once per tick: invalidate the dock, then request a single render. */
	setHandler(fn: (() => void) | undefined): void {
		this.onTick = fn;
	}

	setMotion(m: Motion): void {
		if (this.motion === m) return;
		this.motion = m;
		this.sync(true);
	}

	setRunActive(active: boolean): void {
		this.runActive = active;
		this.sync();
	}

	toolStart(id: string): void {
		this.pendingTools.add(id);
		this.sync();
	}

	toolEnd(id: string): void {
		this.pendingTools.delete(id);
		this.sync();
	}

	get running(): boolean {
		return this.timer !== undefined;
	}

	private want(): boolean {
		return (this.runActive || this.pendingTools.size > 0) && this.motion !== "off";
	}

	private sync(restart = false): void {
		if (restart) this.halt();
		if (this.want()) {
			if (!this.timer) {
				const ms = this.motion === "full" ? TICK_MS : 1000; // reduced: counters update once per second
				this.timer = setInterval(() => {
					this.tick++;
					this.onTick?.();
				}, ms);
				this.timer.unref?.();
			}
		} else {
			this.halt();
		}
	}

	private halt(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	/** Stop everything (session shutdown). */
	dispose(): void {
		this.halt();
		this.runActive = false;
		this.pendingTools.clear();
		this.onTick = undefined;
	}
}
