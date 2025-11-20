'use client'

import { useMutation, useQuery } from 'convex/react'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Download,
  Edit,
  FileText,
  Loader2,
  RotateCw,
  Trash,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { api } from '@/convex/_generated/api'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import DocumentChat from './DocumentChat'

type DocumentStatus = 'uploaded' | 'parsing' | 'review' | 'completed' | 'error'

function getStatusConfig(status?: DocumentStatus) {
  switch (status) {
    case 'uploaded':
      return {
        label: 'Uploaded',
        icon: FileText,
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      }
    case 'parsing':
      return {
        label: 'Parsing',
        icon: Loader2,
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      }
    case 'review':
      return {
        label: 'Review',
        icon: CheckCircle2,
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      }
    case 'completed':
      return {
        label: 'Completed',
        icon: CheckCircle2,
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      }
    case 'error':
      return {
        label: 'Error',
        icon: XCircle,
        className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      }
    default:
      return {
        label: 'Unknown',
        icon: AlertCircle,
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      }
  }
}

type DocumentListProps = {
  selectedCompanyId: Id<'company'> | null
}

export default function DocumentList({ selectedCompanyId }: DocumentListProps) {
  const documents = useQuery(api.document.listDocuments, selectedCompanyId ? { companyId: selectedCompanyId } : {})
  const companies = useQuery(api.company.listCompanies, {})
  const [selectedDocumentId, setSelectedDocumentId] = useState<Id<'document'> | null>(null)
  const selectedDocument = documents?.find(doc => doc._id === selectedDocumentId)

  const isLoading = documents === undefined || companies === undefined

  // Group documents by company when showing all documents
  const groupedDocuments = selectedCompanyId
    ? null // Don't group when a specific company is selected
    : documents
      ? documents.reduce(
          (acc, doc) => {
            const key = doc.companyId || 'unassigned'
            if (!acc[key]) {
              acc[key] = []
            }
            acc[key].push(doc)
            return acc
          },
          {} as Record<string | Id<'company'>, Doc<'document'>[]>,
        )
      : null

  const renderDocument = (document: Doc<'document'>) => {
    const statusConfig = getStatusConfig(document.status)
    const StatusIcon = statusConfig.icon
    const isSpinning = document.status === 'parsing'
    const isError = document.status === 'error'
    const isClickable = document.status === 'review' || isError

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      // Don't trigger if clicking on action buttons or their children
      const target = e.target as HTMLElement
      if (target.closest('button[data-action-button]') || target.closest('[data-action-button]')) {
        return
      }
      if (isClickable) {
        setSelectedDocumentId(document._id)
      }
    }

    return (
      <div key={document._id} className="group w-full">
        <button
          type="button"
          onClick={handleClick}
          disabled={!isClickable}
          className={cn(
            'flex w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors',
            isClickable && 'cursor-pointer hover:border-accent-foreground/20 hover:bg-accent',
            !isClickable && 'cursor-not-allowed opacity-60',
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium text-sm">
                {document.title || document.fileName || 'Untitled Document'}
              </p>
            </div>
            {document.errorMessage && <p className="mt-1 text-destructive text-xs">{document.errorMessage}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isError && (
              <div className="flex items-center gap-1" data-action-button>
                <RetryDocumentButton documentId={document._id} />
                <DeleteDocumentButton documentId={document._id} onDelete={() => {}} />
              </div>
            )}
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-xs',
                statusConfig.className,
              )}
            >
              <StatusIcon className={cn('size-3', isSpinning && 'animate-spin')} />
              <span>{statusConfig.label}</span>
            </div>
          </div>
        </button>
      </div>
    )
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>
          {selectedCompanyId
            ? 'Documents for selected company'
            : 'View and manage your uploaded documents organized by company'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : documents && documents.length > 0 ? (
          <div className="space-y-6">
            {selectedCompanyId ? (
              // Show flat list when a company is selected
              <div className="space-y-2">{documents.map(renderDocument)}</div>
            ) : groupedDocuments ? (
              // Show grouped view when showing all documents
              Object.entries(groupedDocuments).map(([companyId, companyDocs]) => {
                const company = companyId !== 'unassigned' ? companies?.find(c => c._id === companyId) : null
                return (
                  <div key={companyId} className="space-y-3">
                    <div className="flex items-center gap-2 border-b pb-2">
                      <Building2 className="size-4 text-muted-foreground" />
                      <h3 className="font-semibold text-sm">{company ? company.name : 'Unassigned Documents'}</h3>
                      <span className="text-muted-foreground text-xs">({companyDocs.length})</span>
                    </div>
                    <div className="space-y-2 pl-6">{companyDocs.map(renderDocument)}</div>
                  </div>
                )
              })
            ) : null}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">
            {selectedCompanyId
              ? 'No documents for this company yet.'
              : 'No documents yet. Upload a document to get started.'}
          </div>
        )}
      </CardContent>
      {selectedDocument?.threadId &&
        (selectedDocument.status === 'review' ||
          selectedDocument.status === 'completed' ||
          selectedDocument.status === 'error') && (
          <DocumentSheet
            document={selectedDocument}
            threadId={selectedDocument.threadId}
            selectedDocumentId={selectedDocumentId}
            setSelectedDocumentId={setSelectedDocumentId}
          />
        )}
    </Card>
  )
}

function DocumentSheet({
  document,
  threadId,
  selectedDocumentId,
  setSelectedDocumentId,
}: {
  document: Doc<'document'>
  threadId: string
  selectedDocumentId: Id<'document'> | null
  setSelectedDocumentId: (documentId: Id<'document'> | null) => void
}) {
  const isOpen = selectedDocumentId === document._id

  return (
    <Sheet open={isOpen} onOpenChange={open => !open && setSelectedDocumentId(null)}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4 pr-14">
          <div className="space-y-3">
            <div>
              <SheetTitle className="wrap-break-word text-lg">
                {document.title || document.fileName || 'Document Chat'}
              </SheetTitle>
              <SheetDescription className="mt-1.5">
                Chat with the AI agent to fill in placeholders for this document
              </SheetDescription>
            </div>
            {document._id && (
              <div className="flex items-center gap-2">
                <DocumentActionButtons document={document} onDelete={() => setSelectedDocumentId(null)} />
              </div>
            )}
          </div>
        </SheetHeader>

        <DocumentChat documentId={document._id} threadId={threadId} open={document._id !== null} />
      </SheetContent>
    </Sheet>
  )
}

function DocumentActionButtons({ document, onDelete }: { document: Doc<'document'>; onDelete: () => void }) {
  const handleDownload = () => {
    // TODO: Implement download functionality
    console.log('Download document:', document._id)
  }

  const handleEditTitle = () => {
    // TODO: Implement edit title functionality
    console.log('Edit title for document:', document._id)
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground"
        onClick={handleDownload}
        title="Download document"
      >
        <Download className="size-4" />
        <span className="sr-only">Download document</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground"
        onClick={handleEditTitle}
        title="Edit title"
      >
        <Edit className="size-4" />
        <span className="sr-only">Edit title</span>
      </Button>
      <DeleteDocumentButton documentId={document._id} onDelete={onDelete} />
    </div>
  )
}

function RetryDocumentButton({ documentId }: { documentId: Id<'document'> }) {
  const retryDocumentParsing = useMutation(api.document.retryDocumentParsing)
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await retryDocumentParsing({ documentId })
    } catch (error) {
      console.error('Failed to retry document parsing:', error)
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-foreground"
      onClick={handleRetry}
      disabled={isRetrying}
      title="Retry parsing"
      data-action-button
    >
      <RotateCw className={cn('size-4', isRetrying && 'animate-spin')} />
      <span className="sr-only">Retry parsing</span>
    </Button>
  )
}

function DeleteDocumentButton({ documentId, onDelete }: { documentId: Id<'document'>; onDelete: () => void }) {
  const scheduleDocumentDeletion = useMutation(api.document.scheduleDocumentDeletion)
  const [isDeleting, setIsDeleting] = useState(false)

  return (
    <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setIsDeleting(true)}
          data-action-button
        >
          <Trash className="size-4" />
          <span className="sr-only">Delete document</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Document</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this document? This action cannot be undone and all associated data will be
            permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => setIsDeleting(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              scheduleDocumentDeletion({ documentId })
              onDelete()
              setIsDeleting(false)
            }}
          >
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
