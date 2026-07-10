from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import contributors, tasks, entries, audio, reviews, dictionary

app = FastAPI(title="Thok API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["authorization", "x-client-info", "apikey", "content-type", "x-contributor-id"],
)

app.include_router(contributors.router)
app.include_router(tasks.router)
app.include_router(entries.router)
app.include_router(audio.router)
app.include_router(reviews.router)
app.include_router(dictionary.router)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        content = {"error": {**detail, "status": exc.status_code}}
    else:
        content = {"error": {"code": "ERROR", "message": str(detail), "status": exc.status_code}}
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred.", "status": 500}},
    )


@app.get("/health")
def health():
    return {"status": "ok"}


# Vercel looks for a top-level `app` variable — it's already defined above.
