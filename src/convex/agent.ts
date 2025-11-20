import { openai } from '@ai-sdk/openai'
import { Agent, createTool, stepCountIs, type ToolCtx } from '@convex-dev/agent'
import { z } from 'zod'
import { components, internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'

type Company = {
  _id: Id<'company'>
  _creationTime: number
  name: string
  data: Record<string, any>
  handlerId: string
}

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
5. Handle company name mentions by finding or creating company records

When a user mentions a company name:
- First, search for existing companies with similar names using searchCompanies
- If similar companies are found, present them to the user and ask for clarification: "I found these similar companies: [list]. Is this the same entity, or should I create a new company?"
- Only ask for clarification if there are multiple companies found. If there is only one company found, automatically use that company.
- If the user confirms it's an existing company:
  - Use getCompanyData to retrieve the company information, which includes aggregated data from all associated documents
  - Use populateCompanyDataFromDocuments to ensure the company record has the latest data from all documents
  - Use that company's aggregated data to fill in relevant placeholders in the document
- If the user says it's a new company or no similar companies are found, create a new company record
- After creating or identifying a company, link it to the current document and use the company's data to fill in placeholders where appropriate
- As soon as a company (new or existing) is linked to the current document, immediately call populateCompanyDataFromDocuments so the company record reflects data aggregated from this document before you auto-fill anything.
- When working with an existing company, always check for data in other documents associated with that company and use that data to enrich the company record
- IMPORTANT: After completing the company search/create step, immediately proceed to asking about remaining placeholders. Do NOT re-list placeholders or re-explain the process. Just start asking about the next unfilled placeholder directly.

When filling placeholders:
- Match placeholder labels/descriptions with company data fields intelligently
- Use company aggregated data (from getCompanyData) to populate placeholders like "Company Name", "Company Address", "Company Registration Number", "Total Number of Shares", etc.
- The aggregated data includes only company-level fields (not document-specific fields like contract dates, agreement terms, etc.) extracted from all documents associated with the company
- Company-level fields include: company name, address, registration numbers, tax IDs, share information, incorporation details, etc.
- Document-specific fields (like contract dates, signing dates, agreement terms) are NOT included in company data as they vary per document
- Only fill placeholders where the company data clearly matches the placeholder's purpose
- When a document is already completed or partially filled, treat every company-level value you find as authoritative: copy the exact text into the placeholder value, and plan to sync it into the company record so future documents can reuse it.
- Company aggregated data keys are normalized to snake_case (for example "company_name"). Always reuse these canonical keys when reading or writing company data and NEVER add duplicate entries that only differ by casing, spacing, or punctuation.
- CRITICAL: When automatically filling placeholders from company data, you MUST:
  1. First, identify all placeholders that can be automatically filled
  2. Present the user with a complete list of placeholders that will be filled, showing the placeholder label and the value that will be used
  3. Ask the user to confirm: "I can automatically fill the following placeholders from the company data: [list]. Would you like me to proceed with filling these?"
  4. Only call updateDocumentData after the user confirms
- If the user declines or asks to modify the list, adjust accordingly before updating
- CRITICAL: When a user directly provides a value for a placeholder (e.g., answers your question about what a field should be), you MUST IMMEDIATELY call updateDocumentData to save that value. Do not wait for confirmation - update the document data right away so the user can download a partially filled document at any time.
- When updating document data, always include ALL existing fields (both filled and unfilled) in the data array. Only update the specific field(s) that have new values, keeping all other fields unchanged.
- Each placeholder entry MUST include:
  - placeholderPattern: the exact characters (including brackets, punctuation, underscores, etc.) as they appear in the document so we can locate the placeholder in the XML
- After the company step is complete and placeholders have been automatically filled (or if none could be filled), immediately proceed to asking about the next unfilled placeholder. Do NOT re-explain the process or re-list all placeholders. Just ask directly: "What should be the value for [placeholder label]?"
- Ask the user for clarification if a placeholder doesn't have a clear match in the company data
- When you identify or create a company, always populate its data from associated documents using populateCompanyDataFromDocuments to ensure you have the latest company-level information. Run this immediately after linking the company so the shared record includes data from the current document.

Be precise, professional, and helpful. Always ask for clarification when information is ambiguous.
If the user asks a question that is not related to the document, politely decline and ask the user to ask a question that is related to the document.
Responses are user facing, so do not include any technical details or information that is not relevant to the user.

Use the tools provided to update the document with relevant generated data. Use the getDocument tool if you need to reference the document.
When using tools, do not delete the remaining placeholders even if they are not filled in the current response.

CRITICAL FOR DATA UPDATES:
- Whenever a user provides a value for a placeholder (answers your question, confirms a value, etc.), you MUST immediately call updateDocumentData to save that value
- When calling updateDocumentData, you MUST include ALL existing document fields (both filled and unfilled) in the data array.
- Only update the specific field(s) that received new values, keeping all other fields exactly as they were.
- Always ensure each placeholder includes key and placeholderPattern so downstream tooling can modify the DOCX safely.
- This ensures the document data is always up-to-date and users can download partially filled documents at any time
- Example: If the document has 5 fields and the user provides a value for field 2, call updateDocumentData with all 5 fields, updating only field 2's value`,
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
      description:
        'Update the document with the given data. IMPORTANT: include ALL existing document fields (both filled and unfilled) in the data array and include metadata for each placeholder: key (snake_case), placeholderPattern (exact characters as they appear in the original document). Only update the specific field(s) that have new values, keeping all other fields unchanged. This ensures the document data stays synchronized and users can download partially filled documents.',
      args: z.object({
        data: z.array(
          z.object({
            label: z.string(),
            description: z.string(),
            placeholderPattern: z.string().optional(),
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
    searchCompanies: createTool({
      description: 'Search for companies by name. Returns a list of companies with similar names, sorted by relevance.',
      args: z.object({
        searchTerm: z.string().describe('The company name to search for'),
      }),
      handler: async (ctx: DocumentAgentCtx, args): Promise<Company[]> => {
        // We need to get companies, but searchCompanies requires auth
        // We'll use internalListCompanies and filter manually
        const allCompanies: Company[] = await ctx.runQuery(internal.company.internalListCompanies, {})

        // Simple fuzzy matching
        const normalizedSearch = args.searchTerm.toLowerCase().trim()
        type MatchResult = { company: Company; score: number }
        const matches: MatchResult[] = allCompanies
          .map((company: Company) => {
            const normalizedName = company.name.toLowerCase().trim()
            const containsMatch = normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName)
            const exactMatch = normalizedName === normalizedSearch
            let similarity = 0
            const minLength = Math.min(normalizedSearch.length, normalizedName.length)
            for (let i = 0; i < minLength; i++) {
              if (normalizedSearch[i] === normalizedName[i]) similarity++
            }
            const similarityScore = similarity / Math.max(normalizedSearch.length, normalizedName.length)

            return {
              company,
              score: exactMatch ? 1 : containsMatch ? 0.8 : similarityScore,
            }
          })
          .filter((match: MatchResult) => match.score > 0.3)
          .sort((a: MatchResult, b: MatchResult) => b.score - a.score)
          .slice(0, 10)

        return matches.map((match: MatchResult) => match.company)
      },
    }),
    getCompanyData: createTool({
      description:
        'Get detailed data for a specific company by its ID. This includes data aggregated from all documents associated with the company.',
      args: z.object({
        companyId: z.string().describe('The ID of the company to retrieve'),
      }),
      handler: async (
        ctx: DocumentAgentCtx,
        args,
      ): Promise<(Company & { aggregatedData: Record<string, any> }) | null> => {
        const company: Company | null = await ctx.runQuery(internal.company.internalGetCompany, {
          id: args.companyId as Id<'company'>,
        })
        if (!company) return null

        // Get aggregated data from all documents
        const aggregatedData: Record<string, any> = await ctx.runQuery(
          internal.company.internalAggregateCompanyDataFromDocuments,
          {
            companyId: args.companyId as Id<'company'>,
          },
        )

        return { ...company, aggregatedData }
      },
    }),
    populateCompanyDataFromDocuments: createTool({
      description:
        'Populate company data by aggregating filled values from all documents associated with the company. Use this to update the company record with data extracted from documents.',
      args: z.object({
        companyId: z.string().describe('The ID of the company to populate data for'),
      }),
      handler: async (ctx: DocumentAgentCtx, args): Promise<{ success: boolean; data: Record<string, any> }> => {
        // Get aggregated data from all documents
        const aggregatedData: Record<string, any> = await ctx.runQuery(
          internal.company.internalAggregateCompanyDataFromDocuments,
          {
            companyId: args.companyId as Id<'company'>,
          },
        )

        // Update the company with aggregated data
        await ctx.runMutation(internal.company.internalUpdateCompanyData, {
          companyId: args.companyId as Id<'company'>,
          data: aggregatedData,
        })

        return { success: true, data: aggregatedData }
      },
    }),
    createCompany: createTool({
      description:
        'Create a new company record. Use this when the user confirms they want to create a new company or when no similar companies are found. After creating and linking, immediately call populateCompanyDataFromDocuments to refresh the company record before filling placeholders.',
      args: z.object({
        name: z.string().describe('The name of the company'),
        data: z
          .record(z.string(), z.any())
          .optional()
          .describe('Additional company data as key-value pairs (e.g., address, registration number, etc.)'),
      }),
      handler: async (ctx: DocumentAgentCtx, args): Promise<{ companyId: string; name: string }> => {
        const document: Doc<'document'> = await ctx.runQuery(internal.document.internalGetDocument, {
          documentId: ctx.documentId,
        })
        const companyId: Id<'company'> = await ctx.runMutation(internal.company.internalCreateCompany, {
          name: args.name,
          data: args.data || {},
          handlerId: document.uploadedById,
        })

        // Link the company to the document
        await ctx.runMutation(internal.document.linkCompanyToDocument, {
          documentId: ctx.documentId,
          companyId,
        })

        return { companyId, name: args.name }
      },
    }),
    linkCompanyToDocument: createTool({
      description:
        'Link an existing company to the current document. Use this when the user confirms an existing company should be associated with this document. After linking, immediately call populateCompanyDataFromDocuments so the company record reflects data from this document.',
      args: z.object({
        companyId: z.string().describe('The ID of the company to link'),
      }),
      handler: async (ctx: DocumentAgentCtx, args) => {
        await ctx.runMutation(internal.document.linkCompanyToDocument, {
          documentId: ctx.documentId,
          companyId: args.companyId as Id<'company'>,
        })
        return { success: true }
      },
    }),
  },
  stopWhen: stepCountIs(10),
  ...agentDefaults,
})
