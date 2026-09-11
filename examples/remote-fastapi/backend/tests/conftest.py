from collections.abc import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.main import create_app
from app.seed import seed_customers_if_empty


@pytest.fixture
def test_engine() -> Generator[Engine]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    yield engine
    engine.dispose()


@pytest.fixture
def session(test_engine: Engine) -> Generator[Session]:
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session_instance:
        seed_customers_if_empty(session_instance)
        yield session_instance


@pytest.fixture
def app(test_engine: Engine) -> FastAPI:
    return create_app(engine=test_engine)


@pytest.fixture
def client(app: FastAPI) -> Generator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
