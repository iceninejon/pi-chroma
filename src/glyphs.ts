// Glyph sets (guide §6). Pure: no pi imports.
import type { StyleName } from "./palettes.ts";

export type GlyphSetName = "nerd" | "unicode" | "ascii";

export interface Glyphs {
	user: string; bot: string; brain: string;
	file: string; term: string; pencil: string; tool: string;
	check: string; cross: string;
	clock: string; timer: string; bolt: string; up: string; down: string; db: string; dollar: string;
	cloud: string; chip: string; gauge: string; branch: string; folder: string;
	tasks: string; box: string; boxDoing: string; boxDone: string;
	warn: string; chev: string; enter: string;
	plR: string; plL: string; rndL: string; rndR: string;
	/** Whether pills / segments are drawn with cap glyphs (nerd) or plain fills (unicode) or brackets (ascii). */
	caps: "nerd" | "plain" | "brackets";
	spinner: Record<StyleName, string[]>;
	/** Sparkline characters, low → high. */
	spark: string;
	railSpark: string;
}

const cp = (n: number) => String.fromCodePoint(n);

const SPIN_BRAILLE = {
	prism: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
	rail: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"],
};

export const NERD: Glyphs = {
	user: cp(0xf0004), bot: cp(0xf06a9), brain: cp(0xf09d1),
	file: cp(0xf0219), term: cp(0xf489), pencil: cp(0xf040), tool: cp(0xf0ad),
	check: cp(0xf00c), cross: cp(0xf00d),
	clock: cp(0xf017), timer: cp(0xf051b), bolt: cp(0xf0e7), up: cp(0xf062), down: cp(0xf063), db: cp(0xf1c0), dollar: cp(0xf155),
	cloud: cp(0xf0c2), chip: cp(0xf061a), gauge: cp(0xf0e4), branch: cp(0xe725), folder: cp(0xf07c),
	tasks: cp(0xf0ae), box: cp(0xf096), boxDoing: cp(0xf192), boxDone: cp(0xf046),
	warn: cp(0xf071), chev: cp(0xf054), enter: cp(0xf0311),
	plR: cp(0xe0b0), plL: cp(0xe0b2), rndL: cp(0xe0b6), rndR: cp(0xe0b4),
	caps: "nerd",
	spinner: { ...SPIN_BRAILLE, circuit: Array.from({ length: 8 }, (_, i) => cp(0xf0a9e + i)) },
	spark: "▁▂▃▄▅▆▇█",
	railSpark: "⡀⣀⣄⣤⣦⣶⣷⣿",
};

export const UNICODE: Glyphs = {
	user: "●", bot: "◆", brain: "◌",
	file: "≡", term: "$", pencil: "✎", tool: "⚙",
	check: "✓", cross: "✗",
	clock: "◷", timer: "⧗", bolt: "↯", up: "↑", down: "↓", db: "◫", dollar: "$",
	cloud: "☁", chip: "▣", gauge: "◔", branch: "⎇", folder: "▸",
	tasks: "☰", box: "☐", boxDoing: "◉", boxDone: "☑",
	warn: "⚠", chev: "›", enter: "↵",
	plR: "", plL: "", rndL: "", rndR: "",
	caps: "plain",
	spinner: { ...SPIN_BRAILLE, circuit: SPIN_BRAILLE.prism },
	spark: "▁▂▃▄▅▆▇█",
	railSpark: "▁▂▃▄▅▆▇█",
};

export const ASCII: Glyphs = {
	user: ">", bot: "*", brain: "~",
	file: "f", term: "$", pencil: "e", tool: "t",
	check: "ok", cross: "x",
	clock: "t", timer: "ttft", bolt: "tps", up: "in", down: "out", db: "cache", dollar: "$",
	cloud: "", chip: "", gauge: "", branch: "", folder: "",
	tasks: "=", box: "[ ]", boxDoing: "[>]", boxDone: "[x]",
	warn: "!", chev: ">", enter: "enter",
	plR: "", plL: "", rndL: "[", rndR: "]",
	caps: "brackets",
	spinner: { prism: ["-", "\\", "|", "/"], circuit: ["-", "\\", "|", "/"], rail: ["-", "\\", "|", "/"] },
	spark: "_.-~=+*#",
	railSpark: "_.-~=+*#",
};

export function glyphSet(name: GlyphSetName): Glyphs {
	return name === "unicode" ? UNICODE : name === "ascii" ? ASCII : NERD;
}
