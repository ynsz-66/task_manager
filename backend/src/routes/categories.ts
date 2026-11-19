import { Router } from 'express'
import mongoose from 'mongoose'
import { CATEGORY_NAME_MAX, CATEGORY_NAME_MIN, CategoryModel, FALLBACK_CATEGORY } from '../models/category.ts'
import { subtreeIds, TaskModel } from '../models/task.ts'

export const categoriesRouter = Router()

const NAME_ERROR = `name must be ${CATEGORY_NAME_MIN} to ${CATEGORY_NAME_MAX} characters`

// Returns the trimmed name, or null if it is not a valid category name
function validateName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  return trimmed.length >= CATEGORY_NAME_MIN && trimmed.length <= CATEGORY_NAME_MAX ? trimmed : null
}

categoriesRouter.get('/', async (_req, res) => {
  try {
    const categories = await CategoryModel.find().sort({ order: 1 })
    // Other always stays last (just before the front's Done column).
    categories.sort((a, b) => Number(a.name === FALLBACK_CATEGORY) - Number(b.name === FALLBACK_CATEGORY))
    res.status(200).json(categories)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

categoriesRouter.post('/', async (req, res) => {
  const { name, order } = req.body ?? {}

  const trimmed = validateName(name)
  if (trimmed === null) {
    res.status(400).json({ error: NAME_ERROR })
    return
  }
  if (order !== undefined && typeof order !== 'number') {
    res.status(400).json({ error: 'order must be a number' })
    return
  }

  try {
    if (await CategoryModel.exists({ name: trimmed })) {
      res.status(409).json({ error: 'category already exists' })
      return
    }
    // By default, the new category goes after the existing ones (orders 0..n-1, Other excluded).
    const count = await CategoryModel.countDocuments({ name: { $ne: FALLBACK_CATEGORY } })
    const category = await CategoryModel.create({ name: trimmed, order: order ?? count })
    res.status(200).json(category)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

categoriesRouter.delete('/:id', async (req, res) => {
  const { id } = req.params

  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }

  try {
    const category = await CategoryModel.findById(id)
    if (!category) {
      res.status(404).json({ error: 'category not found' })
      return
    }
    // Other receives tasks without a category: it cannot be deleted.
    if (category.name === FALLBACK_CATEGORY) {
      res.status(400).json({ error: `${FALLBACK_CATEGORY} cannot be deleted` })
      return
    }
    const fallback = await CategoryModel.findOne({ name: FALLBACK_CATEGORY })
    if (!fallback) {
      res.status(500).json({ error: `fallback category ${FALLBACK_CATEGORY} not found` })
      return
    }
    // Tasks of the deleted category move to Other.
    await TaskModel.updateMany({ category: category._id }, { category: fallback._id })
    await category.deleteOne()
    // Close the gap left in the order (Other is always last, outside the numbering).
    await CategoryModel.updateMany(
      { name: { $ne: FALLBACK_CATEGORY }, order: { $gt: category.order } },
      { $inc: { order: -1 } },
    )
    res.status(204).end()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

categoriesRouter.patch('/:id', async (req, res) => {
  const { id } = req.params
  const { name, order } = req.body ?? {}

  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }

  if (name === undefined && order === undefined) {
    res.status(400).json({ error: 'nothing to update (name, order)' })
    return
  }
  const trimmed = name === undefined ? undefined : validateName(name)
  if (trimmed === null) {
    res.status(400).json({ error: NAME_ERROR })
    return
  }
  if (order !== undefined && (!Number.isInteger(order) || order < 0)) {
    res.status(400).json({ error: 'order must be a non-negative integer' })
    return
  }

  try {
    const category = await CategoryModel.findById(id)
    if (!category) {
      res.status(404).json({ error: 'category not found' })
      return
    }
    if (trimmed !== undefined && trimmed !== category.name) {
      // Other is looked up by name everywhere: renaming it would break the fallback.
      if (category.name === FALLBACK_CATEGORY) {
        res.status(400).json({ error: `${FALLBACK_CATEGORY} cannot be renamed` })
        return
      }
      if (await CategoryModel.exists({ name: trimmed })) {
        res.status(409).json({ error: 'category already exists' })
        return
      }
      category.name = trimmed
    }
    if (order !== undefined && order !== category.order) {
      if (category.name === FALLBACK_CATEGORY) {
        res.status(400).json({ error: `${FALLBACK_CATEGORY} cannot be moved` })
        return
      }
      const count = await CategoryModel.countDocuments({ name: { $ne: FALLBACK_CATEGORY } })
      if (order >= count) {
        res.status(400).json({ error: `order must be between 0 and ${count - 1}` })
        return
      }
      // Categories between the old and new position shift by one toward the freed slot.
      const others = { _id: { $ne: category._id }, name: { $ne: FALLBACK_CATEGORY } }
      if (category.order < order) {
        await CategoryModel.updateMany({ ...others, order: { $gt: category.order, $lte: order } }, { $inc: { order: -1 } })
      } else {
        await CategoryModel.updateMany({ ...others, order: { $gte: order, $lt: category.order } }, { $inc: { order: 1 } })
      }
      category.order = order
    }
    // save() runs the schema validators, updateOne doesn't.
    await category.save()
    res.status(200).json(category)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

categoriesRouter.delete('/:id/tasks', async (req, res) => {
  const { id } = req.params

  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }

  try {
    const category = await CategoryModel.findById(id)
    if (!category) {
      res.status(404).json({ error: 'category not found' })
      return
    }
    // Not-done root tasks, with their whole subtree (done subtasks included: they live under their parent).
    const ids = await subtreeIds({ category: category._id, done: false, parent: null })
    const { deletedCount } = await TaskModel.deleteMany({ _id: { $in: ids } })
    res.status(200).json({ deletedCount })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})

categoriesRouter.get('/:id/tasks', async (req, res) => {
  const { id } = req.params

  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }

  try {
    const category = await CategoryModel.findById(id)
    if (!category) {
      res.status(404).json({ error: 'category not found' })
      return
    }
    const tasks = await TaskModel.find({ category: category._id, done: false }).sort({ position: 1, createdAt: 1 })
    res.status(200).json({ tasks })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})
