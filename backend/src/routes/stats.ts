import { Router } from 'express'
import { CategoryModel } from '../models/category.ts'
import { TaskModel } from '../models/task.ts'

export const statsRouter = Router()

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_DAYS = 366

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

// GET /api/stats?days=30&tz=Europe/Paris: tasks checked in the last `days` days (per day in `tz`, per category),
// and not-done tasks past their due date (overdue) or due within 24 h (dueSoon).
statsRouter.get('/', async (req, res) => {
  const days = req.query.days === undefined ? 30 : Number(req.query.days)
  const tz = req.query.tz === undefined ? 'UTC' : req.query.tz

  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    res.status(400).json({ error: `days must be an integer between 1 and ${MAX_DAYS}` })
    return
  }
  if (typeof tz !== 'string' || !isTimeZone(tz)) {
    res.status(400).json({ error: 'tz must be an IANA timezone (e.g. Europe/Paris)' })
    return
  }

  try {
    const now = new Date()
    const checked = { $match: { done: true, doneAt: { $gte: new Date(now.getTime() - days * DAY_MS) } } }
    const [donePerDay, doneByCategory, overdue, dueSoon] = await Promise.all([
      TaskModel.aggregate([
        checked,
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$doneAt', timezone: tz } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', count: 1 } },
      ]),
      TaskModel.aggregate([
        checked,
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $lookup: { from: CategoryModel.collection.name, localField: '_id', foreignField: '_id', as: 'category' } },
        { $project: { _id: 0, category: { $first: '$category.name' }, count: 1 } },
        { $sort: { count: -1, category: 1 } },
      ]),
      TaskModel.countDocuments({ done: false, dueDate: { $lt: now } }),
      TaskModel.countDocuments({ done: false, dueDate: { $gte: now, $lte: new Date(now.getTime() + DAY_MS) } }),
    ])
    res.status(200).json({ donePerDay, doneByCategory, overdue, dueSoon })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal error' })
  }
})
