'use node'

import { saveMessage } from '@convex-dev/agent'
import { v } from 'convex/values'
import mammoth from 'mammoth'
import { pdfToText } from 'pdf-ts'
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
    if (
      blob.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      blob.type === 'application/msword'
    ) {
      const arrayBuffer = await blob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const { value } = await mammoth.extractRawText({ buffer })
      rawText = value
    } else if (blob.type === 'application/pdf') {
      const arrayBuffer = await blob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      rawText = await pdfToText(buffer)
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
Create an object according to the attached schema. Do not include any other fields in the object.

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
                value: z.string().optional().describe('The value of the data, if known, otherwise leave blank'),
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

      await ctx.runMutation(internal.document.updateDocumentData, {
        documentId: args.documentId,
        data: result.object.data,
      })
    } catch {
      await ctx.runMutation(internal.document.updateDocumentErrorMessage, {
        documentId: args.documentId,
        errorMessage: 'Failed to parse document',
      })
      await ctx.runMutation(internal.document.updateDocumentStatus, {
        documentId: args.documentId,
        status: 'error' as const,
      })
      return
    }

    // Generate initial response from the thread
    const initialResponse = await thread.generateText(
      {
        prompt: `List out all the fields found in the document.
Inform them that they will fill out the document one field at a time.
Finally end the response with a question about the first missing placeholder in the list.
Rules for individual questions about filling in the missing data:
- Phrase the response as a question about the missing data to the user.
- Respond concisely and to the point. Remove any fluff or extra words.
- Do not include the placeholder label in the question.`,
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

    // Update the document status to review
    await ctx.runMutation(internal.document.updateDocumentStatus, {
      documentId: args.documentId,
      status: 'review' as const,
    })
  },
})
