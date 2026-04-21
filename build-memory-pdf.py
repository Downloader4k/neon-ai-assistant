"""
Generiert eine PDF mit dem gesamten Memory-Inhalt.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Preformatted, HRFlowable
)
from reportlab.lib.enums import TA_LEFT
from datetime import datetime
import html
import re

OUTPUT = r"C:\Neon-OpenClaw\neon-ai-assistant\neon-memory.pdf"

FILES = [
    ("MEMORY.md", r"C:\Users\Thorben\.claude\projects\C--Neon-OpenClaw-neon-ai-assistant\memory\MEMORY.md"),
    ("user_profile.md", r"C:\Users\Thorben\.claude\projects\C--Neon-OpenClaw-neon-ai-assistant\memory\user_profile.md"),
    ("feedback_deutsch.md", r"C:\Users\Thorben\.claude\projects\C--Neon-OpenClaw-neon-ai-assistant\memory\feedback_deutsch.md"),
    ("feedback_no_electron.md", r"C:\Users\Thorben\.claude\projects\C--Neon-OpenClaw-neon-ai-assistant\memory\feedback_no_electron.md"),
]

styles = getSampleStyleSheet()

cover_title_style = ParagraphStyle(
    "CoverTitle", parent=styles["Title"],
    fontSize=28, leading=34, textColor=colors.HexColor("#f9ab00"),
    spaceAfter=14, alignment=TA_LEFT,
)
cover_sub_style = ParagraphStyle(
    "CoverSub", parent=styles["Normal"],
    fontSize=12, textColor=colors.HexColor("#555555"), spaceAfter=6,
)
heading_style = ParagraphStyle(
    "FileHeading", parent=styles["Heading1"],
    fontSize=20, leading=24, textColor=colors.HexColor("#f9ab00"),
    spaceBefore=0, spaceAfter=8,
)
meta_style = ParagraphStyle(
    "Meta", parent=styles["Normal"],
    fontSize=9, textColor=colors.HexColor("#777777"), spaceAfter=12,
)
h_style = ParagraphStyle(
    "MdH", parent=styles["Heading2"],
    fontSize=14, leading=18, textColor=colors.HexColor("#222222"),
    spaceBefore=10, spaceAfter=6,
)
h3_style = ParagraphStyle(
    "MdH3", parent=styles["Heading3"],
    fontSize=12, leading=16, textColor=colors.HexColor("#333333"),
    spaceBefore=8, spaceAfter=4,
)
body_style = ParagraphStyle(
    "Body", parent=styles["BodyText"],
    fontSize=10.5, leading=15, textColor=colors.HexColor("#111111"), spaceAfter=5,
)
bullet_style = ParagraphStyle(
    "Bullet", parent=body_style,
    leftIndent=14, bulletIndent=2, spaceAfter=3,
)
frontmatter_style = ParagraphStyle(
    "FrontMatter", parent=styles["Code"],
    fontSize=9, leading=12, textColor=colors.HexColor("#444444"),
    backColor=colors.HexColor("#f4f4f4"), borderPadding=6, spaceAfter=10,
)


def md_inline(text: str) -> str:
    """Minimal Markdown-Inline → ReportLab XML."""
    t = html.escape(text)
    # [Text](url) zuerst, damit URLs mit _ nicht von der Italic-Regel zerpflueckt werden
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<link href="\2" color="#1a73e8">\1</link>', t)
    # **bold**
    t = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", t)
    # *italic* (nur Stern-Variante, Underscore-Variante wuerde Dateinamen zerreissen)
    t = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", t)
    # `code`
    t = re.sub(r"`([^`]+)`", r'<font face="Courier" backcolor="#f0f0f0">\1</font>', t)
    return t


def md_to_flowables(md: str):
    """Sehr einfacher Markdown-Parser - genug fuer unsere Memory-Files."""
    lines = md.splitlines()
    flow = []

    # Frontmatter abfangen (--- ... ---)
    fm_lines = []
    i = 0
    if lines and lines[0].strip() == "---":
        i = 1
        while i < len(lines) and lines[i].strip() != "---":
            fm_lines.append(lines[i])
            i += 1
        if i < len(lines):
            i += 1  # skip closing ---
    if fm_lines:
        fm_text = "<br/>".join(html.escape(l) for l in fm_lines)
        flow.append(Paragraph(fm_text, frontmatter_style))

    buf = []

    def flush_buf():
        if buf:
            para = " ".join(buf).strip()
            if para:
                flow.append(Paragraph(md_inline(para), body_style))
            buf.clear()

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            flush_buf()
            flow.append(Spacer(1, 4))
        elif stripped.startswith("### "):
            flush_buf()
            flow.append(Paragraph(md_inline(stripped[4:]), h3_style))
        elif stripped.startswith("## "):
            flush_buf()
            flow.append(Paragraph(md_inline(stripped[3:]), h_style))
        elif stripped.startswith("# "):
            flush_buf()
            flow.append(Paragraph(md_inline(stripped[2:]), h_style))
        elif stripped.startswith(("- ", "* ")):
            flush_buf()
            flow.append(Paragraph(md_inline(stripped[2:]), bullet_style, bulletText="•"))
        elif re.match(r"^\d+\.\s+", stripped):
            flush_buf()
            m = re.match(r"^(\d+)\.\s+(.*)", stripped)
            if m:
                flow.append(Paragraph(md_inline(m.group(2)), bullet_style, bulletText=f"{m.group(1)}."))
        else:
            buf.append(stripped)
        i += 1

    flush_buf()
    return flow


def build():
    doc = SimpleDocTemplate(
        OUTPUT, pagesize=A4,
        leftMargin=2.2*cm, rightMargin=2.2*cm,
        topMargin=2.2*cm, bottomMargin=2*cm,
        title="NEON Memory Export",
        author="Thorben",
    )

    story = []

    # Cover
    story.append(Paragraph("NEON Memory", cover_title_style))
    story.append(Paragraph(
        f"Export aller Memory-Dateien fuer das NEON AI Assistant Projekt",
        cover_sub_style,
    ))
    story.append(Paragraph(
        f"Exportiert am {datetime.now().strftime('%d.%m.%Y %H:%M')}",
        cover_sub_style,
    ))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#f9ab00")))
    story.append(Spacer(1, 14))

    story.append(Paragraph("Enthaltene Dateien:", body_style))
    for name, _ in FILES:
        story.append(Paragraph(name, bullet_style, bulletText="•"))
    story.append(PageBreak())

    # Inhalt
    for idx, (name, path) in enumerate(FILES):
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            content = f"Fehler beim Lesen: {e}"

        story.append(Paragraph(name, heading_style))
        try:
            import os
            size = os.path.getsize(path)
            mtime = datetime.fromtimestamp(os.path.getmtime(path)).strftime("%d.%m.%Y %H:%M")
            story.append(Paragraph(f"Pfad: {path}<br/>Groesse: {size} Bytes &nbsp; Geaendert: {mtime}", meta_style))
        except Exception:
            pass
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dddddd")))
        story.append(Spacer(1, 8))

        story.extend(md_to_flowables(content))

        if idx < len(FILES) - 1:
            story.append(PageBreak())

    doc.build(story)
    print(f"[OK] PDF erstellt: {OUTPUT}")


if __name__ == "__main__":
    build()
