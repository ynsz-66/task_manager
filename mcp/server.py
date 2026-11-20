import os
from typing import Any

from mcp.server.fastmcp import FastMCP

import client

mcp = FastMCP("tasks_tools", host=os.environ.get("MCP_HOST", "127.0.0.1"), port=int(os.environ.get("MCP_PORT", 8000)))


@mcp.tool()
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
    """
    Update a task in the database. Only the provided fields are modified.
    A subtask follows its parent's category: changing it is refused.
    Setting done=True also checks all the task's subtasks; done=False only unchecks the task itself.
    With parent_id (the id of an existing task), moves the task and its subtasks under that task:
    they take the parent's category (`category` is ignored) and are checked if the parent is done.
    A task cannot be moved under itself or one of its own subtasks.
    position reorders the task: its 0-based index among its siblings (same parent, and same category
    for a root task, done ones included), the others shift. A task moved to another parent or category
    without position goes last.
    due_date sets the due date: ISO 8601 date and time with a timezone, e.g. 2026-11-21T09:00:00+01:00
    (Europe/Paris in winter). A push notification is sent to the user's phone when it is reached
    (once per due date: changing it re-arms the reminder). clear_due_date=True removes it.
    """
    return client.update_task(task_id, title, category, done, parent_id, position, due_date, clear_due_date)


@mcp.tool()
def delete_task(task_id: str) -> str:
    """
    Delete a task in the database, with all its subtasks.
    """
    client.delete_task(task_id)
    return f"Task {task_id} deleted"


@mcp.tool()
def create_task(
    title: str,
    category: str = "Other",
    parent_id: str | None = None,
    due_date: str | None = None,
) -> dict[str, Any]:
    """
    Create a task in the database, first among its siblings (top of its list).
    With parent_id (the id of an existing task), creates a subtask of that task
    instead; it takes the parent's category and `category` is ignored.
    Subtasks can be nested at any depth.
    due_date (optional) is an ISO 8601 date and time with a timezone, e.g. 2026-11-21T09:00:00+01:00:
    a push notification is sent to the user's phone when it is reached ("remind me to X tomorrow at 9").
    """
    return client.create_task(title, category, parent_id, due_date)


@mcp.tool()
def get_tasks() -> list[dict[str, Any]]:
    """
    Get all tasks in the database, as a flat list.
    Each task has a `parent` field: the id of its parent task for a subtask
    (any depth), or null for a root task. A done subtask stays under its parent.
    Sorted by `position`, the task's 0-based index among its siblings (same parent,
    and same category for a root task).
    """
    return client.get_tasks()


@mcp.tool()
def get_stats(days: int = 30, tz: str = "Europe/Paris") -> dict[str, Any]:
    """
    Get task statistics: donePerDay ([{date: YYYY-MM-DD in tz, count}]) and doneByCategory
    ([{category, count}]) for the tasks checked in the last `days` days (1 to 366), plus overdue
    (not-done tasks past their due date) and dueSoon (not-done tasks due within 24 hours).
    tz is an IANA timezone.
    """
    return client.get_stats(days, tz)


@mcp.tool()
def get_categories() -> list[dict[str, Any]]:
    """
    Get all categories in the database.
    """
    return client.get_categories()


@mcp.tool()
def update_category(
    category_id: str,
    name: str | None = None,
    order: int | None = None
) -> dict[str, Any]:
    """
    Update a category in the database.
    """
    return client.update_category(category_id, name, order)


@mcp.tool()
def delete_category_task(
    category_id: str
) -> dict[str, Any]:
    """
    Delete the not-done root tasks of one category (with their subtasks); done tasks are kept.
    Returns {"deletedCount": n}.
    """
    return client.delete_category_task(category_id)


@mcp.tool()
def get_category_task(
    category_id: str
) -> dict[str, Any]:
    """
    Get the not-done tasks of one category in the database, sorted by `position`, as {"tasks": [...]}.
    """
    return client.get_category_task(category_id)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
