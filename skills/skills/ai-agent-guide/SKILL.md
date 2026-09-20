---
name: ai-agent-guide
description: Technical guidebook for developing, testing, and deploying production AI agents using LangGraph and FastAPI. Use when designing agent state graphs, implementing tool calling, structuring FastAPI routes, debugging agent execution, or following AI20K architectural best practices.
---

# AI Agent Engineering Guide

This skill encapsulates the comprehensive engineering practices for building robust AI Agents using LangGraph, FastAPI, and Pydantic.

## Architectural Foundations

1. **Decoupled 3-Tier Layering**:
   - `src/agents/`: State definitions (`state.py`), node functions (`nodes/`), tools (`tools/`), and compiled graph (`graph.py`).
   - `src/api/`: FastAPI route handlers and request/response models.
   - `src/services/`: LLM client wrappers and vector retrieval services.
   - `src/models/`: Shared Pydantic data schemas.

2. **LangGraph State Management**:
   - Always define state schema using `TypedDict` or Pydantic with explicit type annotations.
   - Use `Annotated[list, add_messages]` to handle conversation message appending safely.
   - Separate reasoning nodes from execution nodes (tools).

3. **Tool Design**:
   - Decorate tools with `@tool` from LangChain.
   - Provide explicit docstrings and type hints so LLMs understand tool signatures without ambiguity.
   - Tools must catch exceptions and return informative error strings rather than throwing unhandled exceptions.

## Reference Guides

- [LangGraph Patterns & State Flows](./references/langgraph_patterns.md)
- [FastAPI Streaming & Endpoint Architecture](./references/fastapi_patterns.md)
- [DevOps, Docker & Pytest Verification](./references/devops_and_testing.md)

## Development Workflow

1. Define State (`src/agents/state.py`).
2. Implement tools and node functions (`src/agents/tools/`, `src/agents/nodes/`).
3. Wire edges and conditional branches in `src/agents/graph.py`.
4. Expose async endpoints in `src/api/routes.py`.
5. Verify with automated tests in `tests/test_agents/` and `tests/test_api/`.
