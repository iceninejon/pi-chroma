// Header lines for built-in user / assistant messages (guide §2.1 fallbacks, Tier B).
// pi draws these blocks itself; we can only prepend a Markdown line, so these are single styled lines.
import type { Glyphs } from "./glyphs.ts";
import type { Seg } from "./grid.ts";
import { bold, seg, st } from "./styles/common.ts";
import type { StyleName } from "./palettes.ts";

export function labelSegs(style: StyleName, g: Glyphs, who: "user" | "assistant", model?: string, time?: string): Seg[] {
	const tail: Seg[] = [];
	if (who === "assistant" && model) tail.push([`  ${model}`, st("dim")]);
	if (time) tail.push([`  ${time}`, st("dim")]);
	if (style === "circuit") {
		return who === "user"
			? [...seg(g, ` ${g.user} YOU `, "user"), ...tail]
			: [...seg(g, ` ${g.bot} PI `, "resp"), ...tail];
	}
	return who === "user"
		? [[`${g.user} you`, bold("user")], ...tail]
		: [[`${g.bot} pi`, bold("resp")], ...tail];
}

/** Rail: turn the user's Markdown into a blockquote so `mdQuoteBorder` draws the rail (§2.1). */
export function blockquote(markdown: string): string {
	return markdown
		.split("\n")
		.map((l) => (l.length ? `> ${l}` : ">"))
		.join("\n");
}
