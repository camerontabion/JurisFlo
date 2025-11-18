import { listUIMessages, saveMessage } from '@convex-dev/agent'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { internalAction, mutation, query } from './_generated/server'
import { documentAgent } from './agent'
import { authComponent } from './auth'

// Save a user message, and kick off an async response.
export const sendMessage = mutation({
  args: { prompt: v.string(), threadId: v.string() },
  handler: async (ctx, { prompt, threadId }) => {
    await authComponent.getAuthUser(ctx)
    const { messageId } = await saveMessage(ctx, components.agent, { threadId, prompt })
    await ctx.scheduler.runAfter(0, internal.chat.generateResponse, { threadId, promptMessageId: messageId })
  },
})

// Generate a response to a user message.
export const generateResponse = internalAction({
  args: { promptMessageId: v.string(), threadId: v.string() },
  handler: async (ctx, { promptMessageId, threadId }) => {
    await documentAgent.generateText(ctx, { threadId }, { promptMessageId })
  },
})

export const listThreadMessages = query({
  args: { threadId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { threadId, paginationOpts }) => {
    await authComponent.getAuthUser(ctx)
    const messages = await listUIMessages(ctx, components.agent, { threadId, paginationOpts })
    return messages
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
