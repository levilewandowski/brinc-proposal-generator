import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

// Handle Google OAuth callback before React loads
// Google redirects to /google/callback?code=... which loads the SPA
// We redirect to /#/?google_code=... so the Home route (path="/") matches
const urlParams = new URLSearchParams(window.location.search)
const code = urlParams.get('code')
const error = urlParams.get('error')
if (code || error) {
  const hashParams = new URLSearchParams()
  if (code) hashParams.set('google_code', code)
  if (error) hashParams.set('google_error', error)
  // Use /#/?... so the Home route (path="/") matches and processes the callback
  window.location.replace('/#/?' + hashParams.toString())
} else {
  // Normal app startup
  const root = document.getElementById('root')
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </StrictMode>,
    )
  }
}
