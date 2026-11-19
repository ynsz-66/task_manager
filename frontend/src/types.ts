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
}
