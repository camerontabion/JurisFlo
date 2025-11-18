'use client'

import { useUIMessages } from '@convex-dev/agent/react'
import { useMutation, useQuery } from 'convex/react'
import { AlertCircle, CheckCircle2, FileText, Loader2, MessageSquare, Send, Trash, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { api } from '@/convex/_generated/api'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import { cn } from '@/lib/utils'

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

export default function DocumentList() {
  const documents = useQuery(api.document.listDocuments, {})
  const [selectedDocumentId, setSelectedDocumentId] = useState<Id<'document'> | null>(null)
  const selectedDocument = documents?.find(doc => doc._id === selectedDocumentId)

  const isLoading = documents === undefined

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>View and manage your uploaded documents</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : documents && documents.length > 0 ? (
          <div className="space-y-2">
            {documents.map(document => {
              const statusConfig = getStatusConfig(document.status)
              const StatusIcon = statusConfig.icon
              const isSpinning = document.status === 'parsing'

              return (
                <button
                  key={document._id}
                  type="button"
                  onClick={() => setSelectedDocumentId(document._id)}
                  className="group w-full text-left"
                  disabled={!document.threadId}
                >
                  <div className="flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors not-group-disabled:hover:cursor-pointer not-group-disabled:hover:bg-accent">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-sm">
                          {document.title || document.fileName || 'Untitled Document'}
                        </p>
                      </div>
                      {document.errorMessage && (
                        <p className="mt-1 text-destructive text-xs">{document.errorMessage}</p>
                      )}
                    </div>
                    <div className="shrink-0">
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
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No documents yet. Upload a document to get started.
          </div>
        )}
      </CardContent>
      {selectedDocument?.threadId && (
        <DocumentSheet
          document={selectedDocument}
          threadId={selectedDocument.threadId}
          setSelectedDocumentId={setSelectedDocumentId}
        />
      )}
    </Card>
  )
}

function DocumentSheet({
  document,
  threadId,
  setSelectedDocumentId,
}: {
  document: Doc<'document'>
  threadId: string
  setSelectedDocumentId: (documentId: Id<'document'> | null) => void
}) {
  const [chatMessage, setChatMessage] = useState('')
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const previousResultsLengthRef = useRef(0)
  const previousScrollResultsLengthRef = useRef(0)
  const previousMessagesTextRef = useRef<string>('')
  const isLoadingMoreRef = useRef(false)
  const scrollPositionBeforeLoadMoreRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null)
  const sendMessage = useMutation(api.chat.sendMessage)
  const {
    results: messages,
    status,
    loadMore: originalLoadMore,
  } = useUIMessages(api.chat.listThreadMessages, { threadId }, { initialNumItems: 10 /* stream: true */ })

  // Wrapper for loadMore that tracks when it's called and preserves scroll position
  const loadMore = useCallback(
    (numItems: number) => {
      const container = messagesContainerRef.current
      if (container) {
        // Store current scroll position before loading more
        scrollPositionBeforeLoadMoreRef.current = {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
        }
      }
      isLoadingMoreRef.current = true
      originalLoadMore(numItems)
    },
    [originalLoadMore],
  )

  // Track message text changes for streaming updates
  const messagesText = messages.map(m => m.text || '').join('|')

  // Initialize previous scroll results length and messages text
  useEffect(() => {
    if (messages.length > 0 && previousScrollResultsLengthRef.current === 0) {
      previousScrollResultsLengthRef.current = messages.length
      previousMessagesTextRef.current = messagesText
    }
  }, [messages.length, messagesText])

  // Check if scrolled to bottom
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const checkScrollPosition = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10 // 10px threshold
      setIsScrolledToBottom(isAtBottom)
    }

    const handleScroll = () => {
      checkScrollPosition()
    }

    container.addEventListener('scroll', handleScroll)
    // Check initial state
    checkScrollPosition()

    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // Helper function to smoothly scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    const container = messagesContainerRef.current
    if (!container) return

    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current
      if (!container) return
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      })
      setIsScrolledToBottom(true)
    })
  }, [])

  // Re-check scroll position when results change (container height may have changed)
  const resultsLength = messages.length
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    if (resultsLength !== previousResultsLengthRef.current) {
      previousResultsLengthRef.current = resultsLength
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current
        if (!container) return
        const { scrollTop, scrollHeight, clientHeight } = container
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 10
        setIsScrolledToBottom(isAtBottom)
      })
    }
  }, [resultsLength])

  // Track message text changes for streaming updates
  useEffect(() => {
    const hasTextChanged = messagesText !== previousMessagesTextRef.current

    if (hasTextChanged) {
      previousMessagesTextRef.current = messagesText
      // Scroll when message text updates (e.g., streaming) if user is at bottom
      if (isScrolledToBottom) {
        scrollToBottom(true)
      }
    }
  }, [messagesText, isScrolledToBottom, scrollToBottom])

  // Auto-scroll to bottom when new messages arrive (user or agent)
  // biome-ignore lint/correctness/useExhaustiveDependencies: resultsLength is needed to trigger scroll when new messages arrive
  useEffect(() => {
    const hasNewMessages = resultsLength !== previousScrollResultsLengthRef.current

    if (hasNewMessages) {
      previousScrollResultsLengthRef.current = resultsLength

      // If loading more, preserve scroll position instead of scrolling to bottom
      if (isLoadingMoreRef.current && scrollPositionBeforeLoadMoreRef.current) {
        const container = messagesContainerRef.current
        if (container) {
          // Use requestAnimationFrame to ensure DOM has updated with new messages
          requestAnimationFrame(() => {
            const container = messagesContainerRef.current
            if (!container) return

            const previousScroll = scrollPositionBeforeLoadMoreRef.current
            if (previousScroll) {
              // Calculate the difference in scroll height (new content added at top)
              const heightDifference = container.scrollHeight - previousScroll.scrollHeight
              // Adjust scroll position to maintain visual position
              container.scrollTop = previousScroll.scrollTop + heightDifference
            }

            // Clear the refs
            scrollPositionBeforeLoadMoreRef.current = null
            isLoadingMoreRef.current = false
          })
        } else {
          isLoadingMoreRef.current = false
          scrollPositionBeforeLoadMoreRef.current = null
        }
      } else {
        // Normal case: scroll to bottom when new messages arrive
        scrollToBottom(true)
        isLoadingMoreRef.current = false
        scrollPositionBeforeLoadMoreRef.current = null
      }
    }
  }, [resultsLength, isScrolledToBottom, scrollToBottom])

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatMessage.trim()) return

    // Add user message
    sendMessage({ threadId, prompt: chatMessage })
    setChatMessage('')

    // Auto-scroll to bottom after sending message
    scrollToBottom(true)
  }

  return (
    <Sheet open={document._id !== null} onOpenChange={open => !open && setSelectedDocumentId(null)}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="wrap-break-word">{document.title || document.fileName || 'Document Chat'}</SheetTitle>
          <SheetDescription>Chat with the AI agent to fill in placeholders for this document</SheetDescription>
          {document._id && (
            <DeleteDocumentButton documentId={document._id} onDelete={() => setSelectedDocumentId(null)} />
          )}
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
          {/* Chat Messages */}
          <div ref={messagesContainerRef} className="flex-1 space-y-4 overflow-y-auto">
            {/* Load More Button / Loading Indicator */}
            {isScrolledToBottom && (
              <div className="flex justify-center py-2">
                {status === 'CanLoadMore' && (
                  <Button variant="outline" size="sm" onClick={() => loadMore(10)}>
                    Load More
                  </Button>
                )}
                {(status === 'LoadingMore' || status === 'LoadingFirstPage') && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="size-4 animate-spin" />
                    <span>{status === 'LoadingMore' ? 'Loading more messages...' : 'Loading messages...'}</span>
                  </div>
                )}
              </div>
            )}
            {messages.slice(1).map((message, index) => (
              <div key={index} className={cn('flex gap-3', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                {message.role === 'assistant' && (
                  <div className="shrink-0">
                    <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
                      <MessageSquare className="size-4 text-primary" />
                    </div>
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-4 py-2',
                    message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {message.text ? (
                    <p className="whitespace-pre-wrap text-sm">{message.text}</p>
                  ) : (
                    <p className="animate-pulse whitespace-pre-wrap text-sm">...</p>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="shrink-0">
                    <div className="flex size-8 items-center justify-center rounded-full bg-primary">
                      <span className="font-medium text-primary-foreground text-xs">You</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="flex gap-2 border-t pt-4">
            <Input
              value={chatMessage}
              onChange={e => setChatMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={!chatMessage.trim()}>
              <Send className="size-4" />
              <span className="sr-only">Send message</span>
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DeleteDocumentButton({ documentId, onDelete }: { documentId: Id<'document'>; onDelete: () => void }) {
  const scheduleDocumentDeletion = useMutation(api.document.scheduleDocumentDeletion)
  const [isDeleting, setIsDeleting] = useState(false)

  return (
    <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" onClick={() => setIsDeleting(true)}>
          Delete <Trash className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Document</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this document? This action cannot be undone.
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
            }}
          >
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
