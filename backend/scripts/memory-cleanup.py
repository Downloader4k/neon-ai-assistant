"""
NEON Memory Cleanup - Phase 1
==============================
Bereinigt die memory_entries-Tabelle:
  1. Backup anlegen
  2. Junk identifizieren (Logs, Wikipedia-Dumps, RAG-Dumps, zu lang)
  3. Exakte Duplikate zusammenfuehren
  4. Name-Konflikte aufloesen (Thorben > Torben > Alunio)
  5. Report schreiben

Usage:
  python memory-cleanup.py           # Dry-Run (nur Report)
  python memory-cleanup.py --apply   # Backup + Anwenden
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = r"C:\Neon-OpenClaw\neon-ai-assistant\backend\prisma\prisma\neon.db"
BACKUP_DIR = r"C:\Neon-OpenClaw\neon-ai-assistant\backend\prisma\prisma\backups"
REPORT_DIR = r"C:\Neon-OpenClaw\neon-ai-assistant\memory"

# ---------- Regeln --------------------------------------------------------

# Junk-Pattern: wenn content einen dieser Marker enthaelt → loeschen
JUNK_SUBSTRINGS = [
    "[ROUTING_LOG]",
    "[TOOL_EXEC]",
    "[TOOL_RESULT]",
    "[LLM_RAW]",
    "[LLM_DEBUG]",
    "[RAG:",
    "Traceback (most recent call last)",
]

# Wikipedia-Dump erkennen (mehrere typische Marker + Laenge)
WIKI_MARKERS = ["Artikel\nDiskussion", "Versionsgeschichte", "Quelltext bearbeiten"]

# Harter Cutoff: alles >500 chars ohne Summary = Dump
MAX_CONTENT_LEN = 500
MIN_SUMMARY_RATIO = 0.3  # Summary muss < 30% vom Content sein, sonst sinnlos

# Name-Konflikt - kanonischer Name
CANONICAL_NAME = "Thorben"
NAME_ALIASES = ["Torben", "Alunio"]  # werden als falsch gewertet


def backup_db() -> str:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = os.path.join(BACKUP_DIR, f"neon-before-cleanup-{ts}.db")
    shutil.copy2(DB_PATH, dest)
    return dest


def is_junk(content: str) -> tuple[bool, str]:
    """Returns (is_junk, reason)."""
    if not content:
        return True, "empty"
    c = content.strip()
    for marker in JUNK_SUBSTRINGS:
        if marker in c:
            return True, f"contains {marker}"
    if sum(m in c for m in WIKI_MARKERS) >= 2:
        return True, "wikipedia-dump"
    if len(c) > MAX_CONTENT_LEN:
        return True, f"too long ({len(c)} chars)"
    # Code-Block-Dump
    if c.count("```") >= 2 and len(c) > 200:
        return True, "code-block dump"
    # URL-only content
    if re.match(r"^https?://\S+$", c):
        return True, "url-only"
    # Sinnlose Fragmente (weniger als 3 Woerter)
    if len(c.split()) < 3:
        return True, f"fragment ({len(c.split())} words)"
    return False, ""


def has_wrong_name(content: str) -> str | None:
    """Returns alias found in content, or None."""
    lower = content.lower()
    for alias in NAME_ALIASES:
        # Nur als isoliertes Wort, nicht als Teil (z.B. Torbendorf)
        if re.search(rf"\b{re.escape(alias.lower())}\b", lower):
            return alias
    return None


# ---------- Analyse --------------------------------------------------------

def analyze(conn: sqlite3.Connection) -> dict:
    cur = conn.cursor()
    cur.execute("SELECT id, type, content, summary, importanceScore, createdAt, accessCount FROM memory_entries WHERE isActive = 1")
    rows = cur.fetchall()

    junk = []           # [(id, reason, preview)]
    wrong_name = []     # [(id, alias, preview)]
    # Dedup: content -> list of (id, createdAt, accessCount, importance)
    by_content: dict[str, list] = {}

    for mid, typ, content, summary, imp, created, access in rows:
        ok, reason = is_junk(content)
        if ok:
            junk.append((mid, typ, reason, (content or "")[:120]))
            continue
        alias = has_wrong_name(content)
        if alias:
            wrong_name.append((mid, typ, alias, (content or "")[:120]))
        # Normalize content for dedup (strip whitespace + lower)
        norm = re.sub(r"\s+", " ", content or "").strip().lower()
        by_content.setdefault(norm, []).append((mid, created, access or 0, imp or 0, content))

    duplicates = {k: v for k, v in by_content.items() if len(v) > 1}

    return {
        "total_active": len(rows),
        "junk": junk,
        "wrong_name": wrong_name,
        "duplicates": duplicates,
    }


def plan_cleanup(analysis: dict) -> dict:
    """Gibt Liste von IDs zurueck die deaktiviert werden."""
    to_deactivate: list[tuple[str, str]] = []  # (id, reason)

    for mid, _typ, reason, _prev in analysis["junk"]:
        to_deactivate.append((mid, f"junk: {reason}"))

    for mid, _typ, alias, _prev in analysis["wrong_name"]:
        to_deactivate.append((mid, f"wrong_name: {alias}"))

    # Duplikate: behalte den mit groesster (importance, access, neuestem created)
    dedup_keeps: list[tuple[str, int]] = []
    for _norm, entries in analysis["duplicates"].items():
        # Sort desc: importance, accessCount, createdAt
        sorted_entries = sorted(entries, key=lambda e: (e[3], e[2], e[1] or ""), reverse=True)
        keep_id = sorted_entries[0][0]
        dedup_keeps.append((keep_id, len(entries)))
        for e in sorted_entries[1:]:
            to_deactivate.append((e[0], f"duplicate of {keep_id[:8]}"))

    # Unique-fy (eine ID nur einmal loeschen, nimm ersten Grund)
    seen = set()
    uniq = []
    for mid, reason in to_deactivate:
        if mid in seen:
            continue
        seen.add(mid)
        uniq.append((mid, reason))

    return {"deactivate": uniq, "dedup_keeps": dedup_keeps}


def write_report(analysis: dict, plan: dict, applied: bool, backup_path: str | None):
    os.makedirs(REPORT_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%d_%H-%M")
    fname = f"memory-cleanup-{ts}{'-applied' if applied else '-dryrun'}.md"
    path = os.path.join(REPORT_DIR, fname)

    lines = [
        f"# NEON Memory Cleanup - {ts}",
        "",
        f"Modus: {'APPLIED (Backup + Update)' if applied else 'DRY-RUN (keine Aenderungen)'}",
    ]
    if backup_path:
        lines.append(f"Backup: `{backup_path}`")
    lines += [
        "",
        "## Stats",
        f"- Aktive Eintraege vorher: **{analysis['total_active']}**",
        f"- Als Junk erkannt: **{len(analysis['junk'])}**",
        f"- Mit falschem Namen: **{len(analysis['wrong_name'])}**",
        f"- Dedup-Gruppen: **{len(analysis['duplicates'])}**",
        f"- Deaktiviert geplant: **{len(plan['deactivate'])}**",
        f"- Aktiv danach: **{analysis['total_active'] - len(plan['deactivate'])}**",
        "",
        "## Junk-Kategorien",
    ]
    reason_counts: dict[str, int] = {}
    for _mid, _typ, reason, _prev in analysis["junk"]:
        key = reason.split("(")[0].strip()
        reason_counts[key] = reason_counts.get(key, 0) + 1
    for r, n in sorted(reason_counts.items(), key=lambda x: -x[1]):
        lines.append(f"- {r}: **{n}**")

    lines += ["", "## Name-Konflikte (Alias → Canonical)"]
    alias_counts: dict[str, int] = {}
    for _m, _t, alias, _p in analysis["wrong_name"]:
        alias_counts[alias] = alias_counts.get(alias, 0) + 1
    for a, n in sorted(alias_counts.items(), key=lambda x: -x[1]):
        lines.append(f"- {a} → {CANONICAL_NAME}: **{n}** Eintraege")

    lines += ["", f"## Duplikat-Gruppen ({len(analysis['duplicates'])})"]
    for norm, entries in list(analysis["duplicates"].items())[:20]:
        sample = entries[0][4]
        lines.append(f"- **{len(entries)}x** `{(sample or '')[:80]!r}`")
    if len(analysis["duplicates"]) > 20:
        lines.append(f"- ... und {len(analysis['duplicates']) - 20} weitere")

    lines += ["", "## Deaktivierungen (erste 50)"]
    for mid, reason in plan["deactivate"][:50]:
        lines.append(f"- `{mid[:8]}…` - {reason}")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return path


def apply_cleanup(conn: sqlite3.Connection, plan: dict) -> int:
    cur = conn.cursor()
    ids = [mid for mid, _ in plan["deactivate"]]
    if not ids:
        return 0
    # Update in Chunks (SQLite hat ca. 999 Parameter-Limit)
    total = 0
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        placeholders = ",".join("?" * len(chunk))
        cur.execute(
            f"UPDATE memory_entries SET isActive = 0, updatedAt = CURRENT_TIMESTAMP "
            f"WHERE id IN ({placeholders})",
            chunk,
        )
        total += cur.rowcount
    conn.commit()
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Backup + tatsaechlich deaktivieren")
    args = ap.parse_args()

    if not os.path.exists(DB_PATH):
        print(f"[FEHLER] DB nicht gefunden: {DB_PATH}")
        sys.exit(1)

    backup_path = None
    if args.apply:
        backup_path = backup_db()
        print(f"[BACKUP] {backup_path}")

    conn = sqlite3.connect(DB_PATH)
    analysis = analyze(conn)
    plan = plan_cleanup(analysis)

    print(f"\nAktiv vorher:      {analysis['total_active']}")
    print(f"Junk erkannt:      {len(analysis['junk'])}")
    print(f"Falsche Namen:     {len(analysis['wrong_name'])}")
    print(f"Dedup-Gruppen:     {len(analysis['duplicates'])}")
    print(f"Zu deaktivieren:   {len(plan['deactivate'])}")
    print(f"Aktiv danach:      {analysis['total_active'] - len(plan['deactivate'])}")

    if args.apply:
        n = apply_cleanup(conn, plan)
        print(f"\n[OK] {n} Eintraege deaktiviert")
    else:
        print("\n[DRY-RUN] Keine Aenderungen. Mit --apply ausfuehren.")

    report = write_report(analysis, plan, args.apply, backup_path)
    print(f"[REPORT] {report}")

    conn.close()


if __name__ == "__main__":
    main()
