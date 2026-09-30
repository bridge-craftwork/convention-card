#!/usr/bin/env python3
"""Build spec/conventions.json and spec/taxonomy.json from spec/conventions/.

spec/conventions/<category>/<name>.toml, one file per convention, is the
source. conventions.json combines every entry; taxonomy.json is lesson-studio's
Contract 4 (taxonomy/v1): the skill vocabulary with a four-band level.

One file per convention is the source (spec/conventions/README.md); readers
that cannot list a directory (the JS library in a browser, lesson-studio) read
the combined file. CI runs this on every push to main that changes the source
and commits the result (.github/workflows/build-conventions.yml).

    python3 scripts/build_conventions.py           # write both files
    python3 scripts/build_conventions.py --check   # exit 1 if either is out of date

Standard library only (Python 3.11+, for tomllib).
"""

import datetime
import json
import pathlib
import sys
import tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "spec" / "conventions"
OUT = ROOT / "spec" / "conventions.json"
TAXONOMY = ROOT / "spec" / "taxonomy.json"
CATEGORIES = SOURCE / "categories.toml"

# DECISIONS.md, 12: the named bands are ranges of the 1-10 level.
BANDS = [(3, "basic"), (6, "intermediate"), (8, "advanced"), (10, "expert")]


def band(level: int) -> str:
    return next(name for top, name in BANDS if level <= top)


def version() -> str:
    cargo = tomllib.loads((ROOT / "Cargo.toml").read_text(encoding="utf-8"))
    return cargo["workspace"]["package"]["version"]


def load() -> dict:
    conventions = {}
    for path in sorted(SOURCE.glob("*/*.toml")):
        entry = tomllib.loads(path.read_text(encoding="utf-8"))
        expected = f"{path.parent.name}/{path.stem}"
        if entry.get("id") != expected:
            sys.exit(f"{path.relative_to(ROOT)}: id is {entry.get('id')!r}, expected {expected!r}")
        if "summary" in entry:
            entry["summary"] = entry["summary"].strip()
        conventions[expected] = entry
    return conventions


def build(conventions: dict) -> str:
    doc = {
        "schema": "conventions/v1",
        "generated_from": "spec/conventions/ (do not edit: see spec/conventions/README.md)",
        "conventions": conventions,
    }
    return json.dumps(doc, ensure_ascii=False, indent=1) + "\n"


def build_taxonomy(conventions: dict) -> str:
    """Contract 4's taxonomy/v1. Entries without a level (practice_deals: content,
    not skills) are left out, and so is any category left with no entries."""
    names = tomllib.loads(CATEGORIES.read_text(encoding="utf-8"))
    paths = [
        {"path": id, "name": e["name"], "category": id.split("/")[0], "level": band(e["level"])}
        for id, e in conventions.items()
        if "level" in e
    ]
    used = {p["category"] for p in paths}
    missing = used - names.keys()
    if missing:
        sys.exit(f"spec/conventions/categories.toml has no name for {sorted(missing)}")
    categories = [{"id": c, "name": names[c]} for c in sorted(used)]
    body = {"schema": "taxonomy/v1", "version": version(), "categories": categories, "paths": paths}
    # `generated` changes only when the content does, so a rebuild with nothing
    # new leaves the file (and CI's commit-back) alone.
    generated = datetime.date.today().isoformat()
    if TAXONOMY.exists():
        old = json.loads(TAXONOMY.read_text(encoding="utf-8"))
        if {k: v for k, v in old.items() if k != "generated"} == body:
            generated = old["generated"]
    doc = {"schema": body["schema"], "version": body["version"], "generated": generated,
           "categories": categories, "paths": paths}
    return json.dumps(doc, ensure_ascii=False, indent=1) + "\n"


def main() -> None:
    conventions = load()
    outputs = {OUT: build(conventions), TAXONOMY: build_taxonomy(conventions)}
    if "--check" in sys.argv[1:]:
        stale = [p.name for p, text in outputs.items()
                 if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            sys.exit(f"out of date: {', '.join(stale)}: run python3 scripts/build_conventions.py")
        return
    for path, text in outputs.items():
        path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
