import mongoose from 'mongoose'

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    done: { type: Boolean, default: false },
    // Parent task for a subtask (any depth), null for a root task.
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    // Index among its siblings (siblingsOf). Holes are fine (deletions), ties fall back to createdAt.
    position: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
    // Exposes `_id` as `id` (string), like the frontend Task type.
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id
        return ret
      },
    },
  },
)

export const TaskModel = mongoose.model('Task', taskSchema)

/** Ids of the tasks matching `match` and of all their subtasks. `match` is not cast: pass ObjectIds. */
export async function subtreeIds(match: Record<string, unknown>) {
  const roots = await TaskModel.aggregate<{ ids: mongoose.Types.ObjectId[] }>([
    { $match: match },
    {
      $graphLookup: {
        from: TaskModel.collection.name,
        startWith: '$_id',
        connectFromField: '_id',
        connectToField: 'parent',
        as: 'descendants',
      },
    },
    { $project: { ids: { $concatArrays: [['$_id'], '$descendants._id'] } } },
  ])
  return roots.flatMap((root) => root.ids)
}

type Placed = { _id: mongoose.Types.ObjectId; parent?: mongoose.Types.ObjectId | null; category: mongoose.Types.ObjectId }

/** Filter of a task's siblings: same parent, and same category for a root task. */
export function siblingsOf(task: Omit<Placed, '_id'>) {
  return task.parent ? { parent: task.parent } : { parent: null, category: task.category }
}

/** Position before the first sibling (may be negative until the next renumbering). */
export async function firstPosition(task: Omit<Placed, '_id'>) {
  const first = await TaskModel.findOne(siblingsOf(task)).sort({ position: 1 })
  return first ? first.position - 1 : 0
}

/** Puts the task at `index` among its siblings (at the end if undefined), renumbers them 0..n-1, returns its position. */
export async function placeTask(task: Placed, index?: number) {
  const siblings = await TaskModel.find({ ...siblingsOf(task), _id: { $ne: task._id } }, { _id: 1 }).sort({ position: 1, createdAt: 1 })
  const at = Math.min(index ?? siblings.length, siblings.length)
  const ids = siblings.map((s) => s._id).toSpliced(at, 0, task._id)
  await TaskModel.bulkWrite(ids.map((_id, position) => ({ updateOne: { filter: { _id }, update: { position } } })))
  return at
}

/** Gives tasks created before subtasks existed an explicit `parent: null`. */
export async function setupTasks() {
  const result = await TaskModel.updateMany({ parent: { $exists: false } }, { $set: { parent: null } })
  if (result.modifiedCount > 0) console.log(`set parent: null on ${result.modifiedCount} task(s)`)
}
