import { defineSchema, defineTable } from 'convex/server'
import { type Infer, v } from 'convex/values'

const schema = defineSchema({
  company: defineTable({
    name: v.string(),
    data: v.record(v.string(), v.any()), // Company data stored as key-value pairs
    handlerId: v.string(), // The user who is currently handling the company
  }).index('by_handler', ['handlerId']),

  // Legal document drafts being processed
  document: defineTable({
    title: v.optional(v.string()),
    fileName: v.optional(v.string()),
    uploadedById: v.string(), // The user who uploaded the document
    companyId: v.optional(v.id('company')),
    threadId: v.optional(v.string()), // the thread id of the document processing, used for chat
    originalFileId: v.id('_storage'), // Raw file uploaded by the user
    generatedFileIds: v.optional(v.array(v.id('_storage'))), // Completed documents (PDF and DOCX)
    status: v.optional(
      v.union(
        v.literal('uploaded'),
        v.literal('parsing'),
        v.literal('review'),
        v.literal('completed'),
        v.literal('error'),
      ),
    ),
    data: v.optional(
      v.array(
        v.object({
          label: v.string(),
          description: v.string(),
          value: v.optional(v.string()),
        }),
      ),
    ),
    errorMessage: v.optional(v.string()),
  })
    .index('by_company', ['companyId'])
    .index('by_status', ['status']),
})

export default schema

const company = schema.tables.company.validator
const document = schema.tables.document.validator

export type Company = Infer<typeof company>
export type Document = Infer<typeof document>

export const createCompanySchema = v.object({
  name: company.fields.name,
  data: company.fields.data,
  handlerId: company.fields.handlerId,
})

export const updateCompanySchema = v.object({
  name: company.fields.name,
  data: company.fields.data,
  handlerId: company.fields.handlerId,
})

export const deleteCompanySchema = v.object({
  id: v.id('company'),
})

export const uploadDocumentSchema = v.object({
  originalFileId: document.fields.originalFileId,
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  fileName: v.optional(v.string()),
  companyId: v.optional(v.id('company')),
})

export const updateDocumentTitleSchema = v.object({
  documentId: v.id('document'),
  title: v.optional(v.string()),
})

export const updateDocumentDataSchema = v.object({
  documentId: v.id('document'),
  data: document.fields.data,
})

export const updateDocumentStatusSchema = v.object({
  documentId: v.id('document'),
  status: document.fields.status,
})
