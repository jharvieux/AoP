#!/usr/bin/env python3
"""Bind live city captures to the exact shipping consumer sources."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date
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

    captures = []
    for path in sorted((PACKAGE / "runtime-captures").glob("*.jpg")):
        with Image.open(path) as image:
            assert image.format == "JPEG" and image.mode == "RGB"
            dimensions = list(image.size)
        captures.append(
            {
                "path": str(path.relative_to(PACKAGE)),
                "dimensions": dimensions,
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
        )

    payload = {
        "schema": 2,
        "date": date.today().isoformat(),
        "shipping_sources": [
            {"path": relative, "sha256": sha256(REPOSITORY / relative)}
            for relative in FULL_SHIPPING_SOURCES
        ],
        "stylesheet_source": build_stylesheet_binding(),
        "captures": captures,
    }
    output = PACKAGE / "RUNTIME-CAPTURE-BINDINGS.json"
    output.write_text(json.dumps(payload, indent=2) + "\n")
    print(
        f"bound {len(captures)} captures to {len(FULL_SHIPPING_SOURCES)} full sources "
        "and the city stylesheet dependency closure"
    )


if __name__ == "__main__":
    main()
