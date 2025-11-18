import { openai } from '@ai-sdk/openai'
import { Agent, createTool, stepCountIs } from '@convex-dev/agent'
import { z } from 'zod'
import { components, internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'

const agentDefaults = {
  languageModel: openai.chat('gpt-4o'),
  textEmbeddingModel: openai.embedding('text-embedding-3-small'),
}

// document agent creator
export const documentAgent = new Agent(components.agent, {
  name: `Legal Document Processing Agent`,
  instructions: `You are a legal document processing assistant. Your role is to:
1. Extract structured data from legal documents for company records
2. Identify placeholders in legal document templates
3. Intelligently match and fill placeholders using existing company data
4. Ask clarifying questions to lawyers about unfilled placeholders

Be precise, professional, and helpful. Always ask for clarification when information is ambiguous.
If the user asks a question that is not related to the document, politely decline and ask the user to ask a question that is related to the document.
Responses are user facing, so do not include any technical details or information that is not relevant to the user.

Use the tools provided to update the document with relevant generated data. Use the getDocument tool if you need to reference the document.
When using tools, do not delete the remaining placeholders even if they are not filled in the current response.`,
  tools: {
    getDocumentData: createTool({
      description: 'Get the document with the given id',
      args: z.object({
        documentId: z.string().describe('The id of the document to get'),
      }),
      handler: async (ctx, args) => {
        const document: Doc<'document'> = await ctx.runQuery(internal.document.internalGetDocument, {
          documentId: args.documentId as Id<'document'>,
        })
        return {
          success: true,
          message: 'Document retrieved successfully',
          data: document.data
            ?.map(
              (p: { label: string; description: string; value?: string }) =>
                `- ${p.label}: ${p.description} ${p.value ? `(Value: ${p.value})` : ''}`,
            )
            .join('\n'),
        }
      },
    }),
    updateDocumentTitle: createTool({
      description: 'Update the document with the filled and missing data',
      args: z.object({
        documentId: z.string().describe('The id of the document to update'),
        title: z.string().describe('The title of the document'),
      }),
      handler: async (ctx, args) => {
        await ctx.runMutation(internal.document.updateDocumentTitle, {
          documentId: args.documentId as Id<'document'>,
          title: args.title,
        })
        return {
          success: true,
          message: 'Document updated successfully',
        }
      },
    }),
    updateDocumentData: createTool({
      description: 'Update the document with the filled and missing data',
      args: z.object({
        documentId: z.string().describe('The id of the document to update'),
        data: z
          .array(z.object({ label: z.string(), description: z.string(), value: z.optional(z.string()) }))
          .describe('The missing data to update'),
      }),
      handler: async (ctx, args) => {
        await ctx.runMutation(internal.document.updateDocumentData, {
          documentId: args.documentId as Id<'document'>,
          data: args.data,
        })
        return {
          success: true,
          message: 'Document updated successfully',
        }
      },
    }),
    updateDocumentStatus: createTool({
      description: 'Update the status of the document',
      args: z.object({
        documentId: z.string().describe('The id of the document to update'),
        status: z
          .union([
            z.literal('uploaded'),
            z.literal('parsing'),
            z.literal('review'),
            z.literal('completed'),
            z.literal('error'),
          ])
          .describe('The status of the document'),
      }),
      handler: async (ctx, args) => {
        await ctx.runMutation(internal.document.updateDocumentStatus, {
          documentId: args.documentId as Id<'document'>,
          status: args.status,
        })
        return {
          success: true,
          message: 'Document updated successfully',
        }
      },
    }),
    updateDocumentErrorMessage: createTool({
      description: 'Update the error message of the document',
      args: z.object({
        documentId: z.string().describe('The id of the document to update'),
        errorMessage: z.string().describe('The error message to update'),
      }),
      handler: async (ctx, args) => {
        await ctx.runMutation(internal.document.updateDocumentErrorMessage, {
          documentId: args.documentId as Id<'document'>,
          errorMessage: args.errorMessage,
        })
        return {
          success: true,
          message: 'Document updated successfully',
        }
      },
    }),
  },
  stopWhen: stepCountIs(10),
  ...agentDefaults,
})
