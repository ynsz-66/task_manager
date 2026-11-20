export interface Category {
  id: string
  name: string
}

export interface Task {
  id: string
  title: string
  /** Category id (ObjectId in MongoDB). */
  category: string
  done: boolean
  /** Parent task id for a subtask (any depth), null for a root task. */
  parent: string | null
  /** Index among its siblings (same parent, and same category for a root task). */
  position: number
  /** Due date (ISO 8601, UTC from the API); a reminder is sent once it is reached. Missing on old fixtures. */
  dueDate?: string | null
}

/** GET /api/stats: tasks checked per day (`date` YYYY-MM-DD in the requested timezone) and per category. */
export interface Stats {
  donePerDay: { date: string; count: number }[]
  /** `category` is null if the category was deleted. */
  doneByCategory: { category: string | null; count: number }[]
  overdue: number
  dueSoon: number
}
