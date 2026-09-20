# DevOps & Testing Patterns

## 1. Unit Testing Agents
Mock LLM invocations using LangChain `FakeListLLM` or `unittest.mock` to ensure graph flow executes without incurring API costs:

```python
import pytest
from src.agents.graph import create_graph


def test_graph_compilation():
    graph = create_graph()
    assert graph is not None
```

## 2. Multi-Stage Dockerfile
Use multi-stage builds (`python:3.11-slim`) to keep image sizes minimal, run as non-root user, and separate build dependencies from runtime binaries.
