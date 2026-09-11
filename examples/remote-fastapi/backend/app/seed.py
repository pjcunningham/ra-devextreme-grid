from datetime import date, timedelta

from sqlmodel import Session, func, select

from app.models import Customer

FIRST_NAMES = [
    "Alice",
    "Bob",
    "Charlie",
    "David",
    "Emma",
    "Frank",
    "Grace",
    "Henry",
    "Isabella",
    "Jack",
]

LAST_NAMES = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Rodriguez",
    "Martinez",
]

COMPANIES = [
    "Acme Corp",
    "Globex",
    "Initech",
    "Umbrella Corp",
    "Hooli",
    "Soylent",
    "Massive Dynamic",
    "Stark Industries",
    "Wayne Enterprises",
    "Cyberdyne",
]

LOCATIONS = [
    ("New York", "USA"),
    ("San Francisco", "USA"),
    ("London", "UK"),
    ("Berlin", "Germany"),
    ("Munich", "Germany"),
    ("Paris", "France"),
    ("Tokyo", "Japan"),
    ("Toronto", "Canada"),
    ("Sydney", "Australia"),
    ("Sao Paulo", "Brazil"),
]


def generate_seed_customers(count: int = 100) -> list[Customer]:
    customers: list[Customer] = []
    base_date = date(2021, 1, 1)

    for i in range(count):
        first_name = FIRST_NAMES[i % len(FIRST_NAMES)]
        last_name = LAST_NAMES[(i // len(FIRST_NAMES)) % len(LAST_NAMES)]
        company = COMPANIES[(i * 3 + 1) % len(COMPANIES)]
        city, country = LOCATIONS[(i * 7 + 3) % len(LOCATIONS)]
        active = (i % 4) != 0
        age = (22 + ((i * 5) % 45)) if (i % 7 != 0) else None
        joined_on = base_date + timedelta(days=i * 14)

        customers.append(
            Customer(
                name=f"{first_name} {last_name}",
                company=company,
                city=city,
                country=country,
                active=active,
                age=age,
                joined_on=joined_on,
            )
        )

    return customers


def seed_customers_if_empty(session: Session) -> int:
    statement = select(func.count(Customer.id))
    existing_count = session.exec(statement).one()
    if existing_count > 0:
        return 0

    customers = generate_seed_customers(100)
    for customer in customers:
        session.add(customer)
    session.commit()
    return len(customers)
