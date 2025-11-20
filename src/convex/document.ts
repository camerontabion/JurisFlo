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

export const generateUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    await authComponent.getAuthUser(ctx)
    return await ctx.storage.generateUploadUrl()
  },
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

export const getDocumentDownloadUrl = query({
  args: { documentId: v.id('document') },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx)
    const document = await ctx.db.get(args.documentId)
    if (!document) throw new Error('Document not found')

    // Verify user owns the document
    if (document.uploadedById !== user._id) {
      throw new Error('Unauthorized')
    }

    // Get the download URL for the original file
    const downloadUrl = await ctx.storage.getUrl(document.originalFileId)
    if (!downloadUrl) throw new Error('File not found')

    return downloadUrl
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

export const editDocumentTitle = mutation({
  args: updateDocumentTitleSchema,
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx)
    const document = await ctx.db.get(args.documentId)
    if (!document) throw new Error('Document not found')
    if (document.uploadedById !== user._id) throw new Error('Unauthorized')

    await ctx.runMutation(internal.document.updateDocumentTitle, args)
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

    // Check if all fields are now filled and update status accordingly
    const allFieldsFilled = mergedData.every(item => item.value && item.value.trim() !== '')

    // Update data and status in a single patch
    const statusUpdate: { status?: 'review' | 'completed' } = {}
    if (document.status === 'review' && allFieldsFilled) {
      // All fields filled, mark as completed
      statusUpdate.status = 'completed'
    } else if (document.status === 'completed' && !allFieldsFilled) {
      // A field was cleared, change back to review
      statusUpdate.status = 'review'
    }

    await ctx.db.patch(args.documentId, {
      data: mergedData,
      ...statusUpdate,
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
  args: { documentId: v.id('document'), errorMessage: v.optional(v.string()) },
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

export const retryDocumentParsing = mutation({
  args: { documentId: v.id('document') },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx)
    const document = await ctx.db.get(args.documentId)
    if (!document) throw new Error('Document not found')

    // Verify user owns the document
    if (document.uploadedById !== user._id) {
      throw new Error('Unauthorized')
    }

    // Clear error message and reset status
    await ctx.db.patch(args.documentId, {
      status: 'uploaded',
      errorMessage: undefined,
    })

    // Re-trigger parsing
    ctx.scheduler.runAfter(0, internal.parser.extractFieldsFromDocument, { documentId: args.documentId })
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
    const document = await ctx.db.get(args.documentId)
    if (!document) return

    // Delete files from storage
    try {
      if (document.originalFileId) {
        await ctx.storage.delete(document.originalFileId)
      }
      if (document.generatedFileId) {
        await ctx.storage.delete(document.generatedFileId)
      }
    } catch (error) {
      // Log error but continue with document deletion
      console.error('Error deleting files from storage:', error)
    }

    // Delete the document record
    await ctx.db.delete(args.documentId)
  },
})

export const linkCompanyToDocument = internalMutation({
  args: { documentId: v.id('document'), companyId: v.id('company') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      companyId: args.companyId,
    })
    return null
  },
})

export const internalGetDocumentsByCompany = internalQuery({
  args: { companyId: v.id('company') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('document')
      .withIndex('by_company', q => q.eq('companyId', args.companyId))
      .collect()
  },
})

export const addGeneratedFile = internalMutation({
  args: { documentId: v.id('document'), generatedFileId: v.id('_storage') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      generatedFileId: args.generatedFileId,
    })
  },
})

export const getGeneratedFileDownloadUrl = query({
  args: { documentId: v.id('document') },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx)
    const document = await ctx.db.get(args.documentId)
    if (!document) throw new Error('Document not found')

    // Verify user owns the document
    if (document.uploadedById !== user._id) {
      throw new Error('Unauthorized')
    }

    if (!document.generatedFileId) {
      throw new Error('No generated file found')
    }

    const downloadUrl = await ctx.storage.getUrl(document.generatedFileId)
    if (!downloadUrl) throw new Error('Generated file not found')

    return downloadUrl
  },
})
