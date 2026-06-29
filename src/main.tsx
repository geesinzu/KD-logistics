import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import App from './App.tsx'

// Register PWA service worker
import { registerSW } from "virtual:pwa-register"
registerSW({
  immediate: true,
  onRegisteredSW(swScriptUrl, registration) {
    console.log("[PWA] Service Worker registered:", swScriptUrl)
    // Check for updates every hour
    setInterval(() => registration?.update(), 60 * 60 * 1000)
  },
  onNeedRefresh() {
    console.log("[PWA] New version available - refreshing...")
    window.location.reload()
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
