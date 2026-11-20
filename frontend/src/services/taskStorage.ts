import type { Category, Stats, Task } from '../types'
import { api } from './api'

/**
 * Data access layer. The UI only goes through this interface,
 * never directly through the API.
 */
/**
 * `parent`: null detaches a subtask, a task id moves the task under it (it takes that task's category).
 * `position`: index among the task's siblings; the backend shifts the others.
 */
export type TaskChanges = Partial<Pick<Task, 'title' | 'category' | 'done' | 'parent' | 'position' | 'dueDate'>>

export interface TaskStorage {
  /** Sorted by position (then creation date). */
  getAll(): Promise<Task[]>
  getCategories(): Promise<Category[]>
  createCategory(name: string): Promise<Category>
  removeCategory(id: string): Promise<void>
  /** `order` is the new index among the movable categories; the backend shifts the others. */
  updateCategory(id: string, changes: { name?: string; order?: number }): Promise<Category>
  /** With a `parentId`, creates a subtask (the backend gives it the parent's category). */
  create(title: string, categoryId: string, parentId?: string): Promise<Task>
  update(id: string, changes: TaskChanges): Promise<Task>
  /** Deletes the task and its subtasks. */
  remove(id: string): Promise<void>
  /** Deletes the done root tasks and their subtasks; returns the number deleted. */
  clearDone(): Promise<number>
  /** Deletes the category's not-done root tasks and their subtasks; returns the number deleted. */
  clearCategory(id: string): Promise<number>
  /** Last `days` days, days counted in the IANA timezone `tz`. */
  getStats(days: number, tz: string): Promise<Stats>
}

export const apiTaskStorage: TaskStorage = {
  async getAll() {
    const response = await api.get<Task[]>('/tasks')
    return response.data
  },
  async getCategories() {
    const response = await api.get<Category[]>('/categories')
    return response.data
  },
  async createCategory(name) {
    const response = await api.post<Category>('/categories', { name })
    return response.data
  },
  async removeCategory(id) {
    await api.delete(`/categories/${id}`)
  },
  async updateCategory(id, changes) {
    const response = await api.patch<Category>(`/categories/${id}`, changes)
    return response.data
  },
  async create(title, categoryId, parentId) {
    const response = await api.post<Task>('/tasks', { title, category: categoryId, parent: parentId })
    return response.data
  },
  async update(id, changes) {
    const response = await api.patch<Task>(`/tasks/${id}`, changes)
    return response.data
  },
  async remove(id) {
    await api.delete(`/tasks/${id}`)
  },
  async clearDone() {
    const response = await api.delete<{ deletedCount: number }>('/tasks', { params: { done: true } })
    return response.data.deletedCount
  },
  async clearCategory(id) {
    const response = await api.delete<{ deletedCount: number }>(`/categories/${id}/tasks`)
    return response.data.deletedCount
  },
  async getStats(days, tz) {
    const response = await api.get<Stats>('/stats', { params: { days, tz } })
    return response.data
  },
}

export const taskStorage: TaskStorage = apiTaskStorage
