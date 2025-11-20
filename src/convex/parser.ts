'use node'

import { saveMessage } from '@convex-dev/agent'
import { v } from 'convex/values'
import mammoth from 'mammoth'
import z from 'zod'
import { components, internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { documentAgent } from './agent'

// Extract company data from documents using LLM
export const extractFieldsFromDocument = internalAction({
  args: { documentId: v.id('document') },
  handler: async (ctx, args) => {
    const document = await ctx.runQuery(internal.document.internalGetDocument, { documentId: args.documentId })
    if (!document) throw new Error('Document not found')

    const blob = await ctx.storage.get(document.originalFileId)
    if (!blob) throw new Error('File not found')

    let rawText = ''
    if (blob.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const arrayBuffer = await blob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const { value } = await mammoth.extractRawText({ buffer })
      rawText = value
    }

    // remove empty lines
    rawText = rawText.replace(/^\s*$\n/gm, '')

    // Mark document as parsing
    await ctx.runMutation(internal.document.updateDocumentStatus, {
      documentId: args.documentId,
      status: 'parsing' as const,
    })

    // Create a thread FIRST to properly track tool calls and results
    // This ensures tool calls and results are properly paired in the conversation history
    const { thread, threadId } = await documentAgent.createThread(
      { ...ctx, documentId: args.documentId },
      {
        title: `Document: ${document.fileName || 'Untitled'}`,
        summary: `Parsing legal document to extract placeholders`,
        userId: document.uploadedById,
      },
    )

    // Update the document with the thread id early so it's available
    await ctx.runMutation(internal.document.updateDocumentThread, {
      documentId: args.documentId,
      threadId,
    })

    // Use LLM to extract structured company data directly from the document file
    // TODO: add support for looking at other documents to fill in the missing data
    try {
      const result = await thread.generateObject(
        {
          prompt: `Parse this legal document and differentiate between the template text and dynamic placeholders that need to be filled out by a lawyer.
Create an object according to the attached schema. Do not include any other fields in the object. Make sure it matches exactly.

For every placeholder you return:
- Provide a short, human-readable label (title case)
- Provide a helpful description of what belongs in the field
- Provide a unique snake_case key (lowercase letters, numbers, underscores only)
- Provide the exact placeholderPattern string exactly as it appears in the ORIGINAL Word document (including brackets, quotes, underscores, punctuation, spacing). Copy the characters verbatim; never substitute user-provided answers or inferred data. When a blank token and descriptive label appear together (e.g., "of $[_____________] (the “Purchase Amount”) on"), the placeholderPattern MUST be the blank token ("[_____________]").
- Provide value only when it already exists in the uploaded document; otherwise use an empty string.
- Pay special attention to company-level data (company name, address, registration numbers, tax IDs, etc.) so other documents can reuse them later.

Placeholders can be marked with {{}}, [], _____, or other patterns, or they might be implicit fields.
For example, "{{Company Name}}" or "[Company Name]" or "Company Name" or "Company Name:_____" are all valid placeholders.

Include placeholders for the undersigned parties at the bottom of the object.

The document text is: ${rawText}
`,
          schema: z.object({
            title: z
              .string()
              .describe('The title of the document, usually related to the file name or the header of the document'),
            data: z.array(
              z.object({
                label: z.string().describe('A clear, human-readable label'),
                description: z.string().describe('What information is needed and why'),
                placeholderPattern: z
                  .string()
                  .optional()
                  .describe(
                    'Exact placeholder text as it appears in the document, copied verbatim. When both a blank field and a descriptive label appear together (e.g., "of $[_____________] (the “Purchase Amount”) on"), the placeholderPattern MUST be the blank token ("[_____________]"), not the descriptive text in quotes. Always choose the literal characters the user would overwrite.',
                  ),
                value: z.string().optional().describe('The value of the data, if known, otherwise use an empty string'),
              }),
            ),
            errorMessage: z
              .string()
              .optional()
              .describe('An error message if the document could not be parsed, otherwise leave blank'),
          }),
        },
        {
          storageOptions: { saveMessages: 'none' },
          contextOptions: {
            searchOptions: { limit: 100, textSearch: true },
            searchOtherThreads: true,
          },
        },
      )

      // update document with data
      if (result.object.errorMessage) {
        await ctx.runMutation(internal.document.updateDocumentErrorMessage, {
          documentId: args.documentId,
          errorMessage: result.object.errorMessage,
        })
        await ctx.runMutation(internal.document.updateDocumentStatus, {
          documentId: args.documentId,
          status: 'error' as const,
        })
        return
      }

      await ctx.runMutation(internal.document.updateDocumentTitle, {
        documentId: args.documentId,
        title: result.object.title,
      })

      let enrichedData = enrichFieldsWithDocumentContext(rawText, result.object.data)

      if (document.companyId) {
        try {
          const companyData = await ctx.runQuery(internal.company.internalAggregateCompanyDataFromDocuments, {
            companyId: document.companyId,
          })
          enrichedData = autoFillFieldsFromCompanyData(enrichedData, companyData)
        } catch (companyError) {
          console.warn('Failed to auto-fill fields from company data:', companyError)
        }
      }

      await ctx.runMutation(internal.document.updateDocumentData, {
        documentId: args.documentId,
        data: enrichedData,
      })
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Failed to parse document')
      await ctx.runMutation(internal.document.updateDocumentErrorMessage, {
        documentId: args.documentId,
        errorMessage: 'Failed to parse document, please try again.',
      })
      await ctx.runMutation(internal.document.updateDocumentStatus, {
        documentId: args.documentId,
        status: 'error' as const,
      })
      return
    }

    // Generate initial response from the thread
    try {
      const initialResponse = await thread.generateText(
        {
          prompt: `List out all the fields found in the document.
Inform them that they will fill out the document one field at a time.
Finally end the response with a question about the first missing placeholder in the list.
Rules for individual questions about filling in the missing data:
- Phrase the response as a question about the missing data to the user.
- Respond concisely and to the point. Remove any fluff or extra words.
- Do not include the placeholder label in the question.
Check the document data, including any connected company data and company name, to auto-fill any placeholders that can be filled from the company data.`,
        },
        {
          storageOptions: { saveMessages: 'none' },
          contextOptions: {
            searchOptions: { limit: 100, textSearch: true },
            searchOtherThreads: true,
          },
        },
      )

      await saveMessage(ctx, components.agent, {
        threadId,
        message: { role: 'assistant', content: initialResponse.text },
      })
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Failed to generate initial response')
      await ctx.runMutation(internal.document.updateDocumentErrorMessage, {
        documentId: args.documentId,
        errorMessage: 'Failed to generate initial response, please try again.',
      })
      await ctx.runMutation(internal.document.updateDocumentStatus, {
        documentId: args.documentId,
        status: 'error' as const,
      })
    }

    // Update the document status to review
    await ctx.runMutation(internal.document.updateDocumentStatus, {
      documentId: args.documentId,
      status: 'review' as const,
    })
  },
})

type ParsedField = {
  label: string
  description: string
  key?: string
  placeholderPattern?: string
  value?: string
}

function enrichFieldsWithDocumentContext(rawText: string, fields: ParsedField[]): ParsedField[] {
  const normalizedText = rawText.toLowerCase()
  return fields.map(field => {
    const normalizedPattern = field.placeholderPattern?.trim()
    let derivedContext =
      (normalizedPattern && extractContextFromRawText(rawText, normalizedText, normalizedPattern)) || undefined

    if (!derivedContext) {
      const labelBasedContext = findPlaceholderContextByLabel(rawText, normalizedText, field.label, field.key)
      if (labelBasedContext) {
        derivedContext = labelBasedContext.context
        if (!normalizedPattern && labelBasedContext.placeholderToken) {
          field.placeholderPattern = labelBasedContext.placeholderToken
        }
      }
    }

    if (!derivedContext) {
      derivedContext = extractContextFromRawText(rawText, normalizedText, field.label)
    }

    return {
      ...field,
      placeholderPattern: field.placeholderPattern?.trim(),
      value: field.value ?? '',
    }
  })
}

function extractContextFromRawText(rawText: string, normalizedText: string, snippet: string): string | undefined {
  const trimmedSnippet = snippet.trim()
  if (!trimmedSnippet) return undefined

  const snippetLower = trimmedSnippet.toLowerCase()
  const index = normalizedText.indexOf(snippetLower)
  if (index === -1) {
    return undefined
  }

  const padding = Math.max(40, trimmedSnippet.length)
  const start = Math.max(0, index - padding)
  const end = Math.min(rawText.length, index + trimmedSnippet.length + padding)
  return rawText.slice(start, end).replace(/\s+/g, ' ').trim()
}

function findPlaceholderContextByLabel(
  rawText: string,
  normalizedText: string,
  label: string,
  key?: string,
): { context: string; placeholderToken?: string } | null {
  const tokens = buildLabelTokenCandidates(label, key)
  for (const token of tokens) {
    const index = normalizedText.indexOf(token)
    if (index !== -1) {
      const padding = Math.max(40, token.length)
      const start = Math.max(0, index - padding)
      const end = Math.min(rawText.length, index + token.length + padding)
      return {
        context: rawText.slice(start, end).replace(/\s+/g, ' ').trim(),
        placeholderToken: rawText.slice(index, index + token.length),
      }
    }
  }
  return null
}

function buildLabelTokenCandidates(label: string, key?: string): string[] {
  const candidates = new Set<string>()
  const normalizedLabel = label.trim()
  if (normalizedLabel) {
    candidates.add(normalizedLabel)
    candidates.add(normalizedLabel.replace(/\s+/g, '_'))
  }
  if (key) {
    candidates.add(key.trim())
    candidates.add(key.replace(/_/g, ' '))
  }

  const wrappers = [
    (value: string) => `[${value}]`,
    (value: string) => `[[${value}]]`,
    (value: string) => `{{${value}}}`,
    (value: string) => `{${value}}`,
    (value: string) => `${value}:_____`,
    (value: string) => `${value} _____`,
    (value: string) => `_____ ${value}`,
  ]

  const tokens: string[] = []
  candidates.forEach(candidate => {
    const trimmed = candidate.trim()
    if (!trimmed) return
    wrappers.forEach(wrapper => {
      tokens.push(wrapper(trimmed).toLowerCase())
      tokens.push(wrapper(trimmed.toUpperCase()).toLowerCase())
      tokens.push(wrapper(trimmed.toLowerCase()).toLowerCase())
      tokens.push(wrapper(toTitleCase(trimmed)).toLowerCase())
    })
  })
  return tokens
}

function toTitleCase(input: string): string {
  return input.replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

function autoFillFieldsFromCompanyData(fields: ParsedField[], companyData: Record<string, any>): ParsedField[] {
  const normalizedCompanyValues = new Map<string, string>()
  for (const [key, rawValue] of Object.entries(companyData)) {
    if (typeof rawValue !== 'string') continue
    const trimmedValue = rawValue.trim()
    if (!trimmedValue) continue
    const normalizedKey = normalizeIdentifier(key)
    if (normalizedKey) {
      normalizedCompanyValues.set(normalizedKey, trimmedValue)
    }
  }

  return fields.map(field => {
    if (field.value && field.value.trim() !== '') return field

    const candidateKeys: Array<string | null> = [
      field.key ? normalizeIdentifier(field.key) : null,
      normalizeIdentifier(field.label),
      field.description ? normalizeIdentifier(field.description) : null,
    ]

    for (const candidate of candidateKeys) {
      if (!candidate) continue
      const companyValue = normalizedCompanyValues.get(candidate)
      if (companyValue) {
        return {
          ...field,
          value: companyValue,
          description: annotateDescriptionWithAutoFilled(field.description),
        }
      }
    }

    return field
  })
}

function annotateDescriptionWithAutoFilled(description: string): string {
  if (!description) return 'Auto-filled from company data'
  if (description.toLowerCase().includes('auto-filled from company data')) {
    return description
  }
  return `${description} (Auto-filled from company data)`
}

function normalizeIdentifier(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
