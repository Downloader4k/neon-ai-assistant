"""
Baut eine PDF mit den Memory-Dateien aus
C:\\Users\\Thorben\\.claude\\projects\\C--Neon-OpenClaw-neon-ai-assistant\\memory\\

Jede Datei wird als eigener Abschnitt mit Dateiname als Ueberschrift ausgegeben.
Output: C:\\Neon-OpenClaw\\neon-ai-assistant\\neon-memory.pdf
"""
import sys
import re
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Preformatted,
)
from reportlab.lib.enums import TA_LEFT

MEMORY_DIR = Path(
    r"C:\Users\Thorben\.claude\projects\C--Neon-OpenClaw-neon-ai-assistant\memory"
)
OUTPUT = Path(r"C:\Neon-OpenClaw\neon-ai-assistant\neon-memory.pdf")

# Reihenfolge: Index zuerst, dann die Profile, dann die Feedbacks alphabetisch
FILE_ORDER = [
    "MEMORY.md",
    "user_profile.md",
    "feedback_deutsch.md",
    "feedback_no_electron.md",
]


def xml_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
    )


def md_inline_to_html(line: str) -> str:
    """Sehr einfache Inline-Markdown -> ReportLab-HTML Konvertierung."""
    s = xml_escape(line)
    # Links [text](url) zuerst!
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<font color="#1a5fb4">\1</font>', s)
    # Bold
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    # Inline-Code
    s = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', s)
    return s


def read_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def main():
    if not MEMORY_DIR.exists():
        raise SystemExit(f"Memory-Ordner nicht gefunden: {MEMORY_DIR}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="Neon Memory (Claude Code Project Memory)",
        author="Thorben",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        name="CoverTitle",
        parent=styles["Title"],
        fontSize=24,
        leading=30,
        spaceAfter=12,
        textColor=colors.HexColor("#1a5fb4"),
    )
    subtitle_style = ParagraphStyle(
        name="CoverSub",
        parent=styles["Normal"],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#555555"),
    )
    section_style = ParagraphStyle(
        name="Section",
        parent=styles["Heading1"],
        fontSize=18,
        leading=22,
        spaceBefore=6,
        spaceAfter=10,
        textColor=colors.HexColor("#1a5fb4"),
    )
    subheader_style = ParagraphStyle(
        name="Sub",
        parent=styles["Heading2"],
        fontSize=13,
        leading=17,
        spaceBefore=10,
        spaceAfter=6,
        textColor=colors.HexColor("#222222"),
    )
    body_style = ParagraphStyle(
        name="Body",
        parent=styles["Normal"],
        fontSize=10.5,
        leading=14,
        alignment=TA_LEFT,
    )
    bullet_style = ParagraphStyle(
        name="Bullet",
        parent=body_style,
        leftIndent=14,
        bulletIndent=2,
        spaceBefore=1,
        spaceAfter=1,
    )
    code_style = ParagraphStyle(
        name="Code",
        parent=styles["Code"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#222222"),
        backColor=colors.HexColor("#f4f4f4"),
        borderColor=colors.HexColor("#dddddd"),
        borderWidth=0.5,
        borderPadding=4,
    )
    meta_style = ParagraphStyle(
        name="Meta",
        parent=body_style,
        fontSize=9,
        textColor=colors.HexColor("#777777"),
    )

    story = []

    # Cover
    story.append(Paragraph("Neon Memory", title_style))
    story.append(Paragraph(
        "Claude-Code Projektgedaechtnis fuer <b>neon-ai-assistant</b>",
        subtitle_style,
    ))
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph(
        f"Quelle: <font name='Courier'>{xml_escape(str(MEMORY_DIR))}</font>",
        meta_style,
    ))
    story.append(Paragraph(
        f"Dateien: {len(FILE_ORDER)}  ·  Erzeugt am 21.04.2026",
        meta_style,
    ))
    story.append(PageBreak())

    # Eine Sektion pro Datei
    for idx, filename in enumerate(FILE_ORDER):
        path = MEMORY_DIR / filename
        if not path.exists():
            story.append(Paragraph(filename, section_style))
            story.append(Paragraph(
                f"<i>Datei fehlt: {xml_escape(str(path))}</i>",
                body_style,
            ))
            if idx < len(FILE_ORDER) - 1:
                story.append(PageBreak())
            continue

        text = read_file(path)

        story.append(Paragraph(xml_escape(filename), section_style))
        story.append(Paragraph(
            f"Pfad: <font name='Courier'>{xml_escape(str(path))}</font>",
            meta_style,
        ))
        story.append(Spacer(1, 0.3 * cm))

        # Markdown zeilenweise in Flowables konvertieren
        in_code = False
        code_buf = []
        in_frontmatter = False
        fm_buf = []

        lines = text.splitlines()
        for i, raw in enumerate(lines):
            line = raw.rstrip()

            # YAML-Frontmatter (--- ... ---)
            if line.strip() == "---":
                if not in_frontmatter and i == 0:
                    in_frontmatter = True
                    continue
                if in_frontmatter:
                    in_frontmatter = False
                    if fm_buf:
                        story.append(Preformatted("\n".join(fm_buf), code_style))
                        story.append(Spacer(1, 0.2 * cm))
                        fm_buf = []
                    continue
            if in_frontmatter:
                fm_buf.append(line)
                continue

            # Codeblock ```
            if line.strip().startswith("```"):
                if not in_code:
                    in_code = True
                    code_buf = []
                else:
                    in_code = False
                    story.append(Preformatted("\n".join(code_buf), code_style))
                    story.append(Spacer(1, 0.2 * cm))
                    code_buf = []
                continue
            if in_code:
                code_buf.append(line)
                continue

            # Headings
            if line.startswith("### "):
                story.append(Paragraph(md_inline_to_html(line[4:].strip()), subheader_style))
                continue
            if line.startswith("## "):
                story.append(Paragraph(md_inline_to_html(line[3:].strip()), subheader_style))
                continue
            if line.startswith("# "):
                story.append(Paragraph(md_inline_to_html(line[2:].strip()), subheader_style))
                continue

            # Leerzeile
            if not line.strip():
                story.append(Spacer(1, 0.15 * cm))
                continue

            # Bullet
            if line.lstrip().startswith(("- ", "* ")):
                content = line.lstrip()[2:]
                story.append(Paragraph(
                    md_inline_to_html(content),
                    bullet_style,
                    bulletText="•",
                ))
                continue

            # Normaler Absatz
            story.append(Paragraph(md_inline_to_html(line), body_style))

        # Falls offener Codeblock am Dateiende
        if in_code and code_buf:
            story.append(Preformatted("\n".join(code_buf), code_style))

        if idx < len(FILE_ORDER) - 1:
            story.append(PageBreak())

    doc.build(story)
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"OK - PDF erzeugt: {OUTPUT}  ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
