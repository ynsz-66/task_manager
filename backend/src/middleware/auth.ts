import { createHash, timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'

// Compare SHA-256 digests: same length, so timingSafeEqual never throws
// and the comparison time reveals nothing about the token.
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

export function requireToken(token: string): RequestHandler {
  const expected = digest(`Bearer ${token}`)

  return (req, res, next) => {
    const header = req.get('authorization') ?? ''
    if (!timingSafeEqual(digest(header), expected)) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    next()
  }
}
