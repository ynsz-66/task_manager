import mongoose from 'mongoose'
import { createApp } from './app.ts'
import { setupCategories } from './models/category.ts'
import { setupTasks } from './models/task.ts'
import { startReminders } from './reminders.ts'

try {
  process.loadEnvFile()
} catch {
  // No .env: use the environment variables already set.
}

const uri = process.env.MONGODB_URI
const apiToken = process.env.API_TOKEN
const port = Number(process.env.PORT ?? 3000)
// Optional: without them the API works, only reminders are off (local dev).
const { NTFY_URL: ntfyUrl, NTFY_TOPIC: ntfyTopic, NTFY_TOKEN: ntfyToken } = process.env

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
if (ntfyUrl && ntfyTopic) startReminders({ url: ntfyUrl, topic: ntfyTopic, token: ntfyToken || undefined })
else console.log('NTFY_URL or NTFY_TOPIC not set: reminders disabled')

createApp(apiToken).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})