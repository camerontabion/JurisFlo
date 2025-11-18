'use node'

import { v } from 'convex/values'
import mammoth from 'mammoth'
import { pdfToText } from 'pdf-ts'
import { internal } from './_generated/api'
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

    // Use LLM to extract structured company data directly from the document file
    // TODO: add support for looking at other documents to fill in the missing data
    await documentAgent.generateText(
      ctx,
      { userId: document.uploadedById },
      {
        prompt: `Parse this legal document and differentiate between the template text and dynamic placeholders that need to be filled out by a lawyer.

Placeholders can be marked with {{}}, [], _____, or other patterns, or they might be implicit fields.
For example, "{{Company Name}}" or "[Company Name]" or "Company Name" are all valid placeholders.

For each placeholder, provide:
- label: A clear, human-readable label
- description: What information is needed and why

The document text is: ${rawText}

Generate a title (usually related to the file name (${document.fileName}) or the header of the document) and a succinct description for the document based on it's content.
The document id is ${args.documentId}.
`,
      },
    )

    // get the new document with the missing data
    const newDocument = await ctx.runQuery(internal.document.internalGetDocument, { documentId: args.documentId })
    if (!newDocument) throw new Error('Document not found')

    // Create a thread for the document filling process
    const { thread, threadId } = await documentAgent.createThread(ctx, {
      title: `Document: ${newDocument.title || 'Untitled'}`,
      summary: `Processing legal document with ${newDocument.data?.length || 0} placeholders`,
    })

    // Update the document with the thread id
    await ctx.runMutation(internal.document.updateDocumentThread, {
      documentId: args.documentId,
      threadId,
    })

    // Update the document status to review
    await ctx.runMutation(internal.document.updateDocumentStatus, {
      documentId: args.documentId,
      status: 'review' as const,
    })

    // Generate initial response from the thread
    await thread.generateText(
      {
        prompt: `Ask the user to fill in the missing data for the document.
The placeholders are: ${newDocument.data?.map((p: { label: string; description: string; value?: string }) => `- ${p.label}: ${p.description} ${p.value ? `(Value: ${p.value})` : ''}`).join('\n')}
The document id is ${newDocument._id}.

Format the response as follows and start with only the first placeholder:
<Conversational Introduction to the process>
<Conversational Question>
`,
      },
      {
        storageOptions: { saveMessages: 'all' },
        contextOptions: {
          excludeToolMessages: false,
          searchOptions: { limit: 100, textSearch: true },
          searchOtherThreads: true,
        },
      },
    )
  },
})
