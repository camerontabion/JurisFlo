import { useUIMessages } from '@convex-dev/agent/react'
import { useMutation } from 'convex/react'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { cn } from '@/lib/utils'

interface DocumentChatProps {
  documentId: Id<'document'>
  threadId: string
  open: boolean
}

export default function DocumentChat({ documentId, threadId, open }: DocumentChatProps) {
  const [chatMessage, setChatMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const sendMessage = useMutation(api.chat.sendMessage)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wasAgentThinkingRef = useRef(false)

  const {
    results: messages,
    status,
    loadMore,
  } = useUIMessages(api.chat.listThreadMessages, { threadId }, { initialNumItems: 100 })

  // Check if agent is currently thinking (last message is assistant without text)
  const lastMessage = messages[messages.length - 1]
  const isAgentThinking = lastMessage?.role === 'assistant' && !lastMessage.text
  const isDisabled = status === 'LoadingFirstPage' || isAgentThinking || isSending

  useEffect(() => {
    if (open && inputRef.current) {
      // Wait for sheet animation to complete before focusing
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus()
      }, 250)
      return () => clearTimeout(timeoutId)
    }
  }, [open])

  // Scroll to bottom on mount and when messages change
  useEffect(() => {
    if (!scrollContainerRef.current || messages.length === 0 || !open) return
    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
  }, [messages, open])

  // Focus input after agent finishes responding
  useEffect(() => {
    // When agent transitions from thinking to not thinking, focus the input
    if (wasAgentThinkingRef.current && !isAgentThinking && open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
    wasAgentThinkingRef.current = isAgentThinking
  }, [isAgentThinking, open])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatMessage.trim() || isDisabled) return

    setIsSending(true)
    try {
      await sendMessage({ documentId, threadId, prompt: chatMessage })
      setChatMessage('')
    } finally {
      // Reset after a short delay to allow the message to be added to the list
      setTimeout(() => setIsSending(false), 100)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Chat Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-6">
        {/* Load More Button / Loading Indicator at Top */}
        {status === 'CanLoadMore' && (
          <div className="mb-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => loadMore(10)}>
              Load More Messages
            </Button>
          </div>
        )}

        {(status === 'LoadingMore' || status === 'LoadingFirstPage') && (
          <div className="mb-4 flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            <span>{status === 'LoadingMore' ? 'Loading more messages...' : 'Loading messages...'}</span>
          </div>
        )}

        {messages.length === 0 && status !== 'LoadingFirstPage' && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <MessageSquare className="mx-auto mb-3 size-12 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">No messages yet. Start a conversation below.</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((message, index) => {
            const messageId = message.id || `message-${index}`
            return (
              <div
                key={messageId}
                className={cn('flex gap-3', message.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {message.role === 'assistant' && (
                  <div className="shrink-0">
                    <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
                      <MessageSquare className="size-4 text-primary" />
                    </div>
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm',
                    message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                  )}
                >
                  {message.text ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="size-1.5 animate-pulse rounded-full bg-current" />
                      <div className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:0.2s]" />
                      <div className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:0.4s]" />
                    </div>
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
            )
          })}
        </div>
      </div>

      {/* Chat Input */}
      <div className="border-t bg-background px-4 py-4">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            ref={inputRef}
            value={chatMessage}
            onChange={e => setChatMessage(e.target.value)}
            placeholder={isAgentThinking ? 'Agent is thinking...' : 'Type your message...'}
            className="flex-1"
            disabled={isDisabled}
          />
          <Button type="submit" size="icon" disabled={!chatMessage.trim() || isDisabled}>
            {isSending || isAgentThinking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            <span className="sr-only">Send message</span>
          </Button>
        </form>
      </div>
    </div>
  )
}
