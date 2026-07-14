import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerPushServiceWorker } from './utils/pushNotifications.js'
import { Analytics } from '@vercel/analytics/react'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)

void registerPushServiceWorker().catch((error) => {
  console.warn("Push service worker kaydedilemedi:", error);
});
