from dataclasses import replace
from datetime import date

import pytest
from test_grid_grouping import AGE_SUMMARIES, CUSTOMERS, descriptors, leaf, load
from test_grid_grouping import grouped_session as grouped_session
from test_grid_summary_execution import capture_selects

from app.grid.fields import CUSTOMER_GRID_FIELDS


def test_four_depths_summarize_every_full_path_with_eight_statements(grouped_session):
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        response = load(
            grouped_session,
            group=descriptors("country", "company", "active", "joined_on"),
            filter=["id", ">", 0],
            groupSummary=AGE_SUMMARIES,
            totalSummary=AGE_SUMMARIES,
            requireTotalCount=True,
            requireGroupCount=True,
        )
    assert len(statements) == len(executed) == 8
    assert response["totalCount"] == 10
    assert response["groupCount"] == 4
    assert response["summary"] == [10, 150, 150 / 7, 0, 40]
    assert [len(statement._group_by_clauses) for statement in statements[3:7]] == [
        1,
        2,
        3,
        4,
    ]
    clause = statements[-1]._where_criteria[0]
    assert all(
        statement._where_criteria[0] is clause
        for statement in [*statements[:2], *statements[3:]]
    )
    assert statements[2].get_final_froms()[0].element._where_criteria[0] is clause

    def check_nodes(nodes, depth):
        ids = []
        for node in nodes:
            if depth == 4:
                assert isinstance(node["key"], str)
                assert date.fromisoformat(node["key"]).isoformat() == node["key"]
                child_ids = [row["id"] for row in node["items"]]
                assert node["items"] == [CUSTOMERS[id_] for id_ in child_ids]
            else:
                child_ids = check_nodes(node["items"], depth + 1)
            ages = [
                CUSTOMERS[id_]["age"]
                for id_ in child_ids
                if CUSTOMERS[id_]["age"] is not None
            ]
            assert node["summary"] == [
                len(child_ids),
                sum(ages),
                sum(ages) / len(ages) if ages else None,
                min(ages) if ages else None,
                max(ages) if ages else None,
            ]
            ids.extend(child_ids)
        return ids

    assert check_nodes(response["data"], 1) == [7, 3, 9, 1, 4, 5, 2, 8, 10, 6]


def test_binary_group_identity_overrides_case_insensitive_column_expression(
    grouped_session, monkeypatch
):
    field = CUSTOMER_GRID_FIELDS["country"]
    monkeypatch.setitem(
        CUSTOMER_GRID_FIELDS,
        "country",
        replace(field, expression=field.expression.collate("NOCASE")),
    )
    assert load(
        grouped_session,
        group=descriptors("country", desc=True),
        groupSummary=[{"summaryType": "count"}],
        requireGroupCount=True,
    ) == {
        "data": [
            leaf("US", [6, 10], [2]),
            leaf("UK", [1, 4, 5, 9], [4]),
            leaf("uk", [2, 8], [2]),
            leaf("DE", [3, 7], [2]),
        ],
        "groupCount": 4,
    }


@pytest.mark.parametrize("summary", [None, []])
def test_inactive_group_counts_and_summaries_are_omitted(grouped_session, summary):
    with capture_selects(grouped_session.get_bind()) as (statements, executed):
        response = load(
            grouped_session,
            group=descriptors("country"),
            groupSummary=summary,
            totalSummary=summary,
            requireTotalCount=False,
            requireGroupCount=False,
        )
    assert len(statements) == len(executed) == 1
    assert response == {
        "data": [
            leaf("DE", [3, 7]),
            leaf("UK", [1, 4, 5, 9]),
            leaf("uk", [2, 8]),
            leaf("US", [6, 10]),
        ]
    }


@pytest.mark.parametrize("active_only", [False, True])
def test_seed_country_company_http_evidence(client, active_only):
    options = {
        "group": descriptors("country", "company"),
        "groupSummary": [
            {"selector": "id", "summaryType": "count"},
            {"selector": "age", "summaryType": "avg"},
        ],
        "totalSummary": [
            {"selector": "id", "summaryType": "count"},
            {"selector": "age", "summaryType": "avg"},
        ],
        "requireTotalCount": True,
        "requireGroupCount": True,
    }
    if active_only:
        options["filter"] = ["active", "=", True]
    response = client.post("/api/customers/grid", json={"loadOptions": options})
    assert response.status_code == 200
    body = response.json()
    assert body["totalCount"] == body["summary"][0] == (75 if active_only else 100)
    assert body["groupCount"] == 8
    expected = [
        ("Australia", [("Massive Dynamic", 6)]),
        ("Brazil", [("Soylent", 9)]),
        ("Canada", [("Stark Industries", 3)]),
        ("France", [("Cyberdyne", 7)]),
        ("Germany", [("Acme Corp", 4), ("Globex", 1)]),
        ("Japan", [("Wayne Enterprises", 10)]),
        ("UK", [("Initech", 8)]),
        ("USA", [("Hooli", 2), ("Umbrella Corp", 5)]),
    ]
    assert [node["key"] for node in body["data"]] == [
        country for country, _ in expected
    ]
    all_ages = []
    for node, (_, companies) in zip(body["data"], expected, strict=True):
        assert [child["key"] for child in node["items"]] == [
            company for company, _ in companies
        ]
        country_ages = []
        country_count = 0
        for child, (_, first_id) in zip(node["items"], companies, strict=True):
            ids = [
                id_
                for id_ in range(first_id, 101, 10)
                if not active_only or (id_ - 1) % 4 != 0
            ]
            ages = [22 + ((id_ - 1) * 5) % 45 for id_ in ids if (id_ - 1) % 7 != 0]
            assert [row["id"] for row in child["items"]] == ids
            assert child["summary"] == [len(ids), sum(ages) / len(ages)]
            assert all(
                row["country"] == node["key"] and row["company"] == child["key"]
                for row in child["items"]
            )
            if active_only:
                assert all(row["active"] is True for row in child["items"])
            country_count += len(ids)
            country_ages.extend(ages)
        assert node["summary"] == [country_count, sum(country_ages) / len(country_ages)]
        all_ages.extend(country_ages)
    assert body["summary"][1] == sum(all_ages) / len(all_ages)
    print("SEED GROUP REQUEST:", options)
    print(
        "SEED GROUP RESPONSE COUNTS/TOTAL:",
        {key: value for key, value in body.items() if key != "data"},
    )
    print(
        "SEED GROUP RESPONSE KEY/SUMMARY PROJECTION:",
        [
            {
                "key": node["key"],
                "summary": node["summary"],
                "items": [
                    {
                        "key": child["key"],
                        "summary": child["summary"],
                        "ids": [row["id"] for row in child["items"]],
                    }
                    for child in node["items"]
                ],
            }
            for node in body["data"]
        ],
    )
    print("SEED COMPLETE UK GROUP RESPONSE:", body["data"][6])
