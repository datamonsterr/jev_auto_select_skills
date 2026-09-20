---
name: write-a-doc
description: Technical documentation authoring and maintenance protocol for P-063. Use when creating, updating, or reviewing documentation in docs/ (architecture, worklog, journal, deliverables), enforcing subfolder README specifications, required question checklists, template structures, and clickable links.
---

# Write-a-Doc Protocol

This skill standardizes technical documentation creation and updates across the P-063 project. It enforces the project rule: **always inspect the target subfolder's `README.md` before touching any document**.

## 1. Step-by-Step Workflow

### Step 1: Pre-Writing Subfolder Inspection
Before creating or editing any documentation:
1. Identify target folder under `docs/` (`docs/architecture/`, `docs/worklog/`, `docs/journal/`).
2. Read the corresponding `README.md` (e.g., [`docs/journal/README.md`](file:///docs/journal/README.md)).
3. Extract and enforce:
   - **Filename conventions** (e.g. `week-NN.md`, `YYYY-MM-DD.md`, `adr-NNN-<topic>.md`).
   - **Required questions to answer** (e.g. 5 questions for worklog/journal, 6 for architecture).
   - **Mandatory entry template**.
   - **Associated skills** (e.g. `rtk`, `ai-agent-guide`, `mnemoverse`).

### Step 2: Information & Evidence Gathering
- Gather verifiable facts from code, git commits, terminal logs, or transcripts.
- Convert all file, function, and schema mentions into clickable github-style links:
  `[relative_path](file:///home/dat/dev/vinuni_aia/P-063/relative_path)`.
- Never invent placeholder details or mock completed tasks without verifiable code artifacts.

### Step 3: Drafting & Template Compliance
- Follow the exact markdown template specified in the subfolder's `README.md`.
- Explicitly answer every required question listed in the specification.
- Use uppercase naming for root deliverables (`docs/DELIVERABLES.md`, `docs/AI_LOGS.md`, `docs/DEPLOYMENT.md`, `docs/EVALUATION.md`, `docs/PRESENTATION.md`).

### Step 4: RTK Compression & Deliverable Audit
- Apply strict `rtk` standards: eliminate preamble, conversational commentary, and redundant prose.
- Prefer markdown tables and compact bullet lists over wordy narrative.
- Cross-reference with [`docs/DELIVERABLES.md`](file:///docs/DELIVERABLES.md) to ensure milestone alignment.

## 2. Directory Quick Reference

| Directory | Specification File | Filename Convention | Core Focus |
|---|---|---|---|
| `docs/architecture/` | [`docs/architecture/README.md`](file:///docs/architecture/README.md) | `ARCHITECTURE.md`, `adr-NNN-*.md` | System topology, state schemas, LangGraph cycles, ADRs |
| `docs/worklog/` | [`docs/worklog/README.md`](file:///docs/worklog/README.md) | `WORKLOG.md`, `YYYY-MM-DD.md` | Daily member tasks, outputs, status, time spent |
| `docs/journal/` | [`docs/journal/README.md`](file:///docs/journal/README.md) | `JOURNAL.md`, `week-NN.md` | Weekly reflections, roadblocks, resolutions, learnings |

## 3. Verification Checklist

Before saving or presenting any document:
- [ ] Read target `docs/<subfolder>/README.md` first?
- [ ] Adhered to designated filename convention?
- [ ] Answered 100% of required questions defined in the subfolder README?
- [ ] Embedded clickable links for all code symbols and file references?
- [ ] Applied RTK zero-fluff formatting (no filler, high information density)?
