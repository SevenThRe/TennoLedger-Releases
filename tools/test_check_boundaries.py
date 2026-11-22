"""Unit tests for hard architectural boundary and static discipline checker.

Proves that each rule (ARCH001 through ARCH005) catches synthetic violations,
returns non-zero exit codes, and prints 'HOW TO FIX ROOT CAUSE:'.
"""

import pathlib
import subprocess
import sys
import tempfile
import unittest

from tools.check_boundaries import (
    check_credential_leakage,
    check_lint_suppressions,
    check_pure_model_boundaries,
    check_rust_no_proxy,
    check_skill_hygiene,
)


class TestCheckBoundaries(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_pure_model_boundary_catches_react_and_tauri_imports(self) -> None:
        model_dir = self.root / "desktop" / "src"
        model_dir.mkdir(parents=True)
        bad_model = model_dir / "userProfileModel.ts"
        bad_model.write_text(
            "import React from 'react';\n"
            "import { invoke } from '@tauri-apps/api/core';\n"
            "export interface Profile { id: string; }\n",
            encoding="utf-8",
        )

        violations = check_pure_model_boundaries(self.root)
        self.assertGreaterEqual(len(violations), 2)
        for v in violations:
            self.assertEqual(v.rule_id, "ARCH001_PURE_MODEL_BOUNDARY")
            self.assertIn("HOW TO FIX ROOT CAUSE:", v.format())

    def test_pure_model_boundary_catches_browser_globals(self) -> None:
        model_dir = self.root / "desktop" / "src"
        model_dir.mkdir(parents=True)
        bad_model = model_dir / "authModel.ts"
        bad_model.write_text(
            "export function getToken(): string | null {\n"
            "    return localStorage.getItem('token');\n"
            "}\n",
            encoding="utf-8",
        )

        violations = check_pure_model_boundaries(self.root)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0].rule_id, "ARCH001_PURE_MODEL_BOUNDARY")
        self.assertIn("localStorage.", violations[0].message)
        self.assertIn("HOW TO FIX ROOT CAUSE:", violations[0].format())

    def test_rust_no_proxy_catches_production_call(self) -> None:
        rust_dir = self.root / "desktop" / "src-tauri" / "src"
        rust_dir.mkdir(parents=True)
        client_rs = rust_dir / "network.rs"
        client_rs.write_text(
            "pub fn build_client() -> reqwest::blocking::Client {\n"
            "    reqwest::blocking::Client::builder().no_proxy().build().unwrap()\n"
            "}\n",
            encoding="utf-8",
        )

        violations = check_rust_no_proxy(self.root)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0].rule_id, "ARCH002_NO_PROXY_IN_PRODUCTION")
        self.assertIn("HOW TO FIX ROOT CAUSE:", violations[0].format())

    def test_rust_no_proxy_allows_test_call(self) -> None:
        rust_dir = self.root / "desktop" / "src-tauri" / "src"
        rust_dir.mkdir(parents=True)
        client_rs = rust_dir / "network.rs"
        client_rs.write_text(
            "#[cfg(test)]\n"
            "mod tests {\n"
            "    #[test]\n"
            "    fn test_client() {\n"
            "        let _ = reqwest::blocking::Client::builder().no_proxy().build();\n"
            "    }\n"
            "}\n",
            encoding="utf-8",
        )

        violations = check_rust_no_proxy(self.root)
        self.assertEqual(len(violations), 0)

    def test_rust_no_proxy_catches_prod_after_cfg_test_mod_declaration(self) -> None:
        rust_dir = self.root / "desktop" / "src-tauri" / "src"
        rust_dir.mkdir(parents=True)
        mod_rs = rust_dir / "lib.rs"
        mod_rs.write_text(
            "#[cfg(test)] mod foo;\n"
            "fn prod() {\n"
            "    let client = reqwest::blocking::Client::builder().no_proxy();\n"
            "}\n",
            encoding="utf-8",
        )

        violations = check_rust_no_proxy(self.root)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0].rule_id, "ARCH002_NO_PROXY_IN_PRODUCTION")
        self.assertIn("HOW TO FIX ROOT CAUSE:", violations[0].format())

    def test_lint_suppression_catches_ts_directives(self) -> None:
        src_dir = self.root / "desktop" / "src"
        src_dir.mkdir(parents=True)
        bad_ts = src_dir / "component.tsx"
        bad_ts.write_text(
            "// @ts-ignore\n"
            "const x: number = 'string';\n"
            "// @ts-nocheck\n",
            encoding="utf-8",
        )

        violations = check_lint_suppressions(self.root)
        self.assertEqual(len(violations), 2)
        for v in violations:
            self.assertEqual(v.rule_id, "ARCH003_NO_SILENT_LINT_SUPPRESSION")
            self.assertIn("HOW TO FIX ROOT CAUSE:", v.format())

    def test_lint_suppression_catches_clippy_all(self) -> None:
        rust_dir = self.root / "desktop" / "src-tauri" / "src"
        rust_dir.mkdir(parents=True)
        bad_rs = rust_dir / "lib.rs"
        bad_rs.write_text(
            "#[allow(clippy::all)]\n"
            "pub fn unsafe_code() {}\n",
            encoding="utf-8",
        )

        violations = check_lint_suppressions(self.root)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0].rule_id, "ARCH003_NO_SILENT_LINT_SUPPRESSION")
        self.assertIn("HOW TO FIX ROOT CAUSE:", violations[0].format())

    def test_lint_suppression_catches_bare_noqa(self) -> None:
        tools_dir = self.root / "tools"
        tools_dir.mkdir(parents=True)
        bad_py = tools_dir / "script.py"
        bad_py.write_text(
            "import os  # noqa\n"
            "import sys  # noqa: F401\n",
            encoding="utf-8",
        )

        violations = check_lint_suppressions(self.root)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0].rule_id, "ARCH003_NO_SILENT_LINT_SUPPRESSION")
        self.assertIn("Bare # noqa", violations[0].message)
        self.assertIn("HOW TO FIX ROOT CAUSE:", violations[0].format())

    def test_credential_leakage_catches_secret_field(self) -> None:
        rust_dir = self.root / "desktop" / "src-tauri" / "src"
        rust_dir.mkdir(parents=True)
        presence_rs = rust_dir / "market_presence.rs"
        presence_rs.write_text(
            "#[derive(Clone, Default, Serialize)]\n"
            "pub struct PresenceView {\n"
            "    pub account_id: String,\n"
            "    pub token: String,\n"
            "}\n",
            encoding="utf-8",
        )

        violations = check_credential_leakage(self.root)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0].rule_id, "ARCH004_NO_RAW_CREDENTIAL_SERIALIZATION")
        self.assertIn("token", violations[0].message)
        self.assertIn("HOW TO FIX ROOT CAUSE:", violations[0].format())

    def test_skill_hygiene_catches_missing_frontmatter(self) -> None:
        skill_dir = self.root / ".agents" / "skills" / "demo"
        skill_dir.mkdir(parents=True)
        skill_md = skill_dir / "SKILL.md"
        skill_md.write_text("# Demo Skill\nMissing YAML frontmatter.", encoding="utf-8")

        violations = check_skill_hygiene(self.root)
        self.assertGreaterEqual(len(violations), 1)
        self.assertEqual(violations[0].rule_id, "ARCH005_SKILL_HYGIENE")
        self.assertIn("HOW TO FIX ROOT CAUSE:", violations[0].format())

    def test_skill_hygiene_catches_oversized_file(self) -> None:
        skill_dir = self.root / ".agents" / "skills" / "bloated"
        skill_dir.mkdir(parents=True)
        skill_md = skill_dir / "SKILL.md"
        content = "---\nname: bloated\ndescription: huge\n---\n" + ("x" * 25000)
        skill_md.write_text(content, encoding="utf-8")

        violations = check_skill_hygiene(self.root)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0].rule_id, "ARCH005_SKILL_HYGIENE")
        self.assertIn("exceeds maximum limit of 24,000 bytes", violations[0].message)
        self.assertIn("HOW TO FIX ROOT CAUSE:", violations[0].format())

    def test_cli_runner_fails_with_nonzero_exit_on_violations(self) -> None:
        model_dir = self.root / "desktop" / "src"
        model_dir.mkdir(parents=True)
        bad_model = model_dir / "sampleModel.ts"
        bad_model.write_text("import React from 'react';\n", encoding="utf-8")

        checker_py = pathlib.Path(__file__).resolve().parent / "check_boundaries.py"
        proc = subprocess.run(
            [sys.executable, str(checker_py), str(self.root)],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("BOUNDARY VIOLATIONS FOUND", proc.stderr)
        self.assertIn("HOW TO FIX ROOT CAUSE:", proc.stderr)


if __name__ == "__main__":
    unittest.main()
