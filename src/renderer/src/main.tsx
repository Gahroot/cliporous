import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import SettingsWindow from './SettingsWindow'
// Activate the debounced auto-save subscriber (registers a useStore.subscribe
// at module-load time — see services/project-service.ts). Harmless in the
// settings window: the subscriber only schedules a save when `isDirty` flips
// true, which never happens there.
import './services'

import './assets/index.css'

// Hash-based routing. The settings BrowserWindow loads the same renderer
// bundle with `#settings`; everything else (including no hash) renders the
// main App.
const isSettingsRoute = window.location.hash === '#settings'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isSettingsRoute ? <SettingsWindow /> : <App />}
  </React.StrictMode>
)
