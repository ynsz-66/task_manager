import mongoose from 'mongoose'
import { TaskModel } from './task.ts'

export const FALLBACK_CATEGORY = 'Other'
// Former French name of the fallback category, renamed on startup.
const LEGACY_FALLBACK_CATEGORY = 'Autres'
export const CATEGORY_NAME_MIN = 2
export const CATEGORY_NAME_MAX = 20

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true, minlength: CATEGORY_NAME_MIN, maxlength: CATEGORY_NAME_MAX },
    order: { type: Number, required: true },
  },
  {
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id
        return ret
      },
    },
  },
)

export const CategoryModel = mongoose.model('Category', categorySchema)

/**
 * Creates the Other category if it doesn't exist (renaming the legacy Autres one if present),
 * renumbers the other categories 0..n-1, then migrates tasks whose `category` is still a name (old format) to the matching ObjectId.
 */
export async function setupCategories() {
  if (!(await CategoryModel.exists({ name: FALLBACK_CATEGORY }))) {
    const legacy = await CategoryModel.findOneAndUpdate(
      { name: LEGACY_FALLBACK_CATEGORY },
      { name: FALLBACK_CATEGORY },
      { returnDocument: 'after' },
    )
    if (legacy) {
      console.log(`${LEGACY_FALLBACK_CATEGORY} category renamed to ${FALLBACK_CATEGORY}`)
    } else {
      await CategoryModel.create({ name: FALLBACK_CATEGORY, order: 0 })
      console.log(`${FALLBACK_CATEGORY} category created`)
    }
  }

  // Numbers the categories 0..n-1 (Other excluded, always last): PATCH and DELETE shift orders as indices.
  const ordered = await CategoryModel.find({ name: { $ne: FALLBACK_CATEGORY } }).sort({ order: 1, _id: 1 })
  const renumbered = ordered
    .map((category, index) => ({ category, index }))
    .filter(({ category, index }) => category.order !== index)
  if (renumbered.length > 0) {
    await CategoryModel.bulkWrite(
      renumbered.map(({ category, index }) => ({ updateOne: { filter: { _id: category._id }, update: { order: index } } })),
    )
    console.log(`renumbered ${renumbered.length} category order(s)`)
  }

  // Goes through the raw collection: the Mongoose schema would refuse to read a string as an ObjectId.
  const categories = await CategoryModel.find()
  for (const category of categories) {
    const result = await TaskModel.collection.updateMany(
      { category: category.name },
      { $set: { category: category._id } },
    )
    if (result.modifiedCount > 0) {
      console.log(`migrated ${result.modifiedCount} task(s) to category ${category.name}`)
    }
  }
}
