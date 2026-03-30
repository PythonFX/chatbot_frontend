import { FileText, FileJson, Trash2, Download, Check, RefreshCw, X } from 'lucide-react'

const FILE_ICONS = {
  pdf: { icon: FileText, color: 'text-red-500', bg: 'bg-red-50' },
  doc: { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
  docx: { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
  txt: { icon: FileText, color: 'text-gray-500', bg: 'bg-gray-50' },
  json: { icon: FileJson, color: 'text-yellow-500', bg: 'bg-yellow-50' },
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function FileIcon({ type, size = 16 }) {
  const ext = type?.toLowerCase() || 'txt'
  const config = FILE_ICONS[ext] || FILE_ICONS.txt
  const Icon = config.icon
  return <Icon size={size} className={config.color} />
}

function StatusBadge({ status, progress }) {
  if (status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600">
        <Check size={12} />
        Ready
      </span>
    )
  } else if (status === 'processing') {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
          <RefreshCw size={12} className="animate-spin" />
          Processing
        </span>
        {progress != null && (
          <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {progress != null && (
          <span className="text-xs text-gray-400">{progress}%</span>
        )}
      </div>
    )
  } else if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-500">
        <X size={12} />
        Error
      </span>
    )
  }
  return (
    <span className="text-xs text-gray-400">Unknown</span>
  )
}

export default function FilesList({ files, selectedIds, onSelectionChange, onDeleteFile }) {
  if (!files || files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg mb-1">No files uploaded yet</p>
          <p className="text-sm">Click "Browse Files" to upload a document</p>
        </div>
      </div>
    )
  }

  const readyFiles = files.filter(f => f.status === 'ready')
  const allReadySelected = readyFiles.length > 0 && readyFiles.every(f => selectedIds.includes(f.id))
  const someReadySelected = readyFiles.some(f => selectedIds.includes(f.id)) && !allReadySelected

  const toggleAll = () => {
    if (allReadySelected) {
      onSelectionChange([])
    } else {
      onSelectionChange(readyFiles.map(f => f.id))
    }
  }

  const toggleFile = (id) => {
    const file = files.find(f => f.id === id)
    if (file?.status !== 'ready') return

    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(i => i !== id))
    } else {
      onSelectionChange([...selectedIds, id])
    }
  }

  return (
    <div className="flex-1 overflow-auto bg-white">
      {/* Finder-style header */}
      <div className="sticky top-0 bg-gray-100 border-b border-gray-200 px-4 py-2 flex items-center text-xs font-medium text-gray-500 uppercase tracking-wider">
        {/* Checkbox column */}
        <div className="w-12 flex items-center justify-center">
          <button
            onClick={toggleAll}
            disabled={readyFiles.length === 0}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              allReadySelected
                ? 'bg-blue-500 border-blue-500'
                : someReadySelected
                ? 'bg-blue-100 border-blue-500'
                : 'border-gray-300 hover:border-gray-400'
            } ${readyFiles.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {(allReadySelected || someReadySelected) && <Check size={12} className="text-white" />}
          </button>
        </div>
        <div className="flex-1">Name</div>
        <div className="w-24 text-center">Kind</div>
        <div className="w-24 text-right">Size</div>
        <div className="w-32 text-center">Status</div>
        <div className="w-48 text-right">Date Modified</div>
        <div className="w-20" />
      </div>

      {/* File rows */}
      <div className="divide-y divide-gray-100">
        {files.map((file) => {
          const ext = file.type?.toLowerCase() || 'txt'
          const config = FILE_ICONS[ext] || FILE_ICONS.txt
          const isSelected = selectedIds.includes(file.id)
          const isReady = file.status === 'ready'

          return (
            <div
              key={file.id}
              className={`flex items-center px-4 py-3 group transition-colors ${
                isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              {/* Checkbox */}
              <div className="w-12 flex items-center justify-center">
                <button
                  onClick={() => toggleFile(file.id)}
                  disabled={!isReady}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected && isReady
                      ? 'bg-blue-500 border-blue-500'
                      : isReady
                      ? 'border-gray-300 hover:border-gray-400'
                      : 'border-gray-200 opacity-40 cursor-not-allowed'
                  }`}
                >
                  {isSelected && isReady && <Check size={12} className="text-white" />}
                </button>
              </div>

              {/* File icon and name */}
              <div className="flex-1 flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.bg}`}>
                  <FileIcon type={ext} size={20} />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">{file.path || 'Local file'}</p>
                </div>
              </div>

              {/* Kind */}
              <div className="w-24 text-center text-sm text-gray-600">
                {file.type?.toUpperCase() || 'TXT'}
              </div>

              {/* Size */}
              <div className="w-24 text-right text-sm text-gray-600">
                {formatFileSize(file.size || 0)}
              </div>

              {/* Status */}
              <div className="w-32 text-center">
                <StatusBadge status={file.status} progress={file.progress} />
              </div>

              {/* Date */}
              <div className="w-48 text-right text-sm text-gray-500 pr-4">
                {formatDate(file.uploaded_at || file.created_at || new Date().toISOString())}
              </div>

              {/* Actions */}
              <div className="w-20 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-4">
                <button
                  className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                  title="Download"
                >
                  <Download size={14} className="text-gray-500" />
                </button>
                <button
                  onClick={() => onDeleteFile?.(file.id)}
                  className="p-1.5 hover:bg-red-100 rounded transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} className="text-red-500" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
