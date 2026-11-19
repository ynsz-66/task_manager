import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiTaskStorage } from './taskStorage'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('./api', () => ({ api }))

const data = { id: '1' }

beforeEach(() => {
  vi.resetAllMocks()
  for (const fn of Object.values(api)) fn.mockResolvedValue({ data })
})

describe('apiTaskStorage', () => {
  it('getAll', async () => {
    expect(await apiTaskStorage.getAll()).toBe(data)
    expect(api.get).toHaveBeenCalledWith('/tasks')
  })

  it('getCategories', async () => {
    expect(await apiTaskStorage.getCategories()).toBe(data)
    expect(api.get).toHaveBeenCalledWith('/categories')
  })

  it('createCategory', async () => {
    expect(await apiTaskStorage.createCategory('Dev')).toBe(data)
    expect(api.post).toHaveBeenCalledWith('/categories', { name: 'Dev' })
  })

  it('removeCategory', async () => {
    expect(await apiTaskStorage.removeCategory('c1')).toBeUndefined()
    expect(api.delete).toHaveBeenCalledWith('/categories/c1')
  })

  it('updateCategory', async () => {
    expect(await apiTaskStorage.updateCategory('c1', { order: 2 })).toBe(data)
    expect(api.patch).toHaveBeenCalledWith('/categories/c1', { order: 2 })
  })

  it('create sends the category id as `category`', async () => {
    expect(await apiTaskStorage.create('Buy milk', 'c1')).toBe(data)
    expect(api.post).toHaveBeenCalledWith('/tasks', { title: 'Buy milk', category: 'c1' })
  })

  it('update', async () => {
    expect(await apiTaskStorage.update('t1', { done: true })).toBe(data)
    expect(api.patch).toHaveBeenCalledWith('/tasks/t1', { done: true })
  })

  it('remove', async () => {
    expect(await apiTaskStorage.remove('t1')).toBeUndefined()
    expect(api.delete).toHaveBeenCalledWith('/tasks/t1')
  })

  it('clearDone returns deletedCount', async () => {
    api.delete.mockResolvedValue({ data: { deletedCount: 3 } })
    expect(await apiTaskStorage.clearDone()).toBe(3)
    expect(api.delete).toHaveBeenCalledWith('/tasks', { params: { done: true } })
  })

  it('clearCategory returns deletedCount', async () => {
    api.delete.mockResolvedValue({ data: { deletedCount: 2 } })
    expect(await apiTaskStorage.clearCategory('c1')).toBe(2)
    expect(api.delete).toHaveBeenCalledWith('/categories/c1/tasks')
  })

  it('propagates API errors', async () => {
    api.get.mockRejectedValue(new Error('500'))
    await expect(apiTaskStorage.getAll()).rejects.toThrow('500')
  })
})
