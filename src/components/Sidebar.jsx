import { useState, useRef, useEffect } from 'react'
import { Trash2, MessageSquare, Plus, MoreHorizontal, Pencil, Trash, RefreshCw, FolderOpen, X } from 'lucide-react'

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  onAutoRenameConversation,
  renamingConversationId,
  onShowFiles,
  isFilesView,
  onClose,
}) {
  const [contextMenu, setContextMenu] = useState(null)
  const menuRef = useRef(null)

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setContextMenu(null)
      }
    }
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [contextMenu])

  // Close context menu on scroll
  useEffect(() => {
    const handleScroll = () => setContextMenu(null)
    if (contextMenu) {
      document.querySelector('.overflow-y-auto')?.addEventListener('scroll', handleScroll)
      return () => document.querySelector('.overflow-y-auto')?.removeEventListener('scroll', handleScroll)
    }
  }, [contextMenu])

  const handleContextMenu = (e, conv) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      conversationId: conv.id,
      title: conv.title,
    })
  }

  const handleRename = () => {
    if (!contextMenu) return
    const newTitle = window.prompt('Enter new title:', contextMenu.title)
    if (newTitle && newTitle.trim() && newTitle.trim() !== contextMenu.title) {
      onRenameConversation(contextMenu.conversationId, newTitle.trim())
    }
    setContextMenu(null)
  }

  const handleAutoRename = () => {
    if (!contextMenu) return
    onAutoRenameConversation(contextMenu.conversationId)
    setContextMenu(null)
  }

  const handleDelete = () => {
    if (!contextMenu) return
    if (window.confirm(`Delete "${contextMenu.title}"?`)) {
      onDeleteConversation(contextMenu.conversationId)
    }
    setContextMenu(null)
  }

  return (
    <div className="w-72 h-full bg-gray-900 flex flex-col border-r border-gray-700 relative">
      {/* Mobile close button */}
      {onClose && (
        <div className="absolute top-3 right-3 z-10 md:hidden">
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      )}
      {/* New Chat Button */}
      <div className="p-4">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-white"
        >
          <Plus size={18} />
          <span>New Chat</span>
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-1 transition-colors ${
              conv.id === currentConversationId
                ? 'bg-gray-700 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
            onClick={() => onSelectConversation(conv.id)}
            onContextMenu={(e) => handleContextMenu(e, conv)}
          >
            {renamingConversationId === conv.id ? (
              <RefreshCw size={16} className="flex-shrink-0 animate-spin" />
            ) : (
              <MessageSquare size={16} className="flex-shrink-0" />
            )}
            <span className="flex-1 truncate">
              {conv.title}
            </span>
            {!renamingConversationId && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleContextMenu(e, conv)
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded transition-opacity"
              >
                <MoreHorizontal size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Divider and Files Button */}
      <div className="px-2 mt-2">
        <div className="border-t border-gray-700 mb-2" />
        <button
          onClick={onShowFiles}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
            isFilesView
              ? 'bg-gray-700 text-white'
              : 'text-gray-300 hover:bg-gray-800 hover:text-white'
          }`}
        >
          <FolderOpen size={16} className="flex-shrink-0" />
          <span className="flex-1 truncate text-sm">Files</span>
        </button>
        <div className="border-t border-gray-700 mt-2" />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-36"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={handleAutoRename}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            <RefreshCw size={14} />
            Auto Rename
          </button>
          <button
            onClick={handleRename}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            <Pencil size={14} />
            Rename
          </button>
          <button
            onClick={handleDelete}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
