import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { authComponent } from './auth'
import {
  updateDocumentDataSchema,
  updateDocumentStatusSchema,
  updateDocumentTitleSchema,
  uploadDocumentSchema,
} from './schema'

export const generateUploadUrl = mutation(async ctx => {
  await authComponent.getAuthUser(ctx)
  return await ctx.storage.generateUploadUrl()
})

export const uploadDocument = mutation({
  args: uploadDocumentSchema,
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx)

    const documentId = await ctx.db.insert('document', {
      title: args.title,
      fileName: args.fileName,
      uploadedById: user._id,
      companyId: args.companyId,
      originalFileId: args.originalFileId,
      generatedFileIds: [],
      status: 'uploaded',
    })

    // Automatically start parsing
    ctx.scheduler.runAfter(0, internal.parser.extractFieldsFromDocument, { documentId })

    return documentId
  },
})

export const getDocument = query({
  args: { documentId: v.id('document') },
  handler: async (ctx, args) => {
    await authComponent.getAuthUser(ctx)
    return await ctx.db.get(args.documentId)
  },
})

export const internalGetDocument = internalQuery({
  args: { documentId: v.id('document') },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId)
    if (!document) throw new Error('Document not found')
    return document
  },
})

export const listDocuments = query({
  args: { companyId: v.optional(v.id('company')) },
  handler: async (ctx, args) => {
    await authComponent.getAuthUser(ctx)

    if (args.companyId)
      return await ctx.db
        .query('document')
        .withIndex('by_company', q => q.eq('companyId', args.companyId))
        .collect()

    return await ctx.db.query('document').collect()
  },
})

export const updateDocumentTitle = internalMutation({
  args: updateDocumentTitleSchema,
  handler: async (ctx, args) =>
    await ctx.db.patch(args.documentId, {
      title: args.title,
    }),
})

export const updateDocumentData = internalMutation({
  args: updateDocumentDataSchema,
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId)
    if (!document) throw new Error('Document not found')

    // Get existing data array or empty array
    const existingData = document.data || []

    // If no new data provided, keep existing data unchanged
    if (!args.data || args.data.length === 0) {
      return
    }

    // Create a map of new items by label for quick lookup
    const newDataMap = new Map(args.data.map(item => [item.label, item]))

    // Track which labels we've seen
    const updatedLabels = new Set<string>()

    // Update existing items in their original order
    const mergedData = existingData.map(item => {
      const updatedItem = newDataMap.get(item.label)
      if (updatedItem) {
        updatedLabels.add(item.label)
        return updatedItem
      }
      return item
    })

    // Add new items that weren't in the existing data
    for (const newItem of args.data) {
      if (!updatedLabels.has(newItem.label)) {
        mergedData.push(newItem)
        updatedLabels.add(newItem.label)
      }
    }

    await ctx.db.patch(args.documentId, {
      data: mergedData,
    })
  },
})

export const updateDocumentStatus = internalMutation({
  args: updateDocumentStatusSchema,
  handler: async (ctx, args) =>
    await ctx.db.patch(args.documentId, {
      status: args.status,
    }),
})

export const updateDocumentErrorMessage = internalMutation({
  args: { documentId: v.id('document'), errorMessage: v.string() },
  handler: async (ctx, args) =>
    await ctx.db.patch(args.documentId, {
      errorMessage: args.errorMessage,
    }),
})

export const updateDocumentThread = internalMutation({
  args: { documentId: v.id('document'), threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.documentId, {
      threadId: args.threadId,
    })
  },
})

export const scheduleDocumentDeletion = mutation({
  args: { documentId: v.id('document') },
  handler: async (ctx, args) => {
    await authComponent.getAuthUser(ctx)
    await ctx.scheduler.runAfter(0, internal.chat.deleteDocumentThread, { documentId: args.documentId })
  },
})

export const deleteDocument = internalMutation({
  args: { documentId: v.id('document') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.documentId)
  },
})
