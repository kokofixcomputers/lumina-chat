import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/semantic.css'
import App from './App.tsx'
import { warmModelIconCache } from './utils/models'

warmModelIconCache() // fire-and-forget

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)