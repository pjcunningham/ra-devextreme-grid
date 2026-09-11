from collections.abc import Generator
from pathlib import Path

from sqlalchemy.engine import Engine
from sqlmodel import Session, create_engine

DEFAULT_DB_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_DB_FILE = DEFAULT_DB_DIR / "customers.db"
DEFAULT_DATABASE_URL = f"sqlite:///{DEFAULT_DB_FILE}"

_default_engine: Engine | None = None


def get_default_engine() -> Engine:
    global _default_engine
    if _default_engine is None:
        DEFAULT_DB_DIR.mkdir(parents=True, exist_ok=True)
        _default_engine = create_engine(
            DEFAULT_DATABASE_URL,
            connect_args={"check_same_thread": False},
        )
    return _default_engine


def get_session() -> Generator[Session]:
    engine = get_default_engine()
    with Session(engine) as session:
        yield session
