import mongoose from 'mongoose'
import { createApp } from './app.ts'
import { setupCategories } from './models/category.ts'
import { setupTasks } from './models/task.ts'

try {
  process.loadEnvFile()
} catch {
  // No .env: use the environment variables already set.
}

const uri = process.env.MONGODB_URI
const apiToken = process.env.API_TOKEN
const port = Number(process.env.PORT ?? 3000)

if (!uri) {
  console.error('MONGODB_URI is not set (see .env.example)')
  process.exit(1)
}
if (!apiToken) {
  console.error('API_TOKEN is not set (see .env.example)')
  process.exit(1)
}

await mongoose.connect(uri)
console.log('connected to MongoDB')
await setupCategories()
await setupTasks()

createApp(apiToken).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})