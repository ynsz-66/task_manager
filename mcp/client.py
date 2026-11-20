from typing import Any
import os

import httpx
from dotenv import load_dotenv

load_dotenv()

API_URL = os.environ.get("API_URL", "http://localhost:3000/api")
API_TOKEN = os.environ.get("API_TOKEN", "")

http = httpx.Client(
    base_url=API_URL,
    headers={"Authorization": f"Bearer {API_TOKEN}"} if API_TOKEN != "" else None,
    timeout=10.0,
)


def raise_for_api_error(response: httpx.Response) -> None:
    """Raise with the API's own error message (e.g. "404 Not Found: task not found")."""
    if response.is_error:
        try:
            detail = response.json().get("error", response.text)
        except ValueError:
            detail = response.text
        raise ValueError(f"{response.status_code} {response.reason_phrase}: {detail}")


def get_categories() -> list[dict[str, Any]]:
    response = http.get("/categories")
    raise_for_api_error(response)
    return response.json()

def update_category(
    category_id: str,
    name: str | None = None,
    order: int | None = None
) -> dict[str, Any]:
    fields = {"name": name, "order": order}
    body = {key: value for key, value in fields.items() if value is not None}
    response = http.patch(f"/categories/{category_id}", json=body)
    raise_for_api_error(response)
    return response.json()


def get_tasks() -> list[dict[str, Any]]:
    response = http.get("/tasks")
    raise_for_api_error(response)
    return response.json()


def create_task(
    title: str,
    category: str = "Other",
    parent_id: str | None = None,
    due_date: str | None = None,
) -> dict[str, Any]:
    due = {"dueDate": due_date} if due_date is not None else {}
    if parent_id is not None:
        response = http.post("/tasks", json={"title": title, "parent": parent_id, **due})
        raise_for_api_error(response)
        return response.json()
    res = http.get("/categories")
    raise_for_api_error(res)
    categories = res.json()
    id = next((c["id"] for c in categories if c["name"] == category), None)
    if id is None:
        raise ValueError(f"Category '{category}' not found.")
    response = http.post("/tasks", json={"title": title, "category": id, **due})
    raise_for_api_error(response)
    return response.json()


def update_task(
    task_id: str,
    title: str | None = None,
    category: str | None = None,
    done: bool | None = None,
    parent_id: str | None = None,
    position: int | None = None,
    due_date: str | None = None,
    clear_due_date: bool = False,
) -> dict[str, Any]:
    category_id = None
    # Under a parent, the backend ignores the category.
    if category is not None and parent_id is None:
        res = http.get("/categories")
        raise_for_api_error(res)
        categories = res.json()
        category_id = next((c["id"] for c in categories if c["name"] == category), None)
        if category_id is None:
            raise ValueError(f"Category '{category}' not found.")
    fields = {"title": title, "category": category_id, "done": done, "parent": parent_id, "position": position}
    body = {key: value for key, value in fields.items() if value is not None}
    # None means "not sent" here, so removing the due date needs its own flag.
    if clear_due_date:
        body["dueDate"] = None
    elif due_date is not None:
        body["dueDate"] = due_date
    response = http.patch(f"/tasks/{task_id}", json=body)
    raise_for_api_error(response)
    return response.json()


def get_stats(days: int = 30, tz: str = "Europe/Paris") -> dict[str, Any]:
    response = http.get("/stats", params={"days": days, "tz": tz})
    raise_for_api_error(response)
    return response.json()


def delete_task(task_id: str) -> None:
    response = http.delete(f"/tasks/{task_id}")
    raise_for_api_error(response)


def delete_category_task(
    category_id: str
) -> dict[str, Any]:
    response = http.delete(f"/categories/{category_id}/tasks")
    raise_for_api_error(response)
    return response.json()


def get_category_task(
    category_id: str
) -> dict[str, Any]:
    response = http.get(f"/categories/{category_id}/tasks")
    raise_for_api_error(response)
    return response.json()
