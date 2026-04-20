import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base` controls the public path the app is served from. GitHub Pages
// serves project sites under /<repo-name>/, so we honour an env var
// (set by the CI workflow) and fall back to "/" for local dev and for
// hosts that serve at the domain root (Vercel, Netlify, Cloudflare).
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [react()],
})
