import { TaskModel } from './models/task.ts'

export type NtfyConfig = { url: string; topic: string; token?: string }

const TICK_MS = 60_000

/** Sends one ntfy notification per not-done task whose due date is reached, then marks it notified. */
export async function sendDueReminders({ url, topic, token }: NtfyConfig, now = new Date()) {
  const due = await TaskModel.find({ done: false, notifiedAt: null, dueDate: { $lte: now } })
    .populate<{ category: { name: string } | null }>('category', 'name')
  let sent = 0
  for (const task of due) {
    // JSON publishing (POST to the root URL): headers can't carry UTF-8 titles.
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify({ topic, title: task.category?.name ?? 'Reminder', message: task.title, priority: 4, tags: ['alarm_clock'] }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      console.error(`reminder for task ${task.id}: ntfy answered ${response.status} ${await response.text()}`)
      continue
    }
    // Same dueDate only: if it was changed meanwhile, the new one still gets its reminder.
    await TaskModel.updateOne({ _id: task._id, dueDate: task.dueDate }, { notifiedAt: now })
    sent++
  }
  return sent
}

/** Checks every minute; a failed send is retried on the next tick. */
export function startReminders(config: NtfyConfig) {
  // shortcut: one API instance assumed (a crash between send and notifiedAt can send twice), use a lock if it scales.
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await sendDueReminders(config)
    } catch (err) {
      console.error('reminders:', err)
    } finally {
      running = false
    }
  }
  setInterval(tick, TICK_MS)
  void tick()
  console.log(`reminders on: ${config.url} topic ${config.topic}`)
}
