from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue
from sqlalchemy import event
from sqlalchemy.exc import OperationalError

from app.main import LOCAL_DEVELOPMENT_ORIGINS, create_app


def nested_not_filter(depth: int) -> list[JsonValue]:
    expression: list[JsonValue] = ["country", "UK"]
    for _ in range(depth - 1):
        expression = ["!", expression]
    return expression


def test_post_customers_grid_success(client: TestClient):
    payload = {
        "loadOptions": {
            "skip": 0,
            "take": 10,
            "requireTotalCount": True,
            "sort": [
                {"selector": "country", "desc": False},
                {"selector": "name", "desc": False},
            ],
        }
    }
    response = client.post("/api/customers/grid", json=payload)
    assert response.status_code == 200
    assert "application/json" in response.headers["content-type"]

    data = response.json()
    assert "data" in data
    assert "totalCount" in data
    assert data["totalCount"] == 100
    assert len(data["data"]) == 10

    first_record = data["data"][0]
    expected_keys = {
        "id",
        "name",
        "company",
        "city",
        "country",
        "active",
        "age",
        "joined_on",
    }
    assert set(first_record.keys()) == expected_keys
    assert isinstance(first_record["id"], int)


def test_post_customers_grid_total_count_omitted(client: TestClient):
    # requireTotalCount omitted
    payload_omitted = {
        "loadOptions": {
            "skip": 0,
            "take": 5,
        }
    }
    response = client.post("/api/customers/grid", json=payload_omitted)
    assert response.status_code == 200
    data = response.json()
    assert "totalCount" not in data
    assert len(data["data"]) == 5

    # requireTotalCount false
    payload_false = {
        "loadOptions": {
            "skip": 0,
            "take": 5,
            "requireTotalCount": False,
        }
    }
    response_false = client.post("/api/customers/grid", json=payload_false)
    assert response_false.status_code == 200
    data_false = response_false.json()
    assert "totalCount" not in data_false
    assert len(data_false["data"]) == 5


@pytest.mark.parametrize(
    "count_options", [{}, {"requireTotalCount": False}, {"requireTotalCount": True}]
)
def test_summary_response_is_positional_filtered_and_count_independent(
    client, count_options
):
    response = client.post(
        "/api/customers/grid",
        json={
            "loadOptions": {
                "filter": ["country", "=", "UK"],
                "take": 5,
                **count_options,
                "totalSummary": [
                    {"selector": "age", "summaryType": "max"},
                    {"summaryType": "count"},
                    {"selector": "age", "summaryType": "avg"},
                    {"selector": "age", "summaryType": "min"},
                    {"selector": "age", "summaryType": "max"},
                ],
            }
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == [62, 10, 41.375, 22, 62]
    assert len(body["data"]) == 5
    assert all(row["country"] == "UK" for row in body["data"])
    assert body["data"][0]["age"] is None
    assert ("totalCount" in body) is bool(count_options.get("requireTotalCount"))
    if "totalCount" in body:
        assert body["totalCount"] == 10


@pytest.mark.parametrize(
    "summary_options", [{}, {"totalSummary": None}, {"totalSummary": []}]
)
def test_inactive_summary_response_omits_property(client, summary_options):
    response = client.post("/api/customers/grid", json={"loadOptions": summary_options})
    assert response.status_code == 200
    assert "summary" not in response.json()


def test_empty_summary_response_retains_null_positions(client):
    response = client.post(
        "/api/customers/grid",
        json={
            "loadOptions": {
                "filter": ["id", ">", 1000],
                "totalSummary": [
                    {"selector": "age", "summaryType": kind}
                    for kind in ["count", "sum", "avg", "min", "max"]
                ],
            }
        },
    )
    assert response.status_code == 200
    assert response.json() == {"data": [], "summary": [0, 0, None, None, None]}


@pytest.mark.parametrize(
    "load_options",
    [
        {"totalSummary": [{"summaryType": "custom", "selector": "age"}]},
        {"totalSummary": [{"summaryType": "count", "selector": None}]},
        {"totalSummary": [{"summaryType": "avg"}]},
        {"totalSummary": [{"summaryType": "count", "extra": True}]},
        {"totalSummary": [{"summaryType": "count"}] * 33},
        {"totalSummary": {"summaryType": "count"}},
        {
            "totalSummary": [
                {"summaryType": "count", "selector": "age; DROP TABLE customer"}
            ]
        },
        {"totalSummary": [{"summaryType": "sum", "selector": "__dict__"}]},
        {"totalSummary": [{"summaryType": "avg", "selector": "customer.age"}]},
        {"totalSummary": [{"summaryType": "max", "selector": "password_hash"}]},
        {"totalSummary": [{"summaryType": "min", "selector": "joined_on"}]},
        {
            "sort": [{"selector": "password_hash", "desc": False}],
            "totalSummary": [{"summaryType": "count"}],
        },
        {
            "filter": ["name", "between", ["a", "z"]],
            "totalSummary": [{"summaryType": "count"}],
        },
    ],
)
def test_invalid_summary_request_returns_422_before_sql(
    client, test_engine, load_options
):
    executed = []

    def record(_conn, _cursor, statement, _parameters, _context, _many):
        executed.append(statement)

    event.listen(test_engine, "before_cursor_execute", record)
    try:
        response = client.post(
            "/api/customers/grid",
            json={"loadOptions": {"requireTotalCount": True, **load_options}},
        )
    finally:
        event.remove(test_engine, "before_cursor_execute", record)
    assert response.status_code == 422
    assert response.json()["detail"]
    assert executed == []


def test_post_customers_grid_unknown_selector_422(client: TestClient):
    payload = {"loadOptions": {"sort": [{"selector": "password_hash", "desc": False}]}}
    response = client.post("/api/customers/grid", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
    assert any("password_hash" in str(err) for err in data["detail"])


@pytest.mark.parametrize(
    ("expression", "message"),
    [
        (["country"], "Invalid filter condition: expected two or three items"),
        (
            ["country", "=", "UK", "extra"],
            "Invalid filter condition: expected two or three items",
        ),
        ([1, "=", 1], "Invalid filter selector: expected a string"),
        (["password_hash", "secret"], "Unknown filter selector: 'password_hash'"),
        (["country.length", 2], "Unknown filter selector: 'country.length'"),
        (["country", 1, "UK"], "Invalid filter operator: expected a string"),
        (
            ["country", "like", "UK"],
            "Operator 'like' is not supported for string field 'country'",
        ),
        (
            ["age", "between", [20, 40]],
            "Operator 'between' is not supported for integer field 'age'",
        ),
        (
            ["age", "contains", 30],
            "Operator 'contains' is not supported for integer field 'age'",
        ),
        (["age", ">", "30"], "Invalid value for integer field 'age'"),
        (["age", "=", True], "Invalid value for integer field 'age'"),
        (["age", "=", 30.0], "Invalid value for integer field 'age'"),
        (["age", "=", 2**63], "Integer value is outside signed 64-bit range: 'age'"),
        (["active", "=", 1], "Invalid value for boolean field 'active'"),
        (["active", "=", "true"], "Invalid value for boolean field 'active'"),
        (["name", "=", 1], "Invalid value for string field 'name'"),
        (
            ["country", "=", None],
            "Null is not supported for operator '=' on field 'country'",
        ),
        (["age", ">", None], "Null is not supported for operator '>' on field 'age'"),
        (
            ["joined_on", "=", "2024-01-15T00:00:00Z"],
            "Invalid date for field 'joined_on': expected YYYY-MM-DD",
        ),
        (
            ["joined_on", "=", "2024-02-30"],
            "Invalid date for field 'joined_on': expected YYYY-MM-DD",
        ),
        (
            ["!", ["country", "UK"], ["active", True]],
            "Invalid unary NOT: expected exactly one expression",
        ),
        (["!", []], "Invalid filter expression: expected a nonempty array"),
        ([["country", "UK"], "and"], "Invalid filter group: trailing connector"),
        (
            [["country", "UK"], "xor", ["active", True]],
            "Invalid filter group: expected 'and', 'or' or expression",
        ),
        (
            [["country", "UK"], "and", ["active", True], "or", ["age", 30]],
            "Mixed AND/OR filter groups must be explicitly nested",
        ),
        (
            ["!", ["age", "=", 30]],
            "Unary NOT is not supported for nullable field 'age' "
            "because DevExtreme and SQL NULL semantics differ.",
        ),
        (
            ["!", [["country", "UK"], "or", ["age", "=", None]]],
            "Unary NOT is not supported for nullable field 'age' "
            "because DevExtreme and SQL NULL semantics differ.",
        ),
        pytest.param(
            nested_not_filter(17),
            "Filter exceeds maximum nesting depth (16)",
            id="depth-17",
        ),
        pytest.param(
            [["country", "UK"] for _ in range(200)],
            "Filter exceeds maximum expression nodes (200)",
            id="nodes-201",
        ),
        pytest.param(
            ["name", "contains", "x" * 1025],
            "Filter value exceeds maximum string length (1024)",
            id="string-1025",
        ),
    ],
)
def test_post_customers_grid_non_empty_filter_422(
    client: TestClient, expression: list[JsonValue], message: str
):
    payload = {"loadOptions": {"filter": expression, "requireTotalCount": True}}
    response = client.post("/api/customers/grid", json=payload)
    assert response.status_code == 422
    assert "application/json" in response.headers["content-type"]
    assert response.json() == {"detail": [{"msg": message, "type": "grid_query_error"}]}


@pytest.mark.parametrize(
    ("expression", "expected_ids", "expected_count"),
    [
        (["country", "=", "uk"], [8, 18, 28, 38, 48], 10),
        (["country", "UK"], [8, 18, 28, 38, 48], 10),
        (
            [["country", "UK"], "and", [["active", True], ["age", ">=", 30]]],
            [18, 48, 58, 68, 88],
            6,
        ),
        ([["active", True], ["id", "<=", 5]], [2, 3, 4], 3),
        ([["age", ">=", 60], ["id", "<=", 10]], [9], 1),
        (["joined_on", "2021-01-15"], [2], 1),
        (
            [["joined_on", ">=", "2021-01-15"], ["joined_on", "<", "2021-01-29"]],
            [2],
            1,
        ),
        ([["age", "=", None], ["id", "<=", 10]], [1, 8], 2),
        ([["age", "<>", None], ["id", "<=", 4]], [2, 3, 4], 3),
        ([["!", ["active", True]], ["id", "<=", 5]], [1, 5], 2),
        ([["id", 1], "or", [["id", 3], ["active", True]]], [1, 3], 2),
    ],
)
def test_post_customers_grid_filter_success(
    client: TestClient, expression: list[JsonValue], expected_ids, expected_count
):
    response = client.post(
        "/api/customers/grid",
        json={
            "loadOptions": {
                "filter": expression,
                "take": 5,
                "requireTotalCount": True,
            }
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"data", "totalCount"}
    assert [row["id"] for row in body["data"]] == expected_ids
    assert body["totalCount"] == expected_count


def test_post_customers_grid_filter_sort_page_repeated(client: TestClient):
    payload = {
        "loadOptions": {
            "filter": [["active", "=", True], "and", ["country", "=", "UK"]],
            "sort": [
                {"selector": "company", "desc": False},
                {"selector": "name", "desc": True},
            ],
            "skip": 5,
            "take": 5,
            "requireTotalCount": True,
        }
    }
    responses = [client.post("/api/customers/grid", json=payload) for _ in range(2)]
    for response in responses:
        assert response.status_code == 200
        body = response.json()
        assert [row["id"] for row in body["data"]] == [48, 18, 58, 78, 38]
        assert body["totalCount"] == 10
        assert all(
            row["active"] is True and row["country"] == "UK" for row in body["data"]
        )
    assert responses[0].json() == responses[1].json()


@pytest.mark.parametrize("count_options", [{}, {"requireTotalCount": False}])
def test_post_customers_grid_filtered_total_count_omitted(
    client: TestClient, count_options
):
    response = client.post(
        "/api/customers/grid",
        json={
            "loadOptions": {
                "filter": ["country", "UK"],
                "take": 5,
                **count_options,
            }
        },
    )
    assert response.status_code == 200
    assert set(response.json()) == {"data"}
    assert [row["id"] for row in response.json()["data"]] == [8, 18, 28, 38, 48]


@pytest.mark.parametrize("expression", [None, []])
def test_post_customers_grid_empty_filter_success(client: TestClient, expression):
    response = client.post(
        "/api/customers/grid",
        json={
            "loadOptions": {"filter": expression, "take": 5, "requireTotalCount": True}
        },
    )
    assert response.status_code == 200
    assert [row["id"] for row in response.json()["data"]] == [1, 2, 3, 4, 5]
    assert response.json()["totalCount"] == 100


@pytest.mark.parametrize(
    "count_options", [{}, {"requireTotalCount": False}, {"requireTotalCount": True}]
)
@pytest.mark.parametrize(
    ("expression", "skip", "expected_count"),
    [(["country", "Nowhere"], 0, 0), (["country", "UK"], 200, 10)],
)
def test_post_customers_grid_empty_filtered_page(
    client: TestClient, expression, skip, expected_count, count_options
):
    response = client.post(
        "/api/customers/grid",
        json={
            "loadOptions": {
                "filter": expression,
                "skip": skip,
                "take": 5,
                **count_options,
            }
        },
    )
    assert response.status_code == 200
    expected = {"data": []}
    if count_options.get("requireTotalCount"):
        expected["totalCount"] = expected_count
    assert response.json() == expected


@pytest.mark.parametrize(
    ("expression", "expected_ids", "expected_count"),
    [
        pytest.param(nested_not_filter(16), [1, 2, 3, 4, 5], 90, id="depth-16"),
        pytest.param(
            [["country", "UK"] for _ in range(199)],
            [8, 18, 28, 38, 48],
            10,
            id="nodes-200",
        ),
        pytest.param(["name", "=", "x" * 1024], [], 0, id="string-1024"),
    ],
)
def test_post_customers_grid_filter_limits_accepted(
    client: TestClient, expression, expected_ids, expected_count
):
    response = client.post(
        "/api/customers/grid",
        json={
            "loadOptions": {"filter": expression, "take": 5, "requireTotalCount": True}
        },
    )
    assert response.status_code == 200
    assert [row["id"] for row in response.json()["data"]] == expected_ids
    assert response.json()["totalCount"] == expected_count


@pytest.mark.parametrize(
    ("target", "error"),
    [
        (
            "app.main.execute_customer_grid_query",
            RuntimeError("private query failure"),
        ),
        (
            "app.main.execute_customer_grid_query",
            ValueError("private query value failure"),
        ),
        (
            "app.grid.query.compile_filter_expression",
            RuntimeError("private compiler failure"),
        ),
        (
            "app.grid.query.compile_filter_expression",
            ValueError("private compiler value failure"),
        ),
        (
            "sqlmodel.Session.exec",
            OperationalError("SELECT private_table", {}, RuntimeError("private DB")),
        ),
    ],
    ids=[
        "query-runtime",
        "query-value",
        "compiler-runtime",
        "compiler-value",
        "database",
    ],
)
def test_post_customers_grid_unexpected_exceptions_are_not_422(
    client: TestClient, target, error
):
    # The client lifespan has finished seeding before injecting endpoint failures.
    with patch(target, side_effect=error) as failing_call:
        with pytest.raises(type(error)) as exc_info:
            client.post(
                "/api/customers/grid",
                json={
                    "loadOptions": {
                        "filter": ["country", "UK"],
                        "requireTotalCount": True,
                    }
                },
            )
    assert exc_info.value is error
    failing_call.assert_called_once()


def test_post_customers_grid_extra_field_rejected_422(client: TestClient):
    # Extra field in loadOptions
    payload = {
        "loadOptions": {
            "skip": 0,
            "take": 10,
            "group": [{"selector": "country"}],
        }
    }
    response = client.post("/api/customers/grid", json=payload)
    assert response.status_code == 422

    # Extra field at root
    payload_root = {
        "loadOptions": {
            "skip": 0,
            "take": 10,
        },
        "extraRootField": "unexpected",
    }
    response_root = client.post("/api/customers/grid", json=payload_root)
    assert response_root.status_code == 422


def test_post_customers_grid_invalid_paging_422(client: TestClient):
    # Negative skip
    resp1 = client.post("/api/customers/grid", json={"loadOptions": {"skip": -1}})
    assert resp1.status_code == 422

    # Zero take
    resp2 = client.post("/api/customers/grid", json={"loadOptions": {"take": 0}})
    assert resp2.status_code == 422

    # Take exceeding maximum
    resp3 = client.post("/api/customers/grid", json={"loadOptions": {"take": 101}})
    assert resp3.status_code == 422


@pytest.mark.parametrize(
    "load_options",
    [
        {"filter": {"country": "UK"}},
        {"filter": "country=UK"},
        {"filter": True},
        {"sort": [{"selector": "country", "desc": False, "extra": True}]},
        {"groupSummary": [{"selector": "age", "summaryType": "sum"}]},
        {"totalSummary": [{"selector": "age", "summaryType": "custom"}]},
        {"requireGroupCount": True},
        {"searchValue": "UK"},
    ],
)
def test_post_customers_grid_wire_validation_unchanged(
    client: TestClient, load_options
):
    response = client.post("/api/customers/grid", json={"loadOptions": load_options})
    assert response.status_code == 422
    assert response.json()["detail"]
    assert all(
        error["type"] != "grid_query_error" for error in response.json()["detail"]
    )


def test_openapi_schema(client: TestClient):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()

    # Verify wire contract naming
    components = schema.get("components", {}).get("schemas", {})
    assert "GridRequest" in components
    assert "loadOptions" in components["GridRequest"]["properties"]

    assert "GridLoadOptions" in components
    assert "requireTotalCount" in components["GridLoadOptions"]["properties"]

    assert "GridResponse" in components
    assert "totalCount" in components["GridResponse"]["properties"]

    assert set(components["GridRequest"]["properties"]) == {"loadOptions"}
    assert set(components["GridLoadOptions"]["properties"]) == {
        "skip",
        "take",
        "requireTotalCount",
        "sort",
        "filter",
        "totalSummary",
    }
    assert set(components["GridSortDescriptor"]["properties"]) == {"selector", "desc"}
    assert set(components["GridSummaryDescriptor"]["properties"]) == {
        "selector",
        "summaryType",
    }
    for name in (
        "GridRequest",
        "GridLoadOptions",
        "GridSortDescriptor",
        "GridSummaryDescriptor",
    ):
        assert components[name]["additionalProperties"] is False
    assert set(components["GridResponse"]["properties"]) == {
        "data",
        "totalCount",
        "summary",
    }


def test_cors_development_origins_configured(test_engine):
    cors_app = create_app(
        engine=test_engine,
        cors_origins=LOCAL_DEVELOPMENT_ORIGINS,
    )
    with TestClient(cors_app) as cors_client:
        # Allowed origin 1: 127.0.0.1:5174 preflight
        preflight1 = cors_client.options(
            "/api/customers/grid",
            headers={
                "Origin": "http://127.0.0.1:5174",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert preflight1.status_code == 200
        assert (
            preflight1.headers.get("access-control-allow-origin")
            == "http://127.0.0.1:5174"
        )
        assert "POST" in preflight1.headers.get("access-control-allow-methods", "")
        assert (
            "content-type"
            in preflight1.headers.get("access-control-allow-headers", "").lower()
        )

        # Allowed origin 2: localhost:5174 preflight
        preflight2 = cors_client.options(
            "/api/customers/grid",
            headers={
                "Origin": "http://localhost:5174",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert preflight2.status_code == 200
        assert (
            preflight2.headers.get("access-control-allow-origin")
            == "http://localhost:5174"
        )

        # Allowed origin POST request
        post_resp = cors_client.post(
            "/api/customers/grid",
            json={"loadOptions": {"take": 1}},
            headers={"Origin": "http://127.0.0.1:5174"},
        )
        assert post_resp.status_code == 200
        assert (
            post_resp.headers.get("access-control-allow-origin")
            == "http://127.0.0.1:5174"
        )

        # Disallowed origin preflight
        disallowed_preflight = cors_client.options(
            "/api/customers/grid",
            headers={
                "Origin": "http://evil.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert "access-control-allow-origin" not in disallowed_preflight.headers

        # Disallowed origin POST
        disallowed_post = cors_client.post(
            "/api/customers/grid",
            json={"loadOptions": {"take": 1}},
            headers={"Origin": "http://evil.com"},
        )
        assert disallowed_post.status_code == 200
        assert "access-control-allow-origin" not in disallowed_post.headers


def test_cors_no_wildcards():
    assert "*" not in LOCAL_DEVELOPMENT_ORIGINS
    for origin in LOCAL_DEVELOPMENT_ORIGINS:
        assert origin in ("http://127.0.0.1:5174", "http://localhost:5174")


def test_cors_disabled_by_default(client: TestClient):
    # Default app in conftest has no cors_origins configured
    response = client.post(
        "/api/customers/grid",
        json={"loadOptions": {"take": 1}},
        headers={"Origin": "http://127.0.0.1:5174"},
    )
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_grid_database_url_env_override(monkeypatch, tmp_path):
    from app.database import (
        DEFAULT_DATABASE_URL,
        get_database_url,
        get_default_engine,
        reset_default_engine,
    )

    try:
        reset_default_engine()
        # Default when no env var
        monkeypatch.delenv("GRID_DATABASE_URL", raising=False)
        assert get_database_url() == DEFAULT_DATABASE_URL

        # Override via env var
        custom_db = tmp_path / "custom.db"
        custom_url = f"sqlite:///{custom_db}"
        monkeypatch.setenv("GRID_DATABASE_URL", custom_url)
        assert get_database_url() == custom_url

        engine = get_default_engine()
        assert str(engine.url) == custom_url
    finally:
        reset_default_engine()
