#!/usr/bin/env python3
"""Dev tool: drive pi's TUI in a pty and dump the emulated screen (needs `pip install pyte pexpect`).

  tui-harness.py --cols 100 --rows 54 [--env K=V ...] [--pi-args "..."] step [step ...]

steps:  wait:SECONDS | cpu:SECONDS | type:TEXT | key:enter|esc|ctrl-c|ctrl-o|ctrl-t | dump[:rows_from-rows_to] | dumpansi:ROW
"""
import argparse, os, sys, time
import pexpect, pyte

p = argparse.ArgumentParser()
p.add_argument("--cols", type=int, default=100)
p.add_argument("--rows", type=int, default=54)
p.add_argument("--env", action="append", default=[])
p.add_argument("--cwd", default="/tmp/chroma-run")
p.add_argument("--pi-args", default="")
p.add_argument("--keep-session", action="store_true", help="persist the session (in the isolated agent dir) instead of --no-session")
p.add_argument("steps", nargs="*")
a = p.parse_args()

env = dict(os.environ, TERM="xterm-256color", COLORTERM="truecolor", LANG="C.UTF-8", PI_CHROMA_CONFIG="/tmp/chroma-run/pi-chroma.test.json", PI_CODING_AGENT_DIR=os.environ.get("CHROMA_AGENT_DIR", "/tmp/chroma-agent"))
for kv in a.env:
    k, v = kv.split("=", 1); env[k] = v
os.makedirs(a.cwd, exist_ok=True)
ext = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "extension.ts")
themes = os.path.abspath(os.path.join(os.path.dirname(ext), "..", "themes"))
cmd = f"pi --no-extensions -e {os.path.expanduser("~/.pi/agent/extensions/bifrost-models.ts")} -e {os.path.abspath(ext)} --theme {themes} --no-skills --no-context-files {"" if a.keep_session else "--no-session"} --offline {a.pi_args}"
child = pexpect.spawn("/bin/bash", ["-c", cmd], env=env, cwd=a.cwd, dimensions=(a.rows, a.cols), encoding="utf-8", codec_errors="replace")
screen = pyte.Screen(a.cols, a.rows)
stream = pyte.Stream(screen)

def pump(seconds):
    end = time.time() + seconds
    while time.time() < end:
        try:
            data = child.read_nonblocking(65536, timeout=0.05)
            # answer terminal queries the way a real terminal would (DA1 / OSC 10/11 colour reports)
            if "\x1b[c" in data or "\x1b[0c" in data: child.send("\x1b[?62;4c")
            stream.feed(data)
        except pexpect.TIMEOUT:
            pass
        except pexpect.EOF:
            return False
    return True

KEYS = {"enter": "\r", "esc": "\x1b", "ctrl-c": "\x03", "ctrl-o": "\x0f", "ctrl-t": "\x14", "ctrl-d": "\x04", "tab": "\t"}
def dump(rng=None):
    lo, hi = (0, a.rows - 1)
    if rng: lo, hi = map(int, rng.split("-"))
    for i in range(lo, hi + 1):
        print(f"{i:2d} │{screen.display[i].rstrip()}")
    print("-" * 20)

pump(3)
for s in a.steps:
    k, _, v = s.partition(":")
    if k == "wait": pump(float(v))
    elif k == "type": child.send(v); pump(0.3)
    elif k == "key": child.send(KEYS[v]); pump(0.3)
    elif k == "cpu":
        def ticks():
            f = open(f"/proc/{child.pid}/stat").read().rsplit(")", 1)[1].split()
            return int(f[11]) + int(f[12])
        t0 = ticks(); pump(float(v)); t1 = ticks()
        print(f"cpu: {(t1 - t0) / os.sysconf('SC_CLK_TCK') / float(v) * 100:.1f}% over {v}s (idle check)")
    elif k == "dump": dump(v or None)
    elif k == "dumpansi":
        row = int(v)
        print("".join(f"[{c.fg}/{c.bg}{'/b' if c.bold else ''}]{c.data}" if i == 0 or c != screen.buffer[row][i-1] else c.data for i, c in enumerate([screen.buffer[row][x] for x in range(a.cols)])))
child.close(force=True)
