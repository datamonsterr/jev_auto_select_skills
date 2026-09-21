---
name: open-report
description: Generate professional HTML reports from codebase analysis. Orchestrates grill-with-docs analysis, diagram rendering (Mermaid/PlantUML/Diagrams), chart generation (seaborn/matplotlib), and HTML report assembly. Use when generating SRS documents, architecture reports, or system design documents.
---

# open-report

Generate professional HTML reports by analyzing a target project, writing markdown content, rendering diagrams and charts, and assembling a standalone HTML report.

## Pipeline

1. **Analyze** — Use `grill-with-docs` skill to analyze the target codebase
2. **Write** — Write report content in markdown (user approves)
3. **Render** — Use Diagram-Renderer subagent for Mermaid/PlantUML/Architecture diagrams
4. **Chart** — Use `scripts/render_charts.py` for seaborn/matplotlib charts
5. **Assemble** — Use Report-Renderer subagent to generate HTML
6. **Validate** — Use Tester subagent to verify output

## Quick Start

```bash
# 1. Install dependencies
python -m venv .venv
.venv/bin/pip install -r requirements.txt

# 2. Generate sample assets (for testing)
.venv/bin/python output/example_diagrams.py

# 3. Generate a report
.venv/bin/python scripts/generate_report.py --title "My Report" --type a4
```

## Templates

- `templates/report-a4.html` — Paginated A4 report with print CSS, headers/footers, TOC
- `templates/report-slides.html` — Reveal.js presentation slides

## Commands

- `/generate-report` — Full pipeline with user interaction

## Subagents

- `diagram-renderer` — Renders Mermaid, PlantUML, and Python diagrams to SVG/PNG
- `report-renderer` — Assembles markdown + images into HTML
- `tester` — Validates generated HTML reports

## Dependencies

- **Python**: markdown, diagrams, matplotlib, seaborn, numpy, pillow
- **System**: mermaid-cli (npm), plantuml (jar), graphviz
- **Opencode skills**: grill-with-docs (required), brainstorming (recommended)

## Output

```
output/
  analysis.md        # grill-with-docs output
  content.md         # Approved markdown
  diagrams/          # SVG/PNG diagrams
  charts/            # SVG/PNG charts
  report.html        # Final standalone HTML
```
