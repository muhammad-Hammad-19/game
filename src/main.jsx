import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App.jsx'
import './ui/styles.css'
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)

// Installable, and playable offline after the first visit.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js')
      const registration = await navigator.serviceWorker.ready
      const remember = () => {
        const urls = [window.location.href, ...performance.getEntriesByType('resource').map(entry => entry.name).filter(url => url.startsWith(window.location.origin))]
        registration.active?.postMessage({ type: 'cache', urls })
      }
      remember()
      // The field, players and sounds load a moment after the menu.
      setTimeout(remember, 6000)
      setTimeout(remember, 20000)
    } catch { /* The game works without offline support. */ }
  })
}
