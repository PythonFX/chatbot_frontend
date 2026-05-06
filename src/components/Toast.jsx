import { useState, useCallback } from 'react'

let addToastFn = null

export function showToast(message, duration = 2000) {
  addToastFn?.(message, duration)
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])
  let nextId = 0

  const addToast = useCallback((message, duration) => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  addToastFn = addToast

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm shadow-lg"
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
