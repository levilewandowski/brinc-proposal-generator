import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "./providers/trpc"
import App from './App.tsx'

console.log('[Brinc] main.tsx starting...')

try {
  const root = document.getElementById('root')
  if (!root) {
    console.error('[Brinc] Root element not found!')
  } else {
    createRoot(root).render(
      <StrictMode>
        <HashRouter>
          <TRPCProvider>
            <App />
          </TRPCProvider>
        </HashRouter>
      </StrictMode>,
    )
    console.log('[Brinc] App rendered successfully')
  }
} catch (err) {
  console.error('[Brinc] Fatal render error:', err)
}
