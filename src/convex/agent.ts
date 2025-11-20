import { openai } from '@ai-sdk/openai'
import { Agent, createTool, stepCountIs, type ToolCtx } from '@convex-dev/agent'
import { z } from 'zod'
import { components, internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'

const agentDefaults = {
  languageModel: openai.chat('gpt-4o'),
  textEmbeddingModel: openai.embedding('text-embedding-3-small'),
}

type DocumentAgentArgs = { documentId: Id<'document'> }
type DocumentAgentCtx = ToolCtx & DocumentAgentArgs

// document agent creator
export const documentAgent = new Agent<DocumentAgentCtx>(components.agent, {
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
    getDocument: createTool({
      description: 'Get the document with the given id',
      args: z.object({}),
      handler: async (ctx: DocumentAgentCtx) => {
        const document: Doc<'document'> = await ctx.runQuery(internal.document.internalGetDocument, {
          documentId: ctx.documentId,
        })
        return document
      },
    }),
    updateDocumentData: createTool({
      description: 'Update the document with the given data',
      args: z.object({
        data: z.array(
          z.object({
            label: z.string(),
            description: z.string(),
            value: z.string().optional(),
          }),
        ),
      }),
      handler: async (ctx: DocumentAgentCtx, args) => {
        await ctx.runMutation(internal.document.updateDocumentData, {
          documentId: ctx.documentId,
          data: args.data,
        })
      },
    }),
  },
  stopWhen: stepCountIs(10),
  ...agentDefaults,
})
