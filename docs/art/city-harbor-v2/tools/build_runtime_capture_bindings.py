#!/usr/bin/env python3
"""Bind live city captures to the exact shipping consumer sources."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

PACKAGE = Path(__file__).resolve().parents[1]
REPOSITORY = PACKAGE.parents[2]
FULL_SHIPPING_SOURCES = (
    "apps/web/src/CityScene.tsx",
    "apps/web/src/cityArtRegistry.ts",
    "apps/web/src/citySceneLayout.json",
    "packages/content/src/buildings.ts",
    "packages/content/src/factions.ts",
    "apps/web/src/mapSprites.ts",
)
STYLESHEET_PATH = "apps/web/src/styles.css"
STYLESHEET_SCOPE_KIND = "city-scene-selector-token-closure-v1"
SOURCE_HEAD = "c1824f22bf14dca6d38f7519fd99affd789a8130"
PRIOR_CAPTURE_SOURCE_HEAD = "a5a8fd5f8c522ebddfb146510b492bcea1c28ee2"
HISTORICAL_APPROVED_SOURCE_HEAD = "45a206f760eacce50dc8dd1dc656c5d4e789cb3c"
PENDING_STATUS = "captured-pending-direct-operator-approval"
HISTORICAL_APPROVAL = {
    "status": "historical-source-only",
    "sourceHead": HISTORICAL_APPROVED_SOURCE_HEAD,
    "evidenceHead": "dc11b60738f4f14b896532bf2db323b2bd054f5c",
    "record": "https://github.com/jharvieux/AoP/issues/608#issuecomment-5551752263",
    "reusable": False,
}
SUPERSEDED_CAPTURE = {
    "sourceHead": PRIOR_CAPTURE_SOURCE_HEAD,
    "recordHead": "b64ae4c02c3c31342e1fbf70f87b9c07203f86d2",
    "bindingSha256": "73a2cad9a38940a46731d30dedce32a35e1a1baaf2f6001c6688efbeeeb088f1",
    "approval": {"status": "pending-direct-operator-approval", "record": None},
    "reusable": False,
}
GENERIC_SELECTORS = frozenset(
    {
        "button",
        "button:disabled",
        "button:disabled::after",
        "button:focus-visible",
    }
)
CUSTOM_PROPERTY_PATTERN = re.compile(r"(?ms)^[ \t]*(--[-\w]+)[ \t]*:[ \t]*(.*?);")
CUSTOM_PROPERTY_REFERENCE_PATTERN = re.compile(r"var\(\s*(--[-\w]+)")
COMPONENT_PROPERTY_PATTERN = re.compile(r"['\"](--[-\w]+)['\"]\s*:")


@dataclass(frozen=True)
class CssRule:
    wrappers: tuple[str, ...]
    selector: str
    body: str


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _strip_comments(source: str) -> str:
    return re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)


def _normalise(value: str) -> str:
    return " ".join(value.split())


def _block_end(source: str, opening_brace: int) -> int:
    depth = 1
    quote: str | None = None
    escaped = False
    index = opening_brace + 1
    while index < len(source):
        character = source[index]
        if quote:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == quote:
                quote = None
        elif character in {"'", '"'}:
            quote = character
        elif character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    raise AssertionError("unbalanced CSS block")


def _css_rules(source: str, wrappers: tuple[str, ...] = ()) -> Iterator[CssRule]:
    index = 0
    while index < len(source):
        while index < len(source) and source[index].isspace():
            index += 1
        if index >= len(source):
            return

        opening_brace = source.find("{", index)
        terminator = source.find(";", index)
        if terminator >= 0 and (opening_brace < 0 or terminator < opening_brace):
            index = terminator + 1
            continue
        if opening_brace < 0:
            if source[index:].strip():
                raise AssertionError("unparsed CSS content")
            return

        header = _normalise(source[index:opening_brace])
        closing_brace = _block_end(source, opening_brace)
        body = source[opening_brace + 1 : closing_brace]
        if header.startswith(("@media ", "@supports ", "@container ", "@layer ")):
            yield from _css_rules(body, (*wrappers, header))
        elif not header.startswith("@"):
            yield CssRule(wrappers, header, body.strip())
        index = closing_brace + 1


def _custom_properties(body: str) -> dict[str, str]:
    declarations: dict[str, str] = {}
    for match in CUSTOM_PROPERTY_PATTERN.finditer(body):
        name = match.group(1)
        if name in declarations:
            raise AssertionError(f"duplicate custom property declaration: {name}")
        declarations[name] = _normalise(match.group(2))
    return declarations


def _is_scoped_rule(rule: CssRule) -> bool:
    selectors = {_normalise(selector) for selector in rule.selector.split(",")}
    return any(".city-scene" in selector for selector in selectors) or bool(
        selectors & GENERIC_SELECTORS
    )


def build_stylesheet_scope(stylesheet: str, city_scene_source: str) -> dict[str, object]:
    """Return the visual CSS dependency closure for the live CityScene evidence."""

    rules = tuple(_css_rules(_strip_comments(stylesheet)))
    root_rules = [rule for rule in rules if rule.selector == ":root" and not rule.wrappers]
    if len(root_rules) != 1:
        raise AssertionError(f"expected one top-level :root rule, found {len(root_rules)}")
    root_properties = _custom_properties(root_rules[0].body)

    scoped_rules = [rule for rule in rules if _is_scoped_rule(rule)]
    if not scoped_rules:
        raise AssertionError("city stylesheet scope is empty")
    local_properties: dict[str, str] = {}
    for rule in scoped_rules:
        for name, value in _custom_properties(rule.body).items():
            if name in local_properties:
                raise AssertionError(f"duplicate scoped custom property declaration: {name}")
            local_properties[name] = value

    component_properties = set(COMPONENT_PROPERTY_PATTERN.findall(city_scene_source))
    referenced = {
        name
        for rule in scoped_rules
        for name in CUSTOM_PROPERTY_REFERENCE_PATTERN.findall(rule.body)
    }
    resolved_root: set[str] = set()
    resolved_local: set[str] = set()
    resolved_component: set[str] = set()
    resolving: list[str] = []

    def resolve(name: str) -> None:
        if name in resolved_root or name in resolved_local or name in resolved_component:
            return
        if name in resolving:
            cycle = " -> ".join((*resolving[resolving.index(name) :], name))
            raise AssertionError(f"cyclic custom property dependency: {cycle}")
        if name in root_properties:
            source = root_properties
            destination = resolved_root
        elif name in local_properties:
            source = local_properties
            destination = resolved_local
        elif name in component_properties:
            resolved_component.add(name)
            return
        else:
            raise AssertionError(f"unresolved city stylesheet custom property: {name}")

        resolving.append(name)
        for dependency in CUSTOM_PROPERTY_REFERENCE_PATTERN.findall(source[name]):
            resolve(dependency)
        resolving.pop()
        destination.add(name)

    for name in sorted(referenced):
        resolve(name)

    rule_inventory = [
        {"at_rules": list(rule.wrappers), "selector": rule.selector} for rule in scoped_rules
    ]
    root_inventory = [
        {"name": name, "value": root_properties[name]} for name in sorted(resolved_root)
    ]
    local_inventory = [
        {"name": name, "value": local_properties[name]} for name in sorted(resolved_local)
    ]
    component_inventory = sorted(resolved_component)
    projection_lines = [f"scope:{STYLESHEET_SCOPE_KIND}"]
    for rule in scoped_rules:
        projection_lines.append(f"at:{' > '.join(rule.wrappers)}")
        projection_lines.append(f"selector:{rule.selector}")
        projection_lines.append(rule.body)
    for item in root_inventory:
        projection_lines.append(f"root:{item['name']}:{item['value']}")
    for item in local_inventory:
        projection_lines.append(f"local:{item['name']}:{item['value']}")
    for name in component_inventory:
        projection_lines.append(f"component:{name}")
    projection = "\n".join(projection_lines) + "\n"
    return {
        "kind": STYLESHEET_SCOPE_KIND,
        "sha256": sha256_text(projection),
        "rules": rule_inventory,
        "root_custom_properties": root_inventory,
        "local_custom_properties": local_inventory,
        "component_custom_properties": component_inventory,
    }


def build_stylesheet_binding() -> dict[str, object]:
    stylesheet_path = REPOSITORY / STYLESHEET_PATH
    city_scene_path = REPOSITORY / "apps/web/src/CityScene.tsx"
    return {
        "path": STYLESHEET_PATH,
        "diagnostic_full_sha256": sha256(stylesheet_path),
        "scope": build_stylesheet_scope(
            stylesheet_path.read_text(),
            city_scene_path.read_text(),
        ),
    }


def main() -> None:
    from PIL import Image

    assert len(sys.argv) == 5, (
        "usage: build_runtime_capture_bindings.py --proposal /absolute/proposal.json "
        "--inspection-confirmation INTEGRATION_OWNER_INSPECTED_EXACT_CITY_PIXELS"
    )
    assert sys.argv[1] == "--proposal" and sys.argv[3] == "--inspection-confirmation"
    assert sys.argv[4] == "INTEGRATION_OWNER_INSPECTED_EXACT_CITY_PIXELS"
    proposal_path = Path(sys.argv[2])
    assert proposal_path.is_absolute() and proposal_path.resolve() == proposal_path
    proposal = json.loads(proposal_path.read_text())
    assert proposal["schema"] == 1
    assert proposal["kind"] == "unapproved-city-runtime-evidence-proposal"
    assert proposal["sourceHead"] == SOURCE_HEAD
    assert proposal["supersededCaptureHead"] == SOURCE_HEAD
    assert proposal["targetCount"] == 28 and proposal["uniqueBrowserFrames"] == 22
    assert proposal["approval"] == {
        "status": "pending-direct-operator-approval",
        "record": None,
    }
    proposal_captures = {item["path"]: item for item in proposal["captures"]}

    subprocess.run(
        ["git", "merge-base", "--is-ancestor", SOURCE_HEAD, "HEAD"],
        cwd=REPOSITORY,
        check=True,
    )
    for relative in (*FULL_SHIPPING_SOURCES, STYLESHEET_PATH):
        target = subprocess.run(
            ["git", "show", f"{SOURCE_HEAD}:{relative}"],
            cwd=REPOSITORY,
            check=True,
            capture_output=True,
        ).stdout
        assert target == (REPOSITORY / relative).read_bytes(), (
            f"{relative}: worktree differs from target source"
        )

    captures = []
    for path in sorted((PACKAGE / "runtime-captures").glob("*.jpg")):
        with Image.open(path) as image:
            assert image.format == "JPEG" and image.mode == "RGB"
            dimensions = list(image.size)
        repository_path = str(path.relative_to(REPOSITORY))
        proposal_entry = proposal_captures.get(repository_path)
        assert proposal_entry is not None, f"proposal omitted {repository_path}"
        observed = {
            "path": str(path.relative_to(PACKAGE)),
            "dimensions": dimensions,
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        assert proposal_entry["dimensions"] == dimensions
        assert proposal_entry["bytes"] == observed["bytes"]
        assert proposal_entry["sha256"] == observed["sha256"]
        captures.append(observed)

    payload = {
        "schema": 3,
        "date": proposal["capturedOn"],
        "sourceHead": SOURCE_HEAD,
        "captureSourceHead": SOURCE_HEAD,
        "captureStatus": PENDING_STATUS,
        "approval": {
            "status": "pending-direct-operator-approval",
            "evidenceHead": None,
            "record": None,
        },
        "historicalApproval": HISTORICAL_APPROVAL,
        "supersededCapture": SUPERSEDED_CAPTURE,
        "captureOrigin": {
            **proposal["captureOrigin"],
            "sourceHead": SOURCE_HEAD,
            "visualSettleInspection": "completed-by-integration-owner",
            "nativeSizeInspection": "completed-by-integration-owner",
        },
        "shipping_sources": [
            {"path": relative, "sha256": sha256(REPOSITORY / relative)}
            for relative in FULL_SHIPPING_SOURCES
        ],
        "stylesheet_source": build_stylesheet_binding(),
        "captures": captures,
    }
    output = PACKAGE / "RUNTIME-CAPTURE-BINDINGS.json"
    output.write_text(json.dumps(payload, indent=2) + "\n")
    local_formatter = REPOSITORY / "node_modules" / ".bin" / "prettier"
    formatter = (
        str(local_formatter)
        if local_formatter.is_file()
        else shutil.which("prettier")
    )
    assert formatter is not None, "prettier is required to format the runtime binding"
    subprocess.run(
        [formatter, "--write", str(output)],
        cwd=REPOSITORY,
        check=True,
        stdout=subprocess.DEVNULL,
    )

    capture_records = {Path(item["path"]).name: item for item in captures}
    for name in ("README.md", "PRODUCTION-MANIFEST.md", "RUNTIME-CAPTURES.md"):
        record_path = PACKAGE / name
        record = record_path.read_text().replace(
            PRIOR_CAPTURE_SOURCE_HEAD, SOURCE_HEAD
        )
        if name == "RUNTIME-CAPTURES.md":
            pattern = re.compile(
                r"^(\| `runtime-captures/([^`]+\.jpg)`\s+\|.*?\|\s*)([\d,]+)(\s+\|\s+`)([a-f0-9]{64})(`\s+\|)$",
                re.MULTILINE,
            )

            def replace_capture(match: re.Match[str]) -> str:
                capture = capture_records.get(match.group(2))
                assert capture is not None, (
                    f"capture table contains undeclared file: {match.group(2)}"
                )
                return (
                    f"{match.group(1)}{capture['bytes']:,}{match.group(4)}"
                    f"{capture['sha256']}{match.group(6)}"
                )

            record = pattern.sub(replace_capture, record)
            assert all(f"`runtime-captures/{name}`" in record for name in capture_records), (
                "capture table is missing a declared file"
            )
        record_path.write_text(record)
    print(
        f"bound {len(captures)} captures to {len(FULL_SHIPPING_SOURCES)} full sources "
        "and the city stylesheet dependency closure; direct operator approval remains pending"
    )


if __name__ == "__main__":
    main()
