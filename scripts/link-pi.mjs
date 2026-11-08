// Dev helper: symlink the globally installed pi packages into ./node_modules so that
// tests and `tsc` resolve `@earendil-works/*` exactly like pi's extension loader does.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, symlinkSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const bin = execFileSync("which", ["pi"], { encoding: "utf8" }).trim();
const pkg = resolve(dirname(realpathSync(bin)), "..", "..");
const root = existsSync(join(pkg, "package.json")) ? pkg : resolve(dirname(realpathSync(bin)), "..");
const scope = join(root, "node_modules", "@earendil-works");
const out = join("node_modules", "@earendil-works");
mkdirSync(out, { recursive: true });
const links = { "pi-coding-agent": root };
for (const n of ["pi-tui", "pi-ai", "pi-agent-core"]) links[n] = join(scope, n);
const typebox = join(root, "node_modules", "typebox");
for (const [name, target] of Object.entries(links)) {
  const dest = join(out, name);
  rmSync(dest, { force: true, recursive: true });
  symlinkSync(target, dest, "dir");
  console.log(name, "->", target);
}
if (existsSync(typebox)) {
  rmSync("node_modules/typebox", { force: true, recursive: true });
  symlinkSync(typebox, "node_modules/typebox", "dir");
  console.log("typebox ->", typebox);
}
