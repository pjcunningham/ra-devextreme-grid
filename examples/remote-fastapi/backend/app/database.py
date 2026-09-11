import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy.engine import Engine
from sqlmodel import Session, create_engine

DEFAULT_DB_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_DB_FILE = DEFAULT_DB_DIR / "customers.db"
DEFAULT_DATABASE_URL = f"sqlite:///{DEFAULT_DB_FILE}"

_default_engine: Engine | None = None


def get_database_url() -> str:
    """Return database URL, checking GRID_DATABASE_URL environment override."""
    return os.environ.get("GRID_DATABASE_URL") or DEFAULT_DATABASE_URL


def get_default_engine() -> Engine:
    global _default_engine
    if _default_engine is None:
        db_url = get_database_url()
        if db_url == DEFAULT_DATABASE_URL:
            DEFAULT_DB_DIR.mkdir(parents=True, exist_ok=True)
        elif db_url.startswith("sqlite:///") and not db_url.startswith(
            "sqlite:///:memory:"
        ):
            db_path = Path(db_url.removeprefix("sqlite:///"))
            db_path.parent.mkdir(parents=True, exist_ok=True)
        _default_engine = create_engine(
            db_url,
            connect_args={"check_same_thread": False},
        )
    return _default_engine


def reset_default_engine() -> None:
    """Reset the cached default engine (useful for testing environment overrides)."""
    global _default_engine
    if _default_engine is not None:
        _default_engine.dispose()
        _default_engine = None


def get_session() -> Generator[Session]:
    engine = get_default_engine()
    with Session(engine) as session:
        yield session
