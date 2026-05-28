import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/semantic.css'
import App from './App.tsx'
import { warmModelIconCache } from './utils/models'

warmModelIconCache() // fire-and-forget

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)