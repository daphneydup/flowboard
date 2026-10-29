import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyBackground, loadBackground } from './background'
import { initialTheme } from './theme'

document.documentElement.dataset.theme = initialTheme() // set before first paint to avoid a theme flash
applyBackground(loadBackground()) // before first paint, so the saved background doesn't flash

const root = createRoot(document.getElementById('root')!)
const configured = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Import App lazily so a missing Supabase config shows a message instead of a blank page.
if (configured) {
  import('./App.tsx').then(({ default: App }) =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
} else {
  root.render(
    <div className="app">
      <div className="panel" role="alert">
        <h2>Flowboard isn't configured</h2>
        <p>
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in
          <code> .env.local</code> (see <code>.env.example</code>), then restart the app.
        </p>
      </div>
    </div>,
  )
}
