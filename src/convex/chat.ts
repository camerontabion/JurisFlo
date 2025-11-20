import { filterOutOrphanedToolMessages, listMessages, saveMessage, toUIMessages } from '@convex-dev/agent'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { internalAction, mutation, query } from './_generated/server'
import { documentAgent } from './agent'
import { authComponent } from './auth'

// Save a user message, and kick off an async response.
export const sendMessage = mutation({
  args: { documentId: v.id('document'), prompt: v.string(), threadId: v.string() },
  handler: async (ctx, { documentId, prompt, threadId }) => {
    const user = await authComponent.getAuthUser(ctx)
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      userId: user._id,
      message: { role: 'user', content: prompt },
    })
    await ctx.scheduler.runAfter(0, internal.chat.generateResponse, {
      documentId,
      threadId,
      promptMessageId: messageId,
    })
  },
})

// Generate a response to a user message.
export const generateResponse = internalAction({
  args: { documentId: v.id('document'), promptMessageId: v.string(), threadId: v.string() },
  handler: async (ctx, { documentId, promptMessageId, threadId }) => {
    const { thread } = await documentAgent.continueThread({ ...ctx, documentId }, { threadId })
    await thread.generateText(
      { promptMessageId },
      {
        contextOptions: {
          searchOptions: { limit: 100, textSearch: true },
          searchOtherThreads: true,
        },
      },
    )
  },
})

export const listThreadMessages = query({
  args: { threadId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { threadId, paginationOpts }) => {
    await authComponent.getAuthUser(ctx)
    const messages = await listMessages(ctx, components.agent, { threadId, paginationOpts })
    const cleanedPage = filterOutOrphanedToolMessages(messages.page)
    const uiMessages = toUIMessages(cleanedPage)
    return { ...messages, page: uiMessages }
  },
})

export const deleteDocumentThread = internalAction({
  args: { documentId: v.id('document') },
  handler: async (ctx, args) => {
    const document = await ctx.runQuery(internal.document.internalGetDocument, { documentId: args.documentId })
    if (!document) throw new Error('Document not found')
    if (document.threadId) await documentAgent.deleteThreadAsync(ctx, { threadId: document.threadId })
    await ctx.runMutation(internal.document.deleteDocument, { documentId: args.documentId })
  },
})
