import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import App from './App.tsx'

// Register PWA service worker with aggressive auto-update
import { registerSW } from "virtual:pwa-register"
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(swScriptUrl, registration) {
    console.log("[PWA] Service Worker registered:", swScriptUrl)
    if (registration) {
      // Check for updates every 30 seconds for first 5 minutes, then hourly
      const fastCheck = setInterval(() => registration.update(), 30 * 1000)
      setTimeout(() => clearInterval(fastCheck), 5 * 60 * 1000)
      // Regular hourly check
      setInterval(() => registration.update(), 60 * 60 * 1000)
    }
  },
  onNeedRefresh() {
    console.log("[PWA] New version available - activating...")
    // Activate new service worker and reload page to use new code
    updateSW(true).then(() => {
      console.log("[PWA] Reloading page to load new version...")
      setTimeout(() => window.location.reload(), 500)
    })
  },
  onOfflineReady() {
    console.log("[PWA] App ready for offline use")
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)
