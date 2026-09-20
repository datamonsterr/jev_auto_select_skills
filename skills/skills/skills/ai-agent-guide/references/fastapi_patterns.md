# FastAPI Agent Endpoint Patterns

## 1. Streaming SSE Responses
Deliver real-time tokens to frontend clients:

```python
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import json

router = APIRouter()


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    async def event_generator():
        async for event in agent_graph.astream_events({"messages": [("user", request.message)]}, version="v2"):
            kind = event["event"]
            if kind == "on_chat_model_stream":
                content = event["data"]["chunk"].content
                if content:
                    yield f"data: {json.dumps({'content': content})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

## 2. Health & Lifecycle
Always implement `/health` and handle model connection failures gracefully with appropriate HTTP 503 or structured fallback messages.
