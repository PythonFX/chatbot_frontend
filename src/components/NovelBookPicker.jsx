import { useState, useEffect } from 'react'
import { BookOpen, X } from 'lucide-react'

export default function NovelBookPicker({ books, onSelect }) {
  const [selectedIndex, setSelectedIndex] = useState(null)

  // Keyboard: Enter to confirm, Escape to cancel
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        // no-op - just dismiss
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  if (!books || books.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
          <p className="text-gray-500 text-center">No novels found in data/novels/.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
              <BookOpen size={20} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">Novel Agent Mode</h2>
              <p className="text-sm text-gray-500">Select a reference novel</p>
            </div>
          </div>
          <button
            onClick={() => onSelect(null)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Book list - 2 columns, scrollable, max 70vh */}
        <div className="mb-5 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {books.map((book, i) => (
              <button
                key={book.id}
                onClick={() => onSelect(String(i + 1))}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  selectedIndex === i
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-medium flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="font-medium text-gray-700 text-sm break-words">{book.title}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Number input hint */}
        <p className="text-xs text-gray-400 text-center">
          Or type a number in the chat to select
        </p>
      </div>
    </div>
  )
}
