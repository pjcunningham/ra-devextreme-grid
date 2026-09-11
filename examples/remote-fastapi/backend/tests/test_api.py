from fastapi.testclient import TestClient


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


def test_post_customers_grid_unknown_selector_422(client: TestClient):
    payload = {"loadOptions": {"sort": [{"selector": "password_hash", "desc": False}]}}
    response = client.post("/api/customers/grid", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
    assert any("password_hash" in str(err) for err in data["detail"])


def test_post_customers_grid_non_empty_filter_422(client: TestClient):
    payload = {"loadOptions": {"filter": ["country", "=", "USA"]}}
    response = client.post("/api/customers/grid", json=payload)
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
    assert any(
        "Remote filtering is not implemented" in str(err) for err in data["detail"]
    )
    assert any("Phase 7" in str(err) for err in data["detail"])


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
