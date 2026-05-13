import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "./providers/trpc"
import App from './App.tsx'

// Handle Google OAuth callback before React loads
// Google redirects to /api/google/callback?code=... which loads the SPA
// We need to move the code into the hash so HashRouter can access it
const urlParams = new URLSearchParams(window.location.search)
const code = urlParams.get('code')
const error = urlParams.get('error')
if (code || error) {
  const hashParams = new URLSearchParams()
  if (code) hashParams.set('google_code', code)
  if (error) hashParams.set('google_error', error)
  // Redirect to /#/?google_code=... so HashRouter sees it
  window.location.replace('/#' + window.location.pathname + '?' + hashParams.toString())
} else {
  // Normal app startup
  const root = document.getElementById('root')
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <HashRouter>
          <TRPCProvider>
            <App />
          </TRPCProvider>
        </HashRouter>
      </StrictMode>,
    )
  }
}
