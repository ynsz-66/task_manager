import { Router } from 'express'
import mongoose from 'mongoose'
import { CategoryModel, FALLBACK_CATEGORY } from '../models/category.ts'
import { firstPosition, placeTask, subtreeIds, TaskModel } from '../models/task.ts'

export const tasksRouter = Router()

// MongoDB has no foreign keys: check ourselves that the category exists.
async function categoryExists(value: unknown) {
  return mongoose.isValidObjectId(value) && (await CategoryModel.exists({ _id: value })) !== null
}

// get task
tasksRouter.get('/', async (_req, res) => {
  try {
    const tasks = await TaskModel.find().sort({ position: 1, createdAt: 1 })
    res.status(200).json(tasks)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

// create task
tasksRouter.post('/', async (req, res) => {
  const { title, category, parent } = req.body ?? {}

  if (typeof title !== 'string' || title.trim() === '') {
    res.status(400).json({ error: 'title is required' })
    return
  }
  if (parent !== undefined && parent !== null && !mongoose.isValidObjectId(parent)) {
    res.status(400).json({ error: 'invalid parent' })
    return
  }

  try {
    // A subtask always lives in its parent's category.
    if (parent !== undefined && parent !== null) {
      const parentTask = await TaskModel.findById(parent)
      if (!parentTask) {
        res.status(400).json({ error: 'invalid parent' })
        return
      }
      const fields = { category: parentTask.category, parent: parentTask._id }
      const task = await TaskModel.create({ title, ...fields, position: await firstPosition(fields) })
      res.status(200).json(task)
      return
    }
    if (category !== undefined && !(await categoryExists(category))) {
      res.status(400).json({ error: 'invalid category' })
      return
    }
    const fallback = category === undefined ? await CategoryModel.findOne({ name: FALLBACK_CATEGORY }) : null
    if (category === undefined && !fallback) {
      res.status(500).json({ error: `fallback category ${FALLBACK_CATEGORY} not found` })
      return
    }
    const categoryId = category ?? fallback?._id
    const task = await TaskModel.create({ title, category: categoryId, position: await firstPosition({ category: categoryId }) })
    res.status(200).json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

// update task
tasksRouter.patch('/:id', async (req, res) => {
  const { id } = req.params
  const { title, category, done, parent, position } = req.body ?? {}

  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }
  if (title === undefined && category === undefined && done === undefined && parent === undefined && position === undefined) {
    res.status(400).json({ error: 'nothing to update (title, category, done, parent or position)' })
    return
  }
  if (position !== undefined && !(Number.isInteger(position) && position >= 0)) {
    res.status(400).json({ error: 'position must be a non-negative integer' })
    return
  }
  // parent: null detaches a subtask, a task id moves the task under that task.
  const attaching = parent !== undefined && parent !== null
  if (attaching && !mongoose.isValidObjectId(parent)) {
    res.status(400).json({ error: 'invalid parent' })
    return
  }
  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    res.status(400).json({ error: 'title cannot be empty' })
    return
  }
  if (done !== undefined && typeof done !== 'boolean') {
    res.status(400).json({ error: 'done must be a boolean' })
    return
  }

  try {
    if (!attaching && category !== undefined && !(await categoryExists(category))) {
      res.status(400).json({ error: 'invalid category' })
      return
    }
    const current = await TaskModel.findById(id)
    if (!current) {
      res.status(404).json({ error: 'task not found' })
      return
    }
    if (category !== undefined && current.parent !== null && parent === undefined) {
      res.status(400).json({ error: 'a subtask follows its parent\'s category: send parent: null to detach it' })
      return
    }
    let changes = { title, category, done, parent }
    if (attaching) {
      const parentTask = await TaskModel.findById(parent)
      if (!parentTask) {
        res.status(400).json({ error: 'invalid parent' })
        return
      }
      // The subtree includes the task itself: this also refuses parent === id.
      if ((await subtreeIds({ _id: current._id })).some((x) => x.equals(parentTask._id))) {
        res.status(400).json({ error: 'a task cannot be moved under its own subtask' })
        return
      }
      // Like POST: the task takes its parent's category, and is checked if the parent is.
      changes = { title, category: parentTask.category, done: parentTask.done || done, parent: parentTask._id }
    }
    const task = await TaskModel.findByIdAndUpdate(id, changes, { returnDocument: 'after' })
    if (!task) {
      res.status(404).json({ error: 'task not found' })
      return
    }
    // Subtasks follow their parent's category, and are checked with it (unchecking leaves them as they are).
    const cascade = { ...(changes.category !== undefined && { category: task.category }), ...(changes.done === true && { done: true }) }
    if (Object.keys(cascade).length > 0) {
      await TaskModel.updateMany({ _id: { $in: await subtreeIds({ _id: task._id }) } }, cascade)
    }
    // A task that changes list (parent or category) goes to its end, unless a position is sent.
    const moved = String(task.parent) !== String(current.parent) || String(task.category) !== String(current.category)
    if (position !== undefined || moved) task.position = await placeTask(task, position)
    res.status(200).json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

// delete all done tasks (the filter is required: a bare DELETE must not wipe everything)
tasksRouter.delete('/', async (req, res) => {
  if (req.query.done !== 'true') {
    res.status(400).json({ error: 'only done=true is supported' })
    return
  }

  try {
    // Done root tasks with their subtree: a checked subtask stays under its not-done parent.
    const ids = await subtreeIds({ done: true, parent: null })
    const { deletedCount } = await TaskModel.deleteMany({ _id: { $in: ids } })
    res.status(200).json({ deletedCount })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

// delete task
tasksRouter.delete('/:id', async (req, res) => {
  const { id } = req.params

  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }

  try {
    const ids = await subtreeIds({ _id: new mongoose.Types.ObjectId(id) })
    if (ids.length === 0) {
      res.status(404).json({ error: 'task not found' })
      return
    }
    // The task and all its subtasks.
    await TaskModel.deleteMany({ _id: { $in: ids } })
    res.status(204).end()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})
