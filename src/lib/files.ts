// Supported file types - only legal document formats
export const acceptedFileTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export const acceptedExtensions = ['.pdf', '.doc', '.docx']

export const validateFile = (file: File): string | null => {
  // Validate file type
  if (!acceptedFileTypes.includes(file.type))
    return `File type not supported. Please upload: ${acceptedExtensions.join(', ')}`

  // Validate file size (max 50MB)
  const maxSize = 50 * 1024 * 1024 // 50MB
  if (file.size > maxSize) return 'File size exceeds 50MB limit'

  return null
}

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`
}

export const getFileExtension = (fileName: string): string => {
  return fileName.split('.').pop()?.toUpperCase() || ''
}

export interface FileWithStatus {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'
