import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthProvider } from './auth'
import { ThemeProvider } from './theme/ThemeContext'
import { registerForPushNotifications } from './plugins/pushNotifications'
import './styles.css'

// No-op on web; registers for native push on iOS/Android once the native
// shell + PushNotifications plugin exist (#42, docs/runbooks/capacitor-native.md).
void registerForPushNotifications()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>,
)
