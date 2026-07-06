import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthProvider } from './auth'
import { ThemeProvider } from './theme/ThemeContext'
import { ErrorBoundary } from './ErrorBoundary'
import { registerForPushNotifications } from './plugins/pushNotifications'
import { initErrorReporting } from './reporting'
import './styles.css'

// No-op without VITE_SENTRY_DSN; with it, installs Sentry's global
// error/unhandledrejection handlers (#252).
initErrorReporting()

// No-op on web; registers for native push on iOS/Android once the native
// shell + PushNotifications plugin exist (#42, docs/runbooks/capacitor-native.md).
void registerForPushNotifications()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
