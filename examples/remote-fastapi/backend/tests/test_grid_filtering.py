from collections.abc import Generator
from dataclasses import replace
from datetime import date, datetime

import pytest
from sqlalchemy import inspect
from sqlalchemy.dialects import sqlite
from sqlalchemy.engine import Engine
from sqlalchemy.sql.elements import ColumnElement
from sqlmodel import Session, SQLModel, select

from app.grid.fields import CUSTOMER_GRID_FIELDS, GridQueryError, GridValueType
from app.grid.filtering import (
    MAX_FILTER_DEPTH,
    MAX_FILTER_NODES,
    MAX_FILTER_STRING_LENGTH,
    compile_filter_expression,
)
from app.models import Customer

OPERATORS = (
    "=",
    "<>",
    ">",
    ">=",
    "<",
    "<=",
    "contains",
    "notcontains",
    "startswith",
    "endswith",
)
ALLOWED_OPERATORS = {
    GridValueType.STRING: (
        "=",
        "<>",
        "contains",
        "notcontains",
        "startswith",
        "endswith",
    ),
    GridValueType.INTEGER: ("=", "<>", ">", ">=", "<", "<="),
    GridValueType.BOOLEAN: ("=", "<>"),
    GridValueType.DATE: ("=", "<>", ">", ">=", "<", "<="),
}
FIELD_CASES = (
    ("id", GridValueType.INTEGER, 2),
    ("name", GridValueType.STRING, "smith"),
    ("company", GridValueType.STRING, "parity"),
    ("city", GridValueType.STRING, "london"),
    ("country", GridValueType.STRING, "uk"),
    ("active", GridValueType.BOOLEAN, True),
    ("age", GridValueType.INTEGER, 30),
    ("joined_on", GridValueType.DATE, "2024-01-15"),
)
ALLOWED_CASES = [
    pytest.param(selector, operator, value, id=f"{selector}-{operator}")
    for selector, value_type, value in FIELD_CASES
    for operator in ALLOWED_OPERATORS[value_type]
]
WRONG_VALUES = {
    GridValueType.STRING: (True, False, 0, 1, 1.5, [], {}),
    GridValueType.INTEGER: (True, False, 0.0, 30.0, "30", "", "true", [], {}),
    GridValueType.BOOLEAN: (0, 1, 0.0, 1.0, "true", "false", "", [], {}),
    GridValueType.DATE: (
        True,
        False,
        20240115,
        2024.0115,
        [],
        {},
        date(2024, 1, 15),
        datetime(2024, 1, 15),
    ),
}


@pytest.fixture
def filter_session(test_engine: Engine) -> Generator[Session]:
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session_instance:
        session_instance.add_all(
            Customer(
                id=customer_id,
                name=name,
                company="Parity",
                city="London",
                country=country,
                active=active,
                age=age,
                joined_on=date(2024, 1, day),
            )
            for customer_id, name, age, active, country, day in (
                (1, "Smith", None, True, "UK", 14),
                (2, "SMITH", 30, False, "UK", 15),
                (3, "Jones", 40, True, "France", 16),
                (4, "sm%_ith", 20, False, "USA", 17),
            )
        )
        session_instance.commit()
        yield session_instance


def _matching_ids(session, expression, fields=CUSTOMER_GRID_FIELDS):
    predicate = compile_filter_expression(expression, fields)
    statement = select(Customer.id).order_by(Customer.id)
    if predicate is not None:
        statement = statement.where(predicate)
    return list(session.exec(statement).all())


def _add_literal_customer(session: Session, value: str):
    session.add(
        Customer(
            id=5,
            name=value,
            company="Literal",
            city="Paris",
            country=value,
            active=True,
            age=50,
            joined_on=date(2024, 1, 18),
        )
    )
    session.commit()


@pytest.mark.parametrize("expression", [None, []])
def test_empty_filter_returns_none(expression):
    assert compile_filter_expression(expression, CUSTOMER_GRID_FIELDS) is None


@pytest.mark.parametrize("selector,operator,value", ALLOWED_CASES)
def test_every_allowed_field_operator_pair(selector, operator, value):
    predicate = compile_filter_expression(
        [selector, operator, value], CUSTOMER_GRID_FIELDS
    )
    assert isinstance(predicate, ColumnElement)


@pytest.mark.parametrize(
    "selector,operator,value",
    [
        pytest.param(selector, operator, value, id=f"{selector}-{operator}")
        for selector, value_type, value in FIELD_CASES
        for operator in OPERATORS
        if operator not in ALLOWED_OPERATORS[value_type]
    ],
)
def test_every_prohibited_field_operator_pair(selector, operator, value):
    with pytest.raises(GridQueryError):
        compile_filter_expression([selector, operator, value], CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize("selector,value_type,value", FIELD_CASES)
def test_shorthand_accepts_each_field_type(selector, value_type, value):
    assert CUSTOMER_GRID_FIELDS[selector].value_type is value_type
    assert isinstance(
        compile_filter_expression([selector, value], CUSTOMER_GRID_FIELDS),
        ColumnElement,
    )


@pytest.mark.parametrize(
    "selector,operator,value",
    [
        pytest.param(
            selector,
            operator,
            value,
            id=f"{selector}-{operator}-{type(value).__name__}-{index}",
        )
        for selector, value_type, _ in FIELD_CASES
        for operator in ALLOWED_OPERATORS[value_type]
        for index, value in enumerate(WRONG_VALUES[value_type])
    ],
)
def test_values_are_not_coerced(selector, operator, value):
    with pytest.raises(GridQueryError):
        compile_filter_expression([selector, operator, value], CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize("selector,value_type,value", FIELD_CASES)
@pytest.mark.parametrize("operator", OPERATORS)
def test_null_is_only_allowed_for_nullable_equality(
    selector, value_type, value, operator
):
    if selector == "age" and operator in ("=", "<>"):
        predicate = compile_filter_expression(
            [selector, operator, None], CUSTOMER_GRID_FIELDS
        )
        assert isinstance(predicate, ColumnElement)
        assert not predicate.compile().params
    else:
        with pytest.raises(GridQueryError):
            compile_filter_expression([selector, operator, None], CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize("selector,value_type,value", FIELD_CASES)
def test_null_shorthand_uses_nullable_equality(selector, value_type, value):
    if selector == "age":
        assert isinstance(
            compile_filter_expression([selector, None], CUSTOMER_GRID_FIELDS),
            ColumnElement,
        )
    else:
        with pytest.raises(GridQueryError):
            compile_filter_expression([selector, None], CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize("selector", ["id", "age"])
@pytest.mark.parametrize("operator", ALLOWED_OPERATORS[GridValueType.INTEGER])
@pytest.mark.parametrize("value", [-(2**63), 2**63 - 1])
def test_signed_64_bit_integer_boundaries_are_accepted(selector, operator, value):
    predicate = compile_filter_expression(
        [selector, operator, value], CUSTOMER_GRID_FIELDS
    )
    assert list(predicate.compile().params.values()) == [value]


@pytest.mark.parametrize("selector", ["id", "age"])
@pytest.mark.parametrize("operator", ALLOWED_OPERATORS[GridValueType.INTEGER])
@pytest.mark.parametrize("value", [-(2**63) - 1, 2**63])
def test_out_of_range_integers_are_rejected(selector, operator, value):
    with pytest.raises(GridQueryError):
        compile_filter_expression([selector, operator, value], CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize("operator", ALLOWED_OPERATORS[GridValueType.DATE])
@pytest.mark.parametrize(
    "value,expected",
    [
        ("0001-01-01", date(1, 1, 1)),
        ("9999-12-31", date(9999, 12, 31)),
        ("2024-01-15", date(2024, 1, 15)),
        ("2024-02-29", date(2024, 2, 29)),
        ("2000-02-29", date(2000, 2, 29)),
    ],
)
def test_dates_are_bound_as_dates(operator, value, expected):
    predicate = compile_filter_expression(
        ["joined_on", operator, value], CUSTOMER_GRID_FIELDS
    )
    bound_values = list(predicate.compile().params.values())
    assert bound_values == [expected]
    assert type(bound_values[0]) is date


@pytest.mark.parametrize("operator", ALLOWED_OPERATORS[GridValueType.DATE])
@pytest.mark.parametrize(
    "value",
    [
        "",
        "20240115",
        "2024-W03-1",
        "2024-015",
        "2024-1-15",
        "2024-01-5",
        "24-01-15",
        "2024/01/15",
        "2024-01-15T00:00:00",
        "2024-01-15T00:00:00Z",
        "2024-01-15 00:00:00",
        " 2024-01-15",
        "2024-01-15 ",
        "2024-01-15\n",
        "\t2024-01-15",
        "２０２４-０１-１５",
        "٢٠٢٤-٠١-١٥",
        "2024–01–15",
        "0000-01-01",
        "10000-01-01",
        "2024-00-15",
        "2024-13-15",
        "2024-01-00",
        "2024-01-32",
        "2024-04-31",
        "2023-02-29",
        "1900-02-29",
        "2024-02-30",
    ],
)
def test_noncanonical_or_impossible_dates_are_rejected(operator, value):
    with pytest.raises(GridQueryError):
        compile_filter_expression(["joined_on", operator, value], CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize("selector", ["name", "company", "city", "country"])
@pytest.mark.parametrize("operator", ALLOWED_OPERATORS[GridValueType.STRING])
@pytest.mark.parametrize("value", ["", "x" * 1024, "é" * 1024])
def test_string_length_boundary_is_accepted(selector, operator, value):
    assert MAX_FILTER_STRING_LENGTH == 1024
    assert isinstance(
        compile_filter_expression([selector, operator, value], CUSTOMER_GRID_FIELDS),
        ColumnElement,
    )


@pytest.mark.parametrize("selector", ["name", "company", "city", "country"])
@pytest.mark.parametrize("operator", ALLOWED_OPERATORS[GridValueType.STRING])
@pytest.mark.parametrize("value", ["x" * 1025, "é" * 1025])
def test_overlong_strings_are_rejected(selector, operator, value):
    with pytest.raises(GridQueryError):
        compile_filter_expression([selector, operator, value], CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize(
    "selector",
    [
        "",
        "unknown",
        "Name",
        " name",
        "name ",
        "customer.name",
        "name.length",
        "joined_on.year",
        "lower(name)",
        "name__contains",
        "name__icontains",
        "__dict__",
        "__class__",
        "__proto__",
        "constructor",
        "name\x00",
        "name; DROP TABLE customer; --",
        "name' OR 1=1 --",
        None,
        True,
        False,
        1,
        1.5,
        [],
        {},
        ["name"],
    ],
)
def test_unknown_hostile_or_non_string_selectors_are_rejected(selector):
    with pytest.raises(GridQueryError):
        compile_filter_expression([selector, "=", "smith"], CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize("selector,value_type,value", FIELD_CASES)
@pytest.mark.parametrize("suffix", ["eq", "neq", "gt", "gte", "lt", "lte", "q"])
def test_managed_filter_suffixes_are_not_backend_selectors(
    selector, value_type, value, suffix
):
    with pytest.raises(GridQueryError):
        compile_filter_expression(
            [f"{selector}_{suffix}", "=", value], CUSTOMER_GRID_FIELDS
        )


@pytest.mark.parametrize("selector,value_type,value", FIELD_CASES)
@pytest.mark.parametrize(
    "operator",
    [
        "",
        "==",
        "!=",
        "eq",
        "in",
        "between",
        "like",
        "ilike",
        "is",
        "isnot",
        "CONTAINS",
        "Contains",
        " =",
        "= ",
        "or 1=1 --",
        None,
        True,
        1,
        [],
        {},
    ],
)
def test_invalid_operators_are_rejected(selector, value_type, value, operator):
    with pytest.raises(GridQueryError):
        compile_filter_expression([selector, operator, value], CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize(
    "expression",
    [
        "country",
        0,
        False,
        {},
        {"selector": "country", "value": "UK"},
        ["country"],
        ["country", "=", "UK", "extra"],
        ["country", "=", "UK", "extra", "extra"],
    ],
)
def test_malformed_conditions_are_rejected(expression):
    with pytest.raises(GridQueryError):
        compile_filter_expression(expression, CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize("sortable", [True, False])
@pytest.mark.parametrize("filterable", [True, False])
def test_filterability_is_independent_of_sortability(sortable, filterable):
    fields = {
        "country": replace(
            CUSTOMER_GRID_FIELDS["country"], sortable=sortable, filterable=filterable
        )
    }
    if filterable:
        assert isinstance(
            compile_filter_expression(["country", "=", "UK"], fields), ColumnElement
        )
    else:
        with pytest.raises(GridQueryError):
            compile_filter_expression(["country", "=", "UK"], fields)


@pytest.mark.parametrize("operator", ["=", "<>"])
def test_string_equality_lowers_both_sql_operands(operator):
    predicate = compile_filter_expression(
        ["name", operator, "sMiTh"], CUSTOMER_GRID_FIELDS
    )
    compiled = predicate.compile(dialect=sqlite.dialect())
    sql = str(compiled).lower()
    assert "lower(customer.name)" in sql
    assert sql.count("lower(") == 2
    assert list(compiled.params.values()) == ["sMiTh"]


@pytest.mark.parametrize(
    "selector,operator,value",
    ALLOWED_CASES
    + [
        pytest.param("active", "=", False, id="active-equals-false"),
        pytest.param("active", "<>", False, id="active-not-equals-false"),
    ],
)
def test_every_non_null_value_is_bound(selector, operator, value):
    predicate = compile_filter_expression(
        [selector, operator, value], CUSTOMER_GRID_FIELDS
    )
    compiled = predicate.compile(dialect=sqlite.dialect())
    expected = date.fromisoformat(value) if selector == "joined_on" else value
    bound_values = list(compiled.params.values())
    assert bound_values == [expected]
    assert type(bound_values[0]) is type(expected)
    assert "?" in str(compiled)


@pytest.mark.parametrize("expression", [None, []])
def test_empty_filter_selects_all_parity_rows(filter_session: Session, expression):
    assert _matching_ids(filter_session, expression) == [1, 2, 3, 4]


@pytest.mark.parametrize(
    "expression,expected",
    [
        (["name", "=", "sMiTh"], [1, 2]),
        (["name", "<>", "sMiTh"], [3, 4]),
        (["name", "contains", "MiT"], [1, 2]),
        (["name", "notcontains", "MiT"], [3, 4]),
        (["name", "startswith", "SM"], [1, 2, 4]),
        (["name", "endswith", "ITH"], [1, 2, 4]),
        (["name", "contains", "sm%"], [4]),
        (["name", "contains", "%_"], [4]),
        (["name", "notcontains", "%_"], [1, 2, 3]),
        (["name", "startswith", "SM%"], [4]),
        (["name", "endswith", "_ITH"], [4]),
        (["age", "=", 30], [2]),
        (["age", "<>", 30], [3, 4]),
        (["age", ">", 30], [3]),
        (["age", ">=", 30], [2, 3]),
        (["age", "<", 30], [4]),
        (["age", "<=", 30], [2, 4]),
        (["id", "=", 2], [2]),
        (["id", "<>", 2], [1, 3, 4]),
        (["id", ">", 2], [3, 4]),
        (["id", ">=", 2], [2, 3, 4]),
        (["id", "<", 2], [1]),
        (["id", "<=", 2], [1, 2]),
        (["active", "=", True], [1, 3]),
        (["active", "<>", True], [2, 4]),
        (["active", "=", False], [2, 4]),
        (["active", "<>", False], [1, 3]),
        (["joined_on", "=", "2024-01-15"], [2]),
        (["joined_on", "<>", "2024-01-15"], [1, 3, 4]),
        (["joined_on", ">", "2024-01-15"], [3, 4]),
        (["joined_on", ">=", "2024-01-15"], [2, 3, 4]),
        (["joined_on", "<", "2024-01-15"], [1]),
        (["joined_on", "<=", "2024-01-15"], [1, 2]),
        (["age", "=", None], [1]),
        (["age", "<>", None], [2, 3, 4]),
        (["age", None], [1]),
        (["id", 2], [2]),
        (["name", "sMiTh"], [1, 2]),
        (["company", "pArItY"], [1, 2, 3, 4]),
        (["city", "lOnDoN"], [1, 2, 3, 4]),
        (["country", "uK"], [1, 2]),
        (["active", True], [1, 3]),
        (["age", 30], [2]),
        (["joined_on", "2024-01-15"], [2]),
        (["name", "=", ""], []),
        (["name", "<>", ""], [1, 2, 3, 4]),
        (["name", "contains", ""], [1, 2, 3, 4]),
        (["name", "notcontains", ""], []),
        (["name", "startswith", ""], [1, 2, 3, 4]),
        (["name", "endswith", ""], [1, 2, 3, 4]),
    ],
)
def test_conditions_execute_in_sql(filter_session: Session, expression, expected):
    assert _matching_ids(filter_session, expression) == expected


@pytest.mark.parametrize(
    "value", [*OPERATORS, "and", "or", "!", "not", "= ", "CONTAINS"]
)
def test_operator_looking_shorthand_values_are_literal(filter_session: Session, value):
    _add_literal_customer(filter_session, value)
    assert _matching_ids(filter_session, ["country", value]) == [5]
    assert _matching_ids(filter_session, ["country", "=", value]) == [5]


@pytest.mark.parametrize(
    "operator", ["contains", "notcontains", "startswith", "endswith"]
)
@pytest.mark.parametrize("value", ["%", "_", "/", "/%_", "\\"])
def test_search_metacharacters_are_escaped_literals(
    filter_session: Session, operator, value
):
    _add_literal_customer(filter_session, value)
    expression = ["name", operator, value]
    predicate = compile_filter_expression(expression, CUSTOMER_GRID_FIELDS)
    compiled = predicate.compile(dialect=sqlite.dialect())
    escaped = value.replace("/", "//").replace("%", "/%").replace("_", "/_")
    assert list(compiled.params.values()) == [escaped]
    assert "ESCAPE '/'" in str(compiled)
    if operator == "notcontains":
        expected = [1, 2, 3] if value in ("%", "_") else [1, 2, 3, 4]
    elif operator == "contains" and value in ("%", "_"):
        expected = [4, 5]
    else:
        expected = [5]
    assert _matching_ids(filter_session, expression) == expected


@pytest.mark.parametrize("operator", ALLOWED_OPERATORS[GridValueType.STRING])
@pytest.mark.parametrize(
    "value",
    ["O'Reilly", "x' OR 1=1 --", "x'; DROP TABLE customer; --"],
)
def test_hostile_text_is_bound_literal_and_table_remains_intact(
    filter_session: Session, operator, value
):
    _add_literal_customer(filter_session, value)
    expression = ["name", operator, value]
    predicate = compile_filter_expression(expression, CUSTOMER_GRID_FIELDS)
    compiled = predicate.compile(dialect=sqlite.dialect())
    assert value not in str(compiled)
    bound_values = list(compiled.params.values())
    assert len(bound_values) == 1
    assert bound_values[0].lower() == value.lower()
    expected = [1, 2, 3, 4] if operator in ("<>", "notcontains") else [5]
    assert _matching_ids(filter_session, expression) == expected
    assert inspect(filter_session.get_bind()).has_table("customer")
    assert _matching_ids(filter_session, None) == [1, 2, 3, 4, 5]
    assert filter_session.get(Customer, 5).name == value


def test_supplied_mapping_controls_selector_and_expression(filter_session: Session):
    fields = {"alias": replace(CUSTOMER_GRID_FIELDS["country"], sortable=False)}
    assert _matching_ids(filter_session, ["alias", "=", "uK"], fields) == [1, 2]
    with pytest.raises(GridQueryError):
        compile_filter_expression(["country", "=", "UK"], fields)


@pytest.mark.parametrize(
    "expression, expected",
    [
        ([["age", ">=", 30], "and", ["active", True]], [3]),
        ([["age", ">=", 30], ["active", True]], [3]),
        ([["age", ">=", 30], "and", ["active", True], ["country", "France"]], [3]),
        ([["age", ">=", 30], "and", ["active", True], "and", ["id", 3]], [3]),
        ([["country", "UK"], "or", ["country", "France"]], [1, 2, 3]),
        ([["id", 1], "or", ["id", 3], "or", ["id", 4]], [1, 3, 4]),
        ([[["active", True]]], [1, 3]),
        (["!", ["active", True]], [2, 4]),
        (["!", ["!", ["active", True]]], [1, 3]),
        (["!", [["country", "UK"], "or", ["country", "France"]]], [4]),
        (["!", ["country", "="]], [1, 2, 3, 4]),
        ([["!", ["active", True]], "or", ["age", None]], [1, 2, 4]),
        (
            [
                ["active", True],
                "and",
                [
                    ["country", "UK"],
                    "or",
                    [["country", "France"], "and", ["age", ">=", 40]],
                ],
            ],
            [1, 3],
        ),
        (
            [
                ["joined_on", ">=", "2024-01-15"],
                "and",
                ["joined_on", "<", "2024-01-16"],
            ],
            [2],
        ),
        (
            [["joined_on", "<", "2024-01-15"], "or", ["joined_on", ">=", "2024-01-16"]],
            [1, 3, 4],
        ),
        (
            [
                ["joined_on", ">=", "2024-01-15"],
                "and",
                ["joined_on", "<", "2024-01-18"],
            ],
            [2, 3, 4],
        ),
    ],
)
def test_boolean_expressions_execute_in_sql(filter_session, expression, expected):
    assert _matching_ids(filter_session, expression) == expected


@pytest.mark.parametrize(
    "expression",
    [
        [[]],
        [[[]]],
        ["!"],
        ["!", []],
        ["!", "not-an-expression"],
        ["!", ["active", True], ["id", 1]],
        [["active", True], "and"],
        [["active", True], "or"],
        ["and", ["active", True]],
        ["or", ["active", True]],
        [["id", 1], "and", "and", ["id", 2]],
        [["id", 1], "or", "and", ["id", 2]],
        [["id", 1], "and", None],
        [["id", 1], 3],
        [["id", 1], {}],
        [["id", 1], [123, "=", 2]],
        [["id", 1], "and", ["id", 2], "or", ["id", 3]],
        [["id", 1], ["id", 2], "or", ["id", 3]],
        [["id", 1], "or", ["id", 2], ["id", 3]],
        [["id", 1], "and", []],
    ]
    + [
        [["id", 1], token, ["id", 2]]
        for token in ("xor", "&&", "||", "AND", "OR", "!", "")
    ],
)
def test_malformed_boolean_expressions_fail_deliberately(expression):
    with pytest.raises(GridQueryError):
        compile_filter_expression(expression, CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize(
    "child",
    [
        ["age", ">", 30],
        ["age", None],
        ["age", "<>", None],
        [["active", True], "and", ["age", 30]],
        [["age", "<>", None], "and", ["age", ">", 30]],
        [["id", 1], "or", [["active", True], "and", ["age", 30]]],
        [[["age", None]]],
        ["!", ["age", ">", 30]],
    ],
)
def test_not_rejects_every_nullable_reference(child):
    with pytest.raises(
        GridQueryError, match="nullable field 'age'.*NULL semantics differ"
    ):
        compile_filter_expression(["!", child], CUSTOMER_GRID_FIELDS)


def _wrapped_expression(depth):
    expression = ["id", 1]
    for _ in range(depth - 1):
        expression = [expression]
    return expression


@pytest.mark.parametrize("depth", [1, MAX_FILTER_DEPTH - 1, MAX_FILTER_DEPTH])
def test_depth_budget_includes_root_and_wrappers(filter_session, depth):
    assert _matching_ids(filter_session, _wrapped_expression(depth)) == [1]


def test_depth_budget_rejects_before_python_recursion_limit():
    for depth in (MAX_FILTER_DEPTH + 1, 1500):
        with pytest.raises(GridQueryError, match="maximum nesting depth"):
            compile_filter_expression(_wrapped_expression(depth), CUSTOMER_GRID_FIELDS)
    cyclic = []
    cyclic.append(cyclic)
    with pytest.raises(GridQueryError, match="maximum nesting depth"):
        compile_filter_expression(cyclic, CUSTOMER_GRID_FIELDS)


@pytest.mark.parametrize("nodes", [MAX_FILTER_NODES - 1, MAX_FILTER_NODES])
def test_node_budget_includes_group_root(filter_session, nodes):
    assert _matching_ids(filter_session, [["id", 1] for _ in range(nodes - 1)]) == [1]


def test_node_budget_counts_wrappers_and_not(filter_session):
    expression = [["id", 1] for _ in range(MAX_FILTER_NODES - 3)]
    expression.append(["!", ["active", False]])
    assert _matching_ids(filter_session, expression) == [1]
    with pytest.raises(GridQueryError, match="maximum expression nodes"):
        compile_filter_expression([expression], CUSTOMER_GRID_FIELDS)


def test_over_node_budget_stops_before_building_next_condition(monkeypatch):
    from app.grid import filtering

    calls = []
    original = filtering._compile_condition

    def tracked(expression, fields):
        calls.append(expression)
        return original(expression, fields)

    monkeypatch.setattr(filtering, "_compile_condition", tracked)
    for size in (MAX_FILTER_NODES, 10000):
        calls.clear()
        with pytest.raises(GridQueryError, match="maximum expression nodes"):
            compile_filter_expression([["id", 1]] * size, CUSTOMER_GRID_FIELDS)
        assert len(calls) == MAX_FILTER_NODES - 1
