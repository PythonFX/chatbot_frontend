const DEFAULT_WEB_API_BASE_URL = '/api'
const DEFAULT_TAURI_API_BASE_URL = 'http://127.0.0.1:8180'

function detectTauriRuntime() {
  if (typeof window === 'undefined') {
    return false
  }

  if ('__TAURI_INTERNALS__' in window) {
    return true
  }

  const { protocol, hostname } = window.location
  return protocol === 'tauri:' || hostname === 'tauri.localhost' || hostname.endsWith('.localhost')
}

export const isTauriRuntime = detectTauriRuntime()

export const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ||
  (isTauriRuntime ? DEFAULT_TAURI_API_BASE_URL : DEFAULT_WEB_API_BASE_URL)
).replace(/\/$/, '')
