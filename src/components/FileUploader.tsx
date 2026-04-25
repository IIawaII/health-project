import { useState, useRef, useCallback } from 'react'
import { validateFile, fileToBase64, readTextFile } from '../lib/utils'
import { FiUpload, FiFile, FiImage, FiX, FiCheck, FiAlertCircle } from 'react-icons/fi'

interface FileUploaderProps {
  onFileSelect: (data: { fileData: string; fileType: string; fileName: string }) => void
  onClear: () => void
  selectedFile: { fileData: string; fileType: string; fileName: string } | null
}

const MAX_SIZE_MB = 5
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf', 'text/plain']

export default function FileUploader({ onFileSelect, onClear, selectedFile }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)

      const validation = validateFile(file, ALLOWED_TYPES, MAX_SIZE_MB)
      if (!validation.valid) {
        setError(validation.error || '文件验证失败')
        return
      }

      try {
        let fileData: string
        if (file.type.startsWith('image/')) {
          fileData = await fileToBase64(file)
        } else if (file.type === 'text/plain') {
          const text = await readTextFile(file)
          fileData = text
        } else {
          // application/pdf 也转为 base64，由后端按多模态方式交给模型解析
          fileData = await fileToBase64(file)
        }

        onFileSelect({
          fileData,
          fileType: file.type,
          fileName: file.name,
        })
      } catch {
        setError('文件读取失败，请重试')
      }
    },
    [onFileSelect]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      e.target.value = ''
    },
    [handleFile]
  )

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <FiImage className="w-5 h-5" />
    return <FiFile className="w-5 h-5" />
  }

  return (
    <div className="space-y-4">
      {!selectedFile ? (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-primary bg-primary-50'
              : 'border-gray-300 hover:border-primary-300 hover:bg-gray-50'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.pdf,.txt"
            onChange={handleChange}
            className="hidden"
          />
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
            <FiUpload className="w-8 h-8 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">
            点击或拖拽文件到此处上传
          </p>
          <p className="text-xs text-foreground-subtle">
            支持 PNG、JPG、PDF、TXT 格式，最大 {MAX_SIZE_MB}MB
          </p>
          <p className="text-xs text-amber-600 mt-1">
            提示：图片和 PDF 将转为 base64 编码，内存占用约增加 33%
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary">
              {getFileIcon(selectedFile.fileType)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {selectedFile.fileName}
              </p>
              <p className="text-xs text-foreground-subtle">
                {selectedFile.fileType.startsWith('image/') ? '图像文件' : selectedFile.fileType === 'text/plain' ? '文本文件' : 'PDF 文档'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                <FiCheck className="w-4 h-4 text-success" />
              </div>
              <button
                onClick={onClear}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-foreground-muted hover:text-danger transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          </div>

          {selectedFile.fileType.startsWith('image/') && (
            <div className="mt-4 rounded-xl overflow-hidden border border-gray-100">
              <img
                src={selectedFile.fileData}
                alt="预览"
                className="w-full max-h-64 object-contain bg-gray-50"
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 text-danger text-sm">
          <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
