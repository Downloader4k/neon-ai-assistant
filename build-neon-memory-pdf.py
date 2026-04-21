"""
Exportiert Neons echtes Gedaechtnis (SQLite DB) in eine lesbare PDF.

Quelle:  backend/prisma/prisma/neon.db
Ziel:    neon-gedaechtnis.pdf
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = r"C:\Neon-OpenClaw\neon-ai-assistant\backend\prisma\prisma\neon.db"
OUTPUT = r"C:\Neon-OpenClaw\neon-ai-assistant\neon-gedaechtnis.pdf"

ACCENT = colors.HexColor("#f9ab00")
MUTED = colors.HexColor("#777777")
DARK = colors.HexColor("#222222")
SOFT = colors.HexColor("#555555")

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    "Title", parent=styles["Title"],
    fontSize=28, leading=34, textColor=ACCENT,
    spaceAfter=14, alignment=TA_LEFT,
)
sub_style = ParagraphStyle(
    "Sub", parent=styles["Normal"],
    fontSize=11, textColor=SOFT, spaceAfter=4,
)
h1_style = ParagraphStyle(
    "H1", parent=styles["Heading1"],
    fontSize=20, leading=24, textColor=ACCENT,
    spaceBefore=4, spaceAfter=8,
)
h2_style = ParagraphStyle(
    "H2", parent=styles["Heading2"],
    fontSize=14, leading=18, textColor=DARK,
    spaceBefore=10, spaceAfter=4,
)
h3_style = ParagraphStyle(
    "H3", parent=styles["Heading3"],
    fontSize=11, leading=15, textColor=DARK,
    spaceBefore=6, spaceAfter=3,
)
body_style = ParagraphStyle(
    "Body", parent=styles["BodyText"],
    fontSize=10, leading=14, textColor=colors.HexColor("#111111"),
    spaceAfter=4,
)
meta_style = ParagraphStyle(
    "Meta", parent=styles["Normal"],
    fontSize=8.5, textColor=MUTED, spaceAfter=8,
)
tag_style = ParagraphStyle(
    "Tag", parent=styles["Normal"],
    fontSize=8.5, textColor=SOFT, spaceAfter=2,
)


def esc(s) -> str:
    if s is None:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def fmt_dt(v) -> str:
    if not v:
        return ""
    try:
        # Prisma stores as ISO or unix ms - try both
        if isinstance(v, (int, float)):
            return datetime.fromtimestamp(v / 1000).strftime("%d.%m.%Y %H:%M")
        return str(v)[:19].replace("T", " ")
    except Exception:
        return str(v)


def fetch_all(cur, sql, params=()):
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def section_break(story, title):
    story.append(PageBreak())
    story.append(Paragraph(title, h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=ACCENT))
    story.append(Spacer(1, 8))


def build_users(story, cur):
    users = fetch_all(cur, "SELECT * FROM users ORDER BY createdAt")
    section_break(story, f"Users ({len(users)})")
    for u in users:
        story.append(Paragraph(f"{esc(u.get('name') or '-')} &nbsp; <font color='#888'>{esc(u['id'][:8])}…</font>", h2_style))
        lines = []
        if u.get("email"):
            lines.append(f"E-Mail: {esc(u['email'])}")
        if u.get("avatar"):
            lines.append(f"Avatar: {esc(u['avatar'])}")
        lines.append(f"Angelegt: {fmt_dt(u.get('createdAt'))}")
        lines.append(f"Aktualisiert: {fmt_dt(u.get('updatedAt'))}")
        story.append(Paragraph("<br/>".join(lines), meta_style))
        if u.get("preferences"):
            try:
                prefs = json.loads(u["preferences"])
                story.append(Paragraph(f"<b>Preferences (JSON):</b> <font face='Courier' size='8'>{esc(json.dumps(prefs, ensure_ascii=False, indent=2))}</font>", body_style))
            except Exception:
                story.append(Paragraph(f"<b>Preferences (raw):</b> {esc(u['preferences'])}", body_style))


def build_preferences(story, cur):
    prefs = fetch_all(cur, "SELECT * FROM user_preferences ORDER BY category, key")
    section_break(story, f"User Preferences ({len(prefs)})")
    if not prefs:
        story.append(Paragraph("(keine)", body_style))
        return
    data = [["Category", "Key", "Value", "Updated"]]
    for p in prefs:
        val = p.get("value") or ""
        if len(val) > 60:
            val = val[:57] + "…"
        data.append([
            esc(p.get("category") or ""),
            esc(p.get("key") or ""),
            esc(val),
            fmt_dt(p.get("updatedAt")),
        ])
    tbl = Table(data, colWidths=[3*cm, 4*cm, 7*cm, 3*cm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cccccc")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(tbl)


def build_memory_entries(story, cur):
    rows = fetch_all(
        cur,
        "SELECT * FROM memory_entries WHERE isActive = 1 ORDER BY importanceScore DESC, createdAt DESC",
    )
    total = cur.execute("SELECT COUNT(*) FROM memory_entries").fetchone()[0]
    active = len(rows)
    section_break(story, f"Long-Term Memory ({active} aktiv / {total} gesamt)")
    story.append(Paragraph(
        "Sortiert nach Importance-Score. Inaktive/expirierte Eintraege sind ausgeblendet.",
        meta_style,
    ))

    # Tags pro Memory-Eintrag holen
    tags_by_mem: dict[str, list[str]] = {}
    try:
        cur.execute("""
            SELECT ma.A AS memId, mt.name
            FROM _MemoryEntryToMemoryTag ma
            JOIN memory_tags mt ON mt.id = ma.B
        """)
        for mem_id, tname in cur.fetchall():
            tags_by_mem.setdefault(mem_id, []).append(tname)
    except Exception as e:
        print(f"[warn] tags join: {e}")

    for r in rows:
        imp = r.get("importanceScore") or 0
        typ = r.get("type") or "memory"
        summary = r.get("summary") or ""
        content = r.get("content") or ""
        tags = tags_by_mem.get(r["id"], [])

        head = f"<b>[{esc(typ)}]</b> &nbsp; Importance: {imp:.2f} &nbsp; · &nbsp; Access: {r.get('accessCount') or 0}x"
        story.append(Paragraph(head, h3_style))

        if summary and summary != content:
            story.append(Paragraph(f"<i>{esc(summary)}</i>", body_style))
        story.append(Paragraph(esc(content), body_style))

        meta_bits = [
            f"Angelegt: {fmt_dt(r.get('createdAt'))}",
            f"Last Access: {fmt_dt(r.get('lastAccessedAt'))}",
        ]
        if r.get("expiresAt"):
            meta_bits.append(f"Expires: {fmt_dt(r['expiresAt'])}")
        if tags:
            meta_bits.append(f"Tags: {', '.join('#'+t for t in tags)}")
        story.append(Paragraph(" · ".join(meta_bits), meta_style))


def build_conversations(story, cur):
    convs = fetch_all(cur, "SELECT * FROM conversations ORDER BY createdAt DESC")
    section_break(story, f"Conversations ({len(convs)})")
    story.append(Paragraph(
        "Zusammenfassungen aller gespeicherten Unterhaltungen (inkl. Message-Count).",
        meta_style,
    ))

    # Message counts
    cur.execute("SELECT conversationId, COUNT(*) FROM messages GROUP BY conversationId")
    msg_counts = dict(cur.fetchall())

    for c in convs:
        title = c.get("title") or "(ohne Titel)"
        story.append(Paragraph(f"{esc(title)}", h3_style))
        imp = c.get("importanceScore") or 0
        bits = [
            f"Typ: {esc(c.get('type') or '-')}",
            f"Importance: {imp:.2f}",
            f"Messages: {msg_counts.get(c['id'], 0)}",
            f"Start: {fmt_dt(c.get('createdAt'))}",
        ]
        if c.get("endedAt"):
            bits.append(f"Ende: {fmt_dt(c['endedAt'])}")
        story.append(Paragraph(" · ".join(bits), meta_style))
        if c.get("summary"):
            story.append(Paragraph(esc(c["summary"]), body_style))


def build_tags(story, cur):
    rows = fetch_all(cur, "SELECT id, name FROM memory_tags ORDER BY name")
    # Count usage
    usage: dict[str, int] = {}
    for table in ("_MemoryEntryToMemoryTag", "_EpisodeToMemoryTag", "_KnowledgeEntryToMemoryTag"):
        try:
            cur.execute(f"SELECT B, COUNT(*) FROM {table} GROUP BY B")
            for tid, n in cur.fetchall():
                usage[tid] = usage.get(tid, 0) + n
        except Exception:
            pass
    section_break(story, f"Memory Tags ({len(rows)})")
    # Sort by usage desc
    ranked = sorted(rows, key=lambda r: -usage.get(r["id"], 0))
    data = [["Tag", "Uses"]]
    for t in ranked:
        data.append([esc(t["name"]), str(usage.get(t["id"], 0))])
    tbl = Table(data, colWidths=[12*cm, 2.5*cm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
    ]))
    story.append(tbl)


def build_todos(story, cur):
    rows = fetch_all(cur, "SELECT * FROM todo_items ORDER BY status, priority DESC, createdAt DESC")
    section_break(story, f"Todos ({len(rows)})")
    if not rows:
        story.append(Paragraph("(keine)", body_style))
        return
    for t in rows:
        head = f"<b>{esc(t.get('title') or '')}</b> &nbsp; <font color='#888'>[{esc(t.get('status') or '')}]</font>"
        story.append(Paragraph(head, h3_style))
        bits = [
            f"Prio: {t.get('priority') or '-'}",
            f"Kategorie: {esc(t.get('category') or '-')}",
            f"Angelegt: {fmt_dt(t.get('createdAt'))}",
        ]
        if t.get("dueDate"):
            bits.append(f"Faellig: {fmt_dt(t['dueDate'])}")
        if t.get("completedAt"):
            bits.append(f"Erledigt: {fmt_dt(t['completedAt'])}")
        story.append(Paragraph(" · ".join(bits), meta_style))
        if t.get("description"):
            story.append(Paragraph(esc(t["description"]), body_style))


def build_shopping(story, cur):
    rows = fetch_all(cur, "SELECT * FROM shopping_items ORDER BY isPurchased, category, name")
    section_break(story, f"Shopping Items ({len(rows)})")
    if not rows:
        story.append(Paragraph("(keine)", body_style))
        return
    data = [["Item", "Menge", "Kategorie", "Store", "Gekauft"]]
    for s in rows:
        data.append([
            esc(s.get("name") or ""),
            esc(s.get("quantity") or ""),
            esc(s.get("category") or ""),
            esc(s.get("store") or ""),
            "ja" if s.get("isPurchased") else "nein",
        ])
    tbl = Table(data, colWidths=[5*cm, 2*cm, 3.5*cm, 3*cm, 2*cm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
    ]))
    story.append(tbl)


def build_proactive(story, cur):
    rows = fetch_all(cur, "SELECT * FROM proactive_messages ORDER BY createdAt DESC")
    section_break(story, f"Proactive Messages ({len(rows)})")
    if not rows:
        story.append(Paragraph("(keine)", body_style))
        return
    for m in rows:
        story.append(Paragraph(f"<b>[{esc(m.get('type') or '-')}]</b> &nbsp; Prio: {m.get('priority') or '-'} &nbsp; <font color='#888'>{fmt_dt(m.get('createdAt'))}</font>", h3_style))
        story.append(Paragraph(esc(m.get("content") or ""), body_style))
        bits = []
        if m.get("trigger"):
            bits.append(f"Trigger: {esc(m['trigger'])}")
        bits.append("gelesen" if m.get("read") else "ungelesen")
        if m.get("deliveredAt"):
            bits.append(f"Zugestellt: {fmt_dt(m['deliveredAt'])}")
        story.append(Paragraph(" · ".join(bits), meta_style))


def build_extractions(story, cur):
    rows = fetch_all(cur, "SELECT * FROM memory_extractions ORDER BY extractedAt DESC LIMIT 50")
    total = cur.execute("SELECT COUNT(*) FROM memory_extractions").fetchone()[0]
    section_break(story, f"Memory Extractions (letzte 50 von {total})")
    if not rows:
        story.append(Paragraph("(keine)", body_style))
        return
    data = [["Wann", "Von", "Confidence", "Conversation"]]
    for r in rows:
        data.append([
            fmt_dt(r.get("extractedAt")),
            esc(r.get("extractedBy") or ""),
            f"{r.get('confidence') or 0:.2f}",
            esc((r.get("conversationId") or "")[:20]) + "…",
        ])
    tbl = Table(data, colWidths=[3.5*cm, 4*cm, 2.5*cm, 5*cm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
    ]))
    story.append(tbl)


def build_cover(story, cur, db_size):
    story.append(Paragraph("Neon · Gedaechtnis-Export", title_style))
    story.append(Paragraph("Snapshot der echten Runtime-Datenbank des NEON AI Assistant", sub_style))
    story.append(Paragraph(f"Exportiert am {datetime.now().strftime('%d.%m.%Y %H:%M')}", sub_style))
    story.append(Paragraph(f"Quelle: {DB_PATH}", sub_style))
    story.append(Paragraph(f"DB-Groesse: {db_size/1024/1024:.2f} MB", sub_style))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=ACCENT))
    story.append(Spacer(1, 14))

    # Inhalts-Uebersicht
    queries = [
        ("Users", "SELECT COUNT(*) FROM users"),
        ("User Preferences", "SELECT COUNT(*) FROM user_preferences"),
        ("Long-Term Memory (aktiv)", "SELECT COUNT(*) FROM memory_entries WHERE isActive=1"),
        ("Long-Term Memory (gesamt)", "SELECT COUNT(*) FROM memory_entries"),
        ("Memory Tags", "SELECT COUNT(*) FROM memory_tags"),
        ("Memory Extractions", "SELECT COUNT(*) FROM memory_extractions"),
        ("Conversations", "SELECT COUNT(*) FROM conversations"),
        ("Messages", "SELECT COUNT(*) FROM messages"),
        ("Episodes", "SELECT COUNT(*) FROM episodes"),
        ("Knowledge Entries", "SELECT COUNT(*) FROM knowledge_entries"),
        ("Todos", "SELECT COUNT(*) FROM todo_items"),
        ("Shopping Items", "SELECT COUNT(*) FROM shopping_items"),
        ("Proactive Messages", "SELECT COUNT(*) FROM proactive_messages"),
        ("Emotion Logs", "SELECT COUNT(*) FROM emotion_logs"),
        ("Feedback", "SELECT COUNT(*) FROM feedback"),
        ("Documents", "SELECT COUNT(*) FROM documents"),
    ]
    data = [["Bereich", "Anzahl"]]
    for label, sql in queries:
        try:
            n = cur.execute(sql).fetchone()[0]
        except Exception:
            n = "-"
        data.append([label, str(n)])
    tbl = Table(data, colWidths=[10*cm, 3*cm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
    ]))
    story.append(tbl)


def main():
    if not os.path.exists(DB_PATH):
        print(f"[FEHLER] DB nicht gefunden: {DB_PATH}")
        sys.exit(1)

    db_size = os.path.getsize(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=2.0*cm,
        rightMargin=2.0*cm,
        topMargin=2.0*cm,
        bottomMargin=1.8*cm,
        title="Neon Gedaechtnis-Export",
        author="NEON AI Assistant",
    )

    story = []
    build_cover(story, cur, db_size)
    build_users(story, cur)
    build_preferences(story, cur)
    build_memory_entries(story, cur)
    build_tags(story, cur)
    build_extractions(story, cur)
    build_conversations(story, cur)
    build_todos(story, cur)
    build_shopping(story, cur)
    build_proactive(story, cur)

    doc.build(story)
    print(f"[OK] PDF erstellt: {OUTPUT}")
    print(f"     Groesse: {os.path.getsize(OUTPUT)/1024:.1f} KB")


if __name__ == "__main__":
    main()
