import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
// Activate the debounced auto-save subscriber (registers a useStore.subscribe
// at module-load time — see services/project-service.ts).
import './services'

import './assets/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
