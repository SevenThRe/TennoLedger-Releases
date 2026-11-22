#!/usr/bin/env python3
"""Hard Architectural Boundary and Static Discipline Checker.

Enforces:
1. Pure model boundary: desktop/src/*Model.ts / *model.ts must not import react,
   react-dom, @tauri-apps/*, or call window., document., localStorage.
2. Production Rust proxy discipline: no .no_proxy() in desktop/src-tauri/src/
   outside #[cfg(test)] blocks.
3. No silent lint/type suppression: no @ts-ignore, @ts-nocheck, #[allow(clippy::all)],
   or bare # noqa without explicit rule codes.
4. No raw credential leakage in serialized diagnostics: helper_inventory.rs,
   market_presence.rs, account_scope.rs structs deriving Serialize must not expose
   nonce, token, password, or secret fields.
5. Skill hygiene: every .agents/skills/*/SKILL.md must have valid YAML frontmatter
   (name: and description:) and stay under 24,000 bytes.
"""

from __future__ import annotations

import argparse
import io
import pathlib
import re
import sys
import tokenize
from typing import List, NamedTuple


class Violation(NamedTuple):
    file_path: str
    line_number: int
    rule_id: str
    message: str
    fix: str

    def format(self) -> str:
        return (
            f"{self.file_path}:{self.line_number}: [{self.rule_id}] {self.message}\n"
            f"  HOW TO FIX ROOT CAUSE: {self.fix}"
        )


RE_MODEL_FILE = re.compile(r"^.*[Mm]odel\.ts$")
RE_FORBIDDEN_MODEL_IMPORT = re.compile(
    r"""\b(?:from|import)\s+['"](?:react|react-dom|@tauri-apps)(?:/[^'"]*)?['"]"""
)
RE_FORBIDDEN_MODEL_BROWSER = re.compile(r"""\b(?:window\.|document\.|localStorage\.)""")

RE_TS_SUPPRESS = re.compile(r"""@ts-(?:ignore|nocheck)""")
RE_CLIPPY_ALL_SUPPRESS = re.compile(r"""#\[allow\(clippy::all\)\]""")
RE_BARE_NOQA = re.compile(r"""#\s*noqa(?!\s*:\s*[A-Za-z0-9]+)""")

FORBIDDEN_CREDENTIAL_FIELDS = {"nonce", "token", "password", "secret"}


def check_pure_model_boundaries(root: pathlib.Path) -> List[Violation]:
    violations: List[Violation] = []
    src_dir = root / "desktop" / "src"
    if not src_dir.is_dir():
        return violations

    for p in src_dir.glob("*.ts"):
        if not RE_MODEL_FILE.match(p.name):
            continue
        try:
            content = p.read_text(encoding="utf-8")
        except OSError:
            continue

        for idx, line in enumerate(content.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
                continue
            if RE_FORBIDDEN_MODEL_IMPORT.search(line):
                violations.append(
                    Violation(
                        file_path=str(p.as_posix()),
                        line_number=idx,
                        rule_id="ARCH001_PURE_MODEL_BOUNDARY",
                        message=f"Forbidden framework import in pure model: {stripped}",
                        fix="Move UI/framework dependencies (React, Tauri) out of pure domain model modules into components, hooks, or service layers.",
                    )
                )
            if RE_FORBIDDEN_MODEL_BROWSER.search(line):
                violations.append(
                    Violation(
                        file_path=str(p.as_posix()),
                        line_number=idx,
                        rule_id="ARCH001_PURE_MODEL_BOUNDARY",
                        message=f"Forbidden browser global in pure model: {stripped}",
                        fix="Move browser globals (window, document, localStorage) out of pure domain model modules into UI hooks or services.",
                    )
                )

    return violations


def check_rust_no_proxy(root: pathlib.Path) -> List[Violation]:
    violations: List[Violation] = []
    rust_dir = root / "desktop" / "src-tauri" / "src"
    if not rust_dir.is_dir():
        return violations

    for p in rust_dir.rglob("*.rs"):
        if "target" in p.parts:
            continue
        try:
            content = p.read_text(encoding="utf-8")
        except OSError:
            continue

        lines = content.splitlines()
        in_test_module = False
        pending_test_attr = False
        test_brace_depth = 0
        current_brace_depth = 0

        for idx, line in enumerate(lines, 1):
            trimmed = line.strip()

            open_braces = line.count("{")
            close_braces = line.count("}")

            if "#[cfg(test)]" in line:
                pending_test_attr = True

            line_is_test = in_test_module

            if pending_test_attr:
                if open_braces > 0:
                    in_test_module = True
                    test_brace_depth = current_brace_depth
                    pending_test_attr = False
                    line_is_test = True
                elif trimmed.endswith(";") or (";" in trimmed and open_braces == 0):
                    pending_test_attr = False

            current_brace_depth += open_braces - close_braces

            if in_test_module and current_brace_depth <= test_brace_depth and (close_braces > 0 or open_braces > 0):
                if current_brace_depth <= test_brace_depth:
                    in_test_module = False

            if ".no_proxy()" in line:
                if not line_is_test:
                    violations.append(
                        Violation(
                            file_path=str(p.as_posix()),
                            line_number=idx,
                            rule_id="ARCH002_NO_PROXY_IN_PRODUCTION",
                            message=f"Production Rust HTTP client calls .no_proxy(): {trimmed}",
                            fix="Remove .no_proxy() from production HTTP client builder so requests respect Windows system proxy; restrict .no_proxy() exclusively to #[cfg(test)].",
                        )
                    )

    return violations


def check_lint_suppressions(root: pathlib.Path) -> List[Violation]:
    violations: List[Violation] = []

    # 1. Desktop frontend files (desktop/src)
    desktop_src = root / "desktop" / "src"
    if desktop_src.is_dir():
        for ext in ("*.ts", "*.tsx"):
            for p in desktop_src.rglob(ext):
                if "node_modules" in p.parts or "dist" in p.parts:
                    continue
                try:
                    content = p.read_text(encoding="utf-8")
                except OSError:
                    continue
                for idx, line in enumerate(content.splitlines(), 1):
                    if RE_TS_SUPPRESS.search(line):
                        violations.append(
                            Violation(
                                file_path=str(p.as_posix()),
                                line_number=idx,
                                rule_id="ARCH003_NO_SILENT_LINT_SUPPRESSION",
                                message=f"Forbidden TypeScript suppression directive: {line.strip()}",
                                fix="Fix the underlying TypeScript error directly; do not hide type errors behind @ts-ignore or @ts-nocheck.",
                            )
                        )

    # 2. Rust files (desktop/src-tauri/src)
    rust_src = root / "desktop" / "src-tauri" / "src"
    if rust_src.is_dir():
        for p in rust_src.rglob("*.rs"):
            if "target" in p.parts:
                continue
            try:
                content = p.read_text(encoding="utf-8")
            except OSError:
                continue
            for idx, line in enumerate(content.splitlines(), 1):
                if RE_CLIPPY_ALL_SUPPRESS.search(line):
                    violations.append(
                        Violation(
                            file_path=str(p.as_posix()),
                            line_number=idx,
                            rule_id="ARCH003_NO_SILENT_LINT_SUPPRESSION",
                            message=f"Forbidden Clippy blanket suppression: {line.strip()}",
                            fix="Fix the Clippy warning or allow only the specific lint rule ID (e.g. #[allow(clippy::too_many_arguments)]); never blanket suppress clippy::all.",
                        )
                    )

    # 3. Python files (collector and tools)
    for py_dir in (root / "collector", root / "tools"):
        if not py_dir.is_dir():
            continue
        for p in py_dir.rglob("*.py"):
            if ".venv" in p.parts or "__pycache__" in p.parts:
                continue
            # Skip checking the boundary checkers themselves for comments
            if p.name in ("check_boundaries.py", "test_check_boundaries.py"):
                continue
            try:
                content = p.read_text(encoding="utf-8")
            except OSError:
                continue

            try:
                tokens = list(tokenize.generate_tokens(io.StringIO(content).readline))
            except tokenize.TokenError:
                continue

            for tok in tokens:
                if tok.type == tokenize.COMMENT:
                    if RE_BARE_NOQA.search(tok.string):
                        violations.append(
                            Violation(
                                file_path=str(p.as_posix()),
                                line_number=tok.start[0],
                                rule_id="ARCH003_NO_SILENT_LINT_SUPPRESSION",
                                message=f"Bare # noqa comment without specific rule codes: {tok.string.strip()}",
                                fix="Specify explicit rule codes on noqa comments (e.g. '# noqa: F401' or '# noqa: E501') instead of bare '# noqa'.",
                            )
                        )

    return violations


def check_credential_leakage(root: pathlib.Path) -> List[Violation]:
    violations: List[Violation] = []
    target_files = [
        root / "desktop" / "src-tauri" / "src" / "helper_inventory.rs",
        root / "desktop" / "src-tauri" / "src" / "market_presence.rs",
        root / "desktop" / "src-tauri" / "src" / "account_scope.rs",
    ]

    for p in target_files:
        if not p.is_file():
            continue
        try:
            content = p.read_text(encoding="utf-8")
        except OSError:
            continue

        lines = content.splitlines()
        in_serialize_derive = False
        in_struct = False
        struct_name = ""

        for idx, line in enumerate(lines, 1):
            trimmed = line.strip()

            if "#[derive(" in trimmed and "Serialize" in trimmed:
                in_serialize_derive = True
                continue

            if in_serialize_derive:
                if trimmed.startswith("#"):
                    continue
                m_struct = re.search(r"\bstruct\s+([A-Za-z0-9_]+)", trimmed)
                if m_struct:
                    struct_name = m_struct.group(1)
                    in_struct = True
                    in_serialize_derive = False
                elif trimmed.startswith("enum ") or trimmed.startswith("pub enum "):
                    in_serialize_derive = False
                    continue

            if in_struct:
                tokens = re.split(r"[,;]", trimmed)
                for token in tokens:
                    field_match = re.search(r"(?:pub\s+)?([A-Za-z0-9_]+)\s*:", token)
                    if field_match:
                        field_name = field_match.group(1).lower()
                        for cred_token in FORBIDDEN_CREDENTIAL_FIELDS:
                            if cred_token in field_name:
                                violations.append(
                                    Violation(
                                        file_path=str(p.as_posix()),
                                        line_number=idx,
                                        rule_id="ARCH004_NO_RAW_CREDENTIAL_SERIALIZATION",
                                        message=f"Struct '{struct_name}' deriving Serialize exposes credential field '{field_match.group(1)}'",
                                        fix=f"Remove raw credential field '{field_match.group(1)}' from serialized view/diagnostic struct '{struct_name}', or annotate it with #[serde(skip)].",
                                    )
                                )

                if "}" in trimmed:
                    in_struct = False
                    struct_name = ""

    return violations


def check_skill_hygiene(root: pathlib.Path) -> List[Violation]:
    violations: List[Violation] = []
    skills_dir = root / ".agents" / "skills"
    if not skills_dir.is_dir():
        return violations

    for skill_file in skills_dir.glob("*/SKILL.md"):
        try:
            raw_bytes = skill_file.read_bytes()
        except OSError:
            continue

        if len(raw_bytes) > 24000:
            violations.append(
                Violation(
                    file_path=str(skill_file.as_posix()),
                    line_number=1,
                    rule_id="ARCH005_SKILL_HYGIENE",
                    message=f"Skill file size ({len(raw_bytes)} bytes) exceeds maximum limit of 24,000 bytes",
                    fix="Condense the skill documentation or extract reference materials to separate reference files to stay under 24,000 bytes.",
                )
            )

        try:
            text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            violations.append(
                Violation(
                    file_path=str(skill_file.as_posix()),
                    line_number=1,
                    rule_id="ARCH005_SKILL_HYGIENE",
                    message="Skill file is not valid UTF-8 text",
                    fix="Save the SKILL.md file with UTF-8 encoding.",
                )
            )
            continue

        lines = text.splitlines()
        if not lines or lines[0].strip() != "---":
            violations.append(
                Violation(
                    file_path=str(skill_file.as_posix()),
                    line_number=1,
                    rule_id="ARCH005_SKILL_HYGIENE",
                    message="SKILL.md must begin with YAML frontmatter delimiter '---'",
                    fix="Add '---' frontmatter at line 1 containing 'name:' and 'description:'.",
                )
            )
            continue

        closing_idx = -1
        has_name = False
        has_desc = False

        for idx, line in enumerate(lines[1:], 2):
            trimmed = line.strip()
            if trimmed == "---":
                closing_idx = idx
                break
            if trimmed.startswith("name:"):
                has_name = True
            elif trimmed.startswith("description:"):
                has_desc = True

        if closing_idx == -1:
            violations.append(
                Violation(
                    file_path=str(skill_file.as_posix()),
                    line_number=1,
                    rule_id="ARCH005_SKILL_HYGIENE",
                    message="Unterminated YAML frontmatter in SKILL.md (missing closing '---')",
                    fix="Close the YAML frontmatter block with '---'.",
                )
            )
        else:
            if not has_name:
                violations.append(
                    Violation(
                        file_path=str(skill_file.as_posix()),
                        line_number=1,
                        rule_id="ARCH005_SKILL_HYGIENE",
                        message="Missing required 'name:' key in YAML frontmatter",
                        fix="Add 'name: <skill-name>' to the frontmatter.",
                    )
                )
            if not has_desc:
                violations.append(
                    Violation(
                        file_path=str(skill_file.as_posix()),
                        line_number=1,
                        rule_id="ARCH005_SKILL_HYGIENE",
                        message="Missing required 'description:' key in YAML frontmatter",
                        fix="Add 'description: <summary>' to the frontmatter.",
                    )
                )

    return violations


def run_all_checks(root: pathlib.Path) -> List[Violation]:
    all_violations: List[Violation] = []
    all_violations.extend(check_pure_model_boundaries(root))
    all_violations.extend(check_rust_no_proxy(root))
    all_violations.extend(check_lint_suppressions(root))
    all_violations.extend(check_credential_leakage(root))
    all_violations.extend(check_skill_hygiene(root))
    return all_violations


def main() -> int:
    parser = argparse.ArgumentParser(description="Check architectural boundaries and static discipline")
    parser.add_argument("root", nargs="?", default=".", help="Root directory of repository (default: .)")
    args = parser.parse_args()

    root_path = pathlib.Path(args.root).resolve()
    violations = run_all_checks(root_path)

    if violations:
        print(f"\n[BOUNDARY VIOLATIONS FOUND: {len(violations)}]\n", file=sys.stderr)
        for v in violations:
            print(v.format(), file=sys.stderr)
            print("", file=sys.stderr)
        return 1

    print("OK: All architectural boundaries and static rules passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
