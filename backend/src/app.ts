import express, { type ErrorRequestHandler } from 'express'
import { requireToken } from './middleware/auth.ts'
import { categoriesRouter } from './routes/categories.ts'
import { statsRouter } from './routes/stats.ts'
import { tasksRouter } from './routes/tasks.ts'

// express.json() throws a SyntaxError if the body isn't valid JSON.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: 'invalid JSON' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'internal error' })
}

// apiToken: every /api request must carry "Authorization: Bearer <apiToken>".
export function createApp(apiToken: string) {
  const app = express()

  app.use('/api', requireToken(apiToken))
  app.use(express.json())
  app.use('/api/categories', categoriesRouter)
  app.use('/api/tasks', tasksRouter)
  app.use('/api/stats', statsRouter)
  app.use(errorHandler)

  return app
}
