// Extracts the redline frames from the implementation guide into test/golden/redlines.json
// (text only, ANSI-free, trailing spaces trimmed). Run once; the guide folder is not in git.
import { readFileSync, writeFileSync } from "node:fs";

const md = readFileSync(process.argv[2] ?? "guide/pi-chroma-implementation-guide.md", "utf8");
const out = {};
let style = null;
let heading = null;
const lines = md.split("\n");
for (let i = 0; i < lines.length; i++) {
	const l = lines[i];
	let m;
	if ((m = l.match(/^## \d+\. Redlines — (\w+)/))) style = m[1].toLowerCase();
	else if ((m = l.match(/^### \d+\.\d+ (.*)/))) heading = m[1];
	if (l.startsWith("```text") && style && heading) {
		const rows = {};
		for (i++; !lines[i].startsWith("```"); i++) {
			const r = lines[i].match(/^\s*(\d+) │(.*)$/);
			if (r) rows[Number(r[1])] = r[2].replace(/\s+$/, "");
		}
		const key = /Thinking/.test(heading) ? "thinking" : /Tool calls/.test(heading) ? "tools" : /Done/.test(heading) ? "done" : /pressure/.test(heading) ? "pressure" : null;
		if (key) (out[style] ??= {})[key] = rows;
	}
}
writeFileSync("test/golden/redlines.json", JSON.stringify(out, null, 1));
console.log(Object.entries(out).map(([s, v]) => `${s}: ${Object.keys(v).join(",")}`).join("\n"));
