from collections.abc import AsyncGenerator, Generator, Sequence
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel

from app.database import get_default_engine, get_session
from app.grid.fields import GridQueryError
from app.grid.models import GridRequest, GridResponse
from app.grid.query import execute_customer_grid_query
from app.seed import seed_customers_if_empty

LOCAL_DEVELOPMENT_ORIGINS: tuple[str, ...] = (
    "http://127.0.0.1:5174",
    "http://localhost:5174",
)


def create_app(
    engine: Engine | None = None,
    *,
    cors_origins: Sequence[str] = (),
) -> FastAPI:
    """Create and configure the FastAPI application."""
    effective_engine = engine or get_default_engine()

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
        SQLModel.metadata.create_all(effective_engine)
        with Session(effective_engine) as session:
            seed_customers_if_empty(session)
        yield

    app = FastAPI(
        title="ra-devextreme-grid FastAPI example",
        description="Reference backend for React-Admin DevExtreme remote data grid",
        version="0.1.0",
        lifespan=lifespan,
    )

    if cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(cors_origins),
            allow_credentials=False,
            allow_methods=["POST", "OPTIONS"],
            allow_headers=["Content-Type"],
        )

    if engine is not None:

        def get_custom_session() -> Generator[Session]:
            with Session(engine) as session:
                yield session

        app.dependency_overrides[get_session] = get_custom_session

    @app.exception_handler(GridQueryError)
    async def grid_query_error_handler(
        _request: Request, exc: GridQueryError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": [{"msg": str(exc), "type": "grid_query_error"}]},
        )

    @app.post(
        "/api/customers/grid",
        response_model=GridResponse,
        response_model_exclude_unset=True,
    )
    def customers_grid(
        request: GridRequest,
        session: Annotated[Session, Depends(get_session)],
    ) -> GridResponse:
        records, total_count, summary, group_count = execute_customer_grid_query(
            session=session, load_options=request.load_options
        )
        response_options: dict[str, Any] = {}
        if total_count is not None:
            response_options["total_count"] = total_count
        if summary is not None:
            response_options["summary"] = summary
        if group_count is not None:
            response_options["group_count"] = group_count
        return GridResponse.model_validate(
            {"data": records, **response_options},
            context={"load_options": request.load_options},
        )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app(cors_origins=LOCAL_DEVELOPMENT_ORIGINS)
