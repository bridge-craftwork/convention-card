#!/usr/bin/env python3
"""Build spec/conventions.json from spec/conventions/<category>/<name>.toml.

One file per convention is the source (spec/conventions/README.md); readers
that cannot list a directory (the JS library in a browser, lesson-studio) read
the combined file. CI runs this on every push to main that changes the source
and commits the result (.github/workflows/build-conventions.yml).

    python3 scripts/build_conventions.py           # write spec/conventions.json
    python3 scripts/build_conventions.py --check   # exit 1 if it is out of date

Standard library only (Python 3.11+, for tomllib).
"""

import json
import pathlib
import sys
import tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "spec" / "conventions"
OUT = ROOT / "spec" / "conventions.json"


def build() -> str:
    conventions = {}
    for path in sorted(SOURCE.glob("*/*.toml")):
        entry = tomllib.loads(path.read_text(encoding="utf-8"))
        expected = f"{path.parent.name}/{path.stem}"
        if entry.get("id") != expected:
            sys.exit(f"{path.relative_to(ROOT)}: id is {entry.get('id')!r}, expected {expected!r}")
        if "summary" in entry:
            entry["summary"] = entry["summary"].strip()
        conventions[expected] = entry
    doc = {
        "schema": "conventions/v1",
        "generated_from": "spec/conventions/ (do not edit: see spec/conventions/README.md)",
        "conventions": conventions,
    }
    return json.dumps(doc, ensure_ascii=False, indent=1) + "\n"


def main() -> None:
    text = build()
    if "--check" in sys.argv[1:]:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            sys.exit("spec/conventions.json is out of date: run python3 scripts/build_conventions.py")
        return
    OUT.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
