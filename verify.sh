#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WIN_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && (pwd -W 2>/dev/null || (command -v wslpath >/dev/null 2>&1 && wslpath -m "$(pwd)" 2>/dev/null) || pwd))"
export CARGO_INCREMENTAL=0

fail_with_fix() {
  local stage="$1"
  local fix="$2"
  echo "" >&2
  echo "[VERIFY FAILED] $stage" >&2
  echo "HOW TO FIX ROOT CAUSE: $fix" >&2
  exit 1
}

# Resolve Python executable
if [ -x "$ROOT_DIR/.venv/Scripts/python.exe" ]; then
  PYTHON="$WIN_ROOT_DIR/.venv/Scripts/python.exe"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON="python"
else
  fail_with_fix "Python Environment" "Ensure Python 3 is installed and added to PATH or virtual environment exists at .venv/."
fi

# Resolve Ruff executable
if command -v ruff >/dev/null 2>&1; then
  RUFF="ruff"
elif [ -x "$ROOT_DIR/.venv/Scripts/ruff.exe" ]; then
  RUFF="$WIN_ROOT_DIR/.venv/Scripts/ruff.exe"
else
  RUFF="$PYTHON -m ruff"
fi

echo "=== [1/7] Hard Architectural Boundaries & Lint Checks ==="
"$PYTHON" "$WIN_ROOT_DIR/tools/check_boundaries.py" "$WIN_ROOT_DIR" || fail_with_fix "Hard Architectural Boundaries" "Fix boundary violations reported above by tools/check_boundaries.py (pure model isolation, no .no_proxy() in production, no silent lint suppressions, no raw credential leaks, valid skill hygiene)."

(cd "$ROOT_DIR" && "$PYTHON" -m unittest discover -s "$WIN_ROOT_DIR/tools" -p "test_check_boundaries.py") || fail_with_fix "Boundary Checker Unit Tests" "Boundary checker unit tests in tools/test_check_boundaries.py failed. Ensure boundary rules and their test fixtures match."

# Pure domain module & strict TS check (bounty and navigation modules)
"$PYTHON" - "$WIN_ROOT_DIR" <<'PY' || fail_with_fix "Pure Domain Boundaries & Strict TS" "Move UI/framework imports (react, react-dom, @tauri-apps, .css) out of pure domain modules and remove any @ts-ignore/@ts-nocheck/@ts-expect-error/any usages from bounty modules."
import pathlib, re, sys

root = pathlib.Path(sys.argv[1])
pure_modules = [
    root / "desktop/src/bountyModel.ts",
    root / "desktop/src/notificationSound.ts",
    root / "desktop/src/worldModel.ts",
    root / "desktop/src/navigationModel.ts",
]
forbidden_imports = re.compile(r"""(?:from|import)\s+['"](?:react(?:/|$)|react-dom(?:/|$)|@tauri-apps/|[^'"]*\.css['"])""")

errors = []
for path in pure_modules:
    if not path.is_file():
        errors.append(f"Missing pure domain module: {path}")
        continue
    text = path.read_text(encoding="utf-8")
    for idx, line in enumerate(text.splitlines(), 1):
        if forbidden_imports.search(line):
            errors.append(f"{path}:{idx}: forbidden UI/framework import in pure module -> {line.strip()}")

bounty_ts_files = [
    root / "desktop/src/bountyModel.ts",
    root / "desktop/src/notificationSound.ts",
    root / "desktop/src/useBounties.ts",
    root / "desktop/src/Bounties.tsx",
    root / "desktop/tests/bountyModel.test.ts",
    root / "desktop/tests/notificationSound.test.ts",
]
forbidden_lint = re.compile(r"@ts-ignore|@ts-nocheck|@ts-expect-error|(?::\s*any\b|\bas\s+any\b)")

for path in bounty_ts_files:
    if not path.is_file():
        errors.append(f"Missing bounty file: {path}")
        continue
    text = path.read_text(encoding="utf-8")
    for idx, line in enumerate(text.splitlines(), 1):
        if forbidden_lint.search(line):
            errors.append(f"{path}:{idx}: forbidden suppression or weak any type -> {line.strip()}")

if errors:
    print("\n".join(errors), file=sys.stderr)
    sys.exit(1)
print("OK: All pure domain boundaries and strict TS checks passed.")
PY

echo "=== [2/7] Bounty Catalog Reference Integrity ==="
"$PYTHON" - "$WIN_ROOT_DIR" <<'PY' || fail_with_fix "Bounty Catalog Reference Integrity" "Run 'python tools/build_bounty_reference.py' to regenerate desktop/public/bounty-catalog.json and verify all 6 syndicates, >= 70 decks, valid rarities, and zero unresolved /Lotus/ strings."
import json, pathlib, sys

root = pathlib.Path(sys.argv[1])
catalog_path = root / "desktop/public/bounty-catalog.json"
if not catalog_path.is_file():
    print(f"Missing catalog file: {catalog_path}", file=sys.stderr)
    sys.exit(1)

data = json.loads(catalog_path.read_text(encoding="utf-8"))
expected_syndicates = {
    "CetusSyndicate",
    "SolarisSyndicate",
    "EntratiSyndicate",
    "ZarimanSyndicate",
    "EntratiLabSyndicate",
    "HexSyndicate",
}
syndicates = {s.get("tag") for s in data.get("syndicates", [])}
if not expected_syndicates.issubset(syndicates):
    print(f"Missing syndicates: {sorted(expected_syndicates - syndicates)}", file=sys.stderr)
    sys.exit(1)

decks = data.get("decks", {})
if len(decks) < 70:
    print(f"Expected >= 70 bounty decks, found {len(decks)}", file=sys.stderr)
    sys.exit(1)

valid_rarities = {"common", "uncommon", "rare"}
bad = []
for deck_id, deck in decks.items():
    rewards = deck.get("rewards", [])
    if not rewards:
        bad.append(f"{deck_id}: empty rewards")
    for item in rewards:
        if item.get("rarity") not in valid_rarities:
            bad.append(f"{deck_id}: invalid rarity {item.get('rarity')!r}")
        for lang in ("zh", "en"):
            val = item.get(lang, "")
            if not val or "/Lotus/" in val:
                bad.append(f"{deck_id}: unresolved {lang} name {val!r} for {item.get('itemId')}")

if bad:
    print("\n".join(bad[:20]), file=sys.stderr)
    sys.exit(1)

print(f"OK: Verified {len(syndicates)} syndicates and {len(decks)} decks in bounty-catalog.json.")
PY

echo "=== [3/7] Python Static Lint & Unit Tests ==="
$RUFF check "$WIN_ROOT_DIR/collector" "$WIN_ROOT_DIR/tools" || fail_with_fix "Python Static Lint (ruff)" "Fix Python syntax, undefined variables, or correctness errors in collector/ and tools/ reported by ruff check."

"$PYTHON" -m unittest discover -s "$WIN_ROOT_DIR/collector" -p "test_*.py" || fail_with_fix "Collector Unit Tests" "Fix failing Python test assertions in collector/test_*.py."

"$PYTHON" -m unittest discover -s "$WIN_ROOT_DIR/tools" -p "test_*.py" || fail_with_fix "Tools Unit Tests" "Fix failing Python test assertions in tools/test_*.py."

if [ -f "$ROOT_DIR/services/stats-share/test.mjs" ]; then
  node "$ROOT_DIR/services/stats-share/test.mjs" || fail_with_fix "Stats Share Service Tests" "Fix failing Node.js assertions in services/stats-share/test.mjs."
fi

echo "=== [4/7] TypeScript Typecheck & Vite Build ==="
(
  cd "$ROOT_DIR/desktop" &&
  npx tsc --noEmit &&
  npm test &&
  npm run build
) || fail_with_fix "Frontend TypeScript / Tests / Build" "Resolve TypeScript compile errors, failing unit tests in desktop/tests/, or Vite build bundle errors without using any or suppression comments."

echo "=== [5/7] Rust Backend Unit Tests & Clippy Correctness ==="
(
  cd "$ROOT_DIR/desktop/src-tauri"
  MSVC_BIN="$(printf '%s' "$PATH" | tr ':' '\n' | grep -E 'VC/Tools/MSVC/.*/bin/HostX64/x64' | head -n1 || true)"
  if [ -n "$MSVC_BIN" ]; then
    export PATH="$MSVC_BIN:$PATH" &&
    cargo test --bin myframe-desktop &&
    cargo clippy --bin myframe-desktop -- -D clippy::correctness &&
    cargo test --features diagnostics --bin helper-probe &&
    cargo clippy --features diagnostics --bin helper-probe -- -D clippy::correctness
  elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$ROOT_DIR/tools/with-msvc.ps1" cargo test --bin myframe-desktop &&
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$ROOT_DIR/tools/with-msvc.ps1" cargo clippy --bin myframe-desktop -- -D clippy::correctness &&
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$ROOT_DIR/tools/with-msvc.ps1" cargo test --features diagnostics --bin helper-probe &&
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$ROOT_DIR/tools/with-msvc.ps1" cargo clippy --features diagnostics --bin helper-probe -- -D clippy::correctness
  else
    cargo test --bin myframe-desktop &&
    cargo clippy --bin myframe-desktop -- -D clippy::correctness &&
    cargo test --features diagnostics --bin helper-probe &&
    cargo clippy --features diagnostics --bin helper-probe -- -D clippy::correctness
  fi
) || fail_with_fix "Rust Backend Tests & Clippy" "Fix failing cargo test assertions or clippy::correctness errors in desktop/src-tauri/src/ with CARGO_INCREMENTAL=0."

echo "=== [6/7] Windows C# Update Host Syntax Verification ==="
"$PYTHON" - "$WIN_ROOT_DIR" <<'PY' || fail_with_fix "C# Update Host Syntax Verification" "Fix C# compilation errors in desktop/src-tauri/update-host/Program.cs."
import os, pathlib, subprocess, sys

root = pathlib.Path(sys.argv[1])
update_host_cs = root / "desktop" / "src-tauri" / "update-host" / "Program.cs"
if not update_host_cs.is_file():
    print(f"Skipping C# check (file not present: {update_host_cs})")
    sys.exit(0)

windir = os.environ.get("WINDIR", r"C:\Windows")
csc = pathlib.Path(windir) / "Microsoft.NET" / "Framework64" / "v4.0.30319" / "csc.exe"
if not csc.is_file():
    print(f"Skipping C# check (csc.exe compiler not found at {csc})")
    sys.exit(0)

temp_out = root / "desktop" / "src-tauri" / "update-host" / "temp_check.exe"
try:
    cmd = [
        str(csc),
        "/nologo",
        "/nowarn:0649",
        "/target:winexe",
        "/reference:System.Web.Extensions.dll",
        f"/out:{temp_out}",
        str(update_host_cs).replace("/", "\\"),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stderr or res.stdout, file=sys.stderr)
        sys.exit(res.returncode)
    print("OK: C# update-host/Program.cs syntax compiled successfully.")
finally:
    if temp_out.is_file():
        try:
            temp_out.unlink()
        except OSError:
            pass
PY

echo "=== [7/7] Formal Verification TLC Check (Account Scope Sync) ==="
if [ "${SKIP_TLC:-0}" = "1" ]; then
  echo "INFO: SKIP_TLC=1 set; skipping TLC model check."
elif [ -f "$ROOT_DIR/.agents/skills/account-scope-sync/scripts/run-tlc.mjs" ]; then
  node "$ROOT_DIR/.agents/skills/account-scope-sync/scripts/run-tlc.mjs" || fail_with_fix "Formal Verification (Account Scope Sync)" "AccountScopeSync TLA+ specification violated safety or liveness invariants. Inspect counterexamples with /statechart and align state machine transitions in Rust/TS with .agents/skills/account-scope-sync/SKILL.md."
else
  fail_with_fix "Formal Verification (Account Scope Sync)" "Missing formal verification runner at .agents/skills/account-scope-sync/scripts/run-tlc.mjs. Coordinate with @fv-modeler to generate the TLA+ spec and run-tlc.mjs script."
fi

echo ""
echo "[VERIFY PASSED] All 7 verification stages succeeded."
