from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.compat import router as compat_router
from app.api.public.chat import router as public_chat_router
from app.core.config import get_settings
from app.services.compat.error_policy import build_http_error_payload, build_unexpected_error_payload


settings = get_settings()

app = FastAPI(
    title="AI+ API",
    version="0.0.1",
    description="Personalized learning orchestration prototype API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}


@app.exception_handler(HTTPException)
async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
    trace_id = request.headers.get("x-trace-id") or uuid4().hex
    payload = build_http_error_payload(exc, trace_id)
    return JSONResponse(status_code=exc.status_code, content=payload)


@app.exception_handler(Exception)
async def handle_unexpected_exception(request: Request, _exc: Exception) -> JSONResponse:
    trace_id = request.headers.get("x-trace-id") or uuid4().hex
    payload = build_unexpected_error_payload(trace_id)
    return JSONResponse(status_code=500, content=payload)


app.include_router(compat_router)
app.include_router(public_chat_router)
