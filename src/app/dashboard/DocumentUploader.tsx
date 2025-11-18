'use client'

import { useMutation } from 'convex/react'
import { CheckCircle2, FileText, Upload, X, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { api } from '@/convex/_generated/api'
import {
  acceptedExtensions,
  type FileWithStatus,
  formatFileSize,
  getFileExtension,
  type UploadStatus,
  validateFile,
} from '@/lib/files'
import { cn } from '@/lib/utils'

export default function DocumentUploader() {
  const generateUploadUrl = useMutation(api.document.generateUploadUrl)
  const uploadDocument = useMutation(api.document.uploadDocument)

  const fileInput = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<FileWithStatus[]>([])
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFilesSelect = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return

    const newFiles: FileWithStatus[] = []
    const errors: string[] = []

    Array.from(fileList).forEach(file => {
      const validationError = validateFile(file)
      if (validationError) errors.push(`${file.name}: ${validationError}`)
      else {
        // Check for duplicates
        const isDuplicate = files.some(f => f.file.name === file.name && f.file.size === file.size)
        if (!isDuplicate)
          newFiles.push({
            file,
            status: 'pending',
            progress: 0,
          })
      }
    })

    if (errors.length > 0) setError(errors.join('; '))
    else setError(null)

    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles])
      setUploadStatus('idle')
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const pendingFiles = files.filter(f => f.status === 'pending')
    if (pendingFiles.length === 0) return

    setUploadStatus('uploading')
    setError(null)

    // Update all pending files to uploading
    setFiles(prev => prev.map(f => (f.status === 'pending' ? { ...f, status: 'uploading' as const, progress: 0 } : f)))

    // Upload files sequentially
    for (let i = 0; i < pendingFiles.length; i++) {
      const fileWithStatus = pendingFiles[i]
      if (!fileWithStatus) continue
      const file = fileWithStatus.file

      try {
        // Update progress for this file
        setFiles(prev => prev.map(f => (f.file === file ? { ...f, progress: 10, status: 'uploading' as const } : f)))

        // Generate a presigned URL for the file
        const uploadUrl = await generateUploadUrl()
        setFiles(prev => prev.map(f => (f.file === file ? { ...f, progress: 30 } : f)))

        // Upload the file to the storage
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        })
        if (!res.ok) throw new Error('Failed to upload file to storage')
        const { storageId } = await res.json()
        setFiles(prev => prev.map(f => (f.file === file ? { ...f, progress: 70 } : f)))

        // Upload the file metadata to the database
        await uploadDocument({ originalFileId: storageId, fileName: file.name })
        setFiles(prev => prev.map(f => (f.file === file ? { ...f, progress: 100, status: 'success' as const } : f)))
      } catch (err) {
        // Mark as error
        setFiles(prev =>
          prev.map(f =>
            f.file === file
              ? {
                  ...f,
                  status: 'error' as const,
                  error: err instanceof Error ? err.message : 'An error occurred during upload',
                }
              : f,
          ),
        )
        setUploadStatus('error')
      }
    }

    // Check if all files are done
    setFiles(prev => {
      const allDone = prev.every(f => f.status === 'success' || f.status === 'error')
      if (allDone) {
        const allSuccess = prev.every(f => f.status === 'success')
        setUploadStatus(allSuccess ? 'success' : 'error')
      }
      return prev
    })
  }

  const handleRemoveFile = (fileToRemove: File) => {
    setFiles(prev => prev.filter(f => f.file !== fileToRemove))
    if (files.length === 1) {
      setUploadStatus('idle')
      setError(null)
    }
  }

  const handleClearAll = () => {
    setFiles([])
    setUploadStatus('idle')
    setError(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const totalProgress = files.length > 0 ? Math.round(files.reduce((sum, f) => sum + f.progress, 0) / files.length) : 0

  const pendingCount = files.filter(f => f.status === 'pending').length
  const uploadingCount = files.filter(f => f.status === 'uploading').length
  const successCount = files.filter(f => f.status === 'success').length

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Upload Documents</CardTitle>
        <CardDescription>Upload PDF, DOC, or DOCX files for processing</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Drag and Drop Area */}
          {files.length === 0 ? (
            <button
              type="button"
              onDragOver={e => {
                e.preventDefault()
                e.stopPropagation()
                setIsDragging(true)
              }}
              onDragLeave={e => {
                e.preventDefault()
                e.stopPropagation()
                setIsDragging(false)
              }}
              onDrop={e => {
                e.preventDefault()
                e.stopPropagation()
                setIsDragging(false)
                handleFilesSelect(e.dataTransfer.files)
              }}
              onClick={() => fileInput.current?.click()}
              disabled={uploadStatus === 'uploading'}
              aria-label="Upload files by clicking or dragging and dropping"
              className={cn(
                'relative flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50',
                uploadStatus === 'uploading' && 'pointer-events-none opacity-50',
                'disabled:cursor-not-allowed',
              )}
            >
              <input
                type="file"
                ref={fileInput}
                onChange={e => handleFilesSelect(e.target.files)}
                accept={acceptedExtensions.join(',')}
                multiple
                className="hidden"
                disabled={uploadStatus === 'uploading'}
              />
              <Upload className={cn('mb-4 size-10', isDragging ? 'text-primary' : 'text-muted-foreground')} />
              <p className="mb-2 text-center font-medium text-sm">
                {isDragging ? 'Drop your files here' : 'Click to upload or drag and drop'}
              </p>
              <p className="text-center text-muted-foreground text-xs">
                {acceptedExtensions.join(', ').toUpperCase()} (max 50MB per file)
              </p>
            </button>
          ) : (
            <div className="space-y-4">
              {/* Files List */}
              <div className="space-y-2">
                {files.map((fileWithStatus, index) => (
                  <div
                    key={`${fileWithStatus.file.name}-${index}`}
                    className="flex items-start gap-4 rounded-lg border bg-muted/50 p-4"
                  >
                    <div className="shrink-0">
                      <FileText className="size-8 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-sm">{fileWithStatus.file.name}</p>
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
                              {getFileExtension(fileWithStatus.file.name)}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-xs">{formatFileSize(fileWithStatus.file.size)}</p>
                          {fileWithStatus.status === 'uploading' && (
                            <div className="mt-2 space-y-1">
                              <Progress value={fileWithStatus.progress} className="h-1.5" />
                            </div>
                          )}
                          {fileWithStatus.status === 'error' && fileWithStatus.error && (
                            <p className="mt-1 text-destructive text-xs">{fileWithStatus.error}</p>
                          )}
                          {fileWithStatus.status === 'success' && (
                            <div className="mt-1 flex items-center gap-1 text-green-600 text-xs dark:text-green-400">
                              <CheckCircle2 className="size-3" />
                              <span>Uploaded successfully</span>
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRemoveFile(fileWithStatus.file)}
                          disabled={fileWithStatus.status === 'uploading'}
                          className="shrink-0"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Overall Progress */}
              {uploadStatus === 'uploading' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Uploading {uploadingCount} of {files.length} file{files.length !== 1 ? 's' : ''}...
                    </span>
                    <span className="font-medium">{totalProgress}%</span>
                  </div>
                  <Progress value={totalProgress} />
                </div>
              )}

              {/* Success Message */}
              {uploadStatus === 'success' && successCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-green-600 text-sm dark:text-green-400">
                  <CheckCircle2 className="size-4" />
                  <span>
                    {successCount} file{successCount !== 1 ? 's' : ''} uploaded successfully!
                  </span>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive text-sm">
                  <XCircle className="size-4" />
                  <span>{error}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                {pendingCount > 0 && (
                  <Button type="submit" disabled={uploadStatus === 'uploading'} className="flex-1">
                    {uploadStatus === 'uploading' ? (
                      <>
                        <Upload className="size-4 animate-pulse" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="size-4" />
                        Upload {pendingCount} file{pendingCount !== 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                )}
                {uploadStatus !== 'uploading' && (
                  <Button type="button" variant="outline" onClick={handleClearAll}>
                    Clear All
                  </Button>
                )}
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
