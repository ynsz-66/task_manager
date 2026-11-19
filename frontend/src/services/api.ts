import axios from 'axios'

// In dev, Vite proxies /api to the Express backend (see vite.config.ts).
export const api = axios.create({ baseURL: '/api' })
