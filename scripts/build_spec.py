#!/usr/bin/env python3
"""Build the format maps' JSON from their TOML sources.

spec/formats/{bbsa,bbo,bridgodex}-map.json and bbo-slots.json: the three
format maps and BBO's slot list as JSON, for readers with no TOML parser (the
JS library). bbsa-map.json also carries BBA's file layout (bbsa-layout.txt) as
`layout`, the key order an export writes.

The conventions, card fields, levels, alert rules and migrations are not
built here: they are bridge-common-conventions', and spec/pack.json is a copy
of its published snapshot (scripts/sync_pack.mjs).

CI runs this on every push to main that changes a source and commits the
result (.github/workflows/build-spec.yml).

    python3 scripts/build_spec.py           # write every generated file
    python3 scripts/build_spec.py --check   # exit 1 if any is out of date

Standard library only (Python 3.11+, for tomllib).
"""

import json
import pathlib
import sys
import tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BBSA_TOML = ROOT / "spec" / "formats" / "bbsa-map.toml"
BBSA_JSON = ROOT / "spec" / "formats" / "bbsa-map.json"
BBSA_LAYOUT = ROOT / "spec" / "formats" / "bbsa-layout.txt"
BBO_TOML = ROOT / "spec" / "formats" / "bbo-map.toml"
BBO_JSON = ROOT / "spec" / "formats" / "bbo-map.json"
BBO_SLOTS_TOML = ROOT / "spec" / "formats" / "bbo-slots.toml"
BBO_SLOTS_JSON = ROOT / "spec" / "formats" / "bbo-slots.json"
BRIDGODEX_TOML = ROOT / "spec" / "formats" / "bridgodex-map.toml"
BRIDGODEX_JSON = ROOT / "spec" / "formats" / "bridgodex-map.json"


def as_json(source: pathlib.Path, schema: str, extra: dict | None = None) -> str:
    """A TOML file as JSON, with its tables and keys in the file's order."""
    data = tomllib.loads(source.read_text(encoding="utf-8"))
    doc = {"schema": schema, "generated_from": f"{source.relative_to(ROOT)} (do not edit)", **(extra or {}), **data}
    return json.dumps(doc, ensure_ascii=False, indent=1) + "\n"


def main() -> None:
    outputs = {
        BBSA_JSON: as_json(BBSA_TOML, "bbsa-map/v1",
                           {"layout": BBSA_LAYOUT.read_text(encoding="utf-8").splitlines()}),
        BBO_JSON: as_json(BBO_TOML, "bbo-map/v1"),
        BBO_SLOTS_JSON: as_json(BBO_SLOTS_TOML, "bbo-slots/v1"),
        BRIDGODEX_JSON: as_json(BRIDGODEX_TOML, "bridgodex-map/v1"),
    }
    if "--check" in sys.argv[1:]:
        stale = [p.name for p, text in outputs.items()
                 if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            sys.exit(f"out of date: {', '.join(stale)}: run python3 scripts/build_spec.py")
        return
    for path, text in outputs.items():
        path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
