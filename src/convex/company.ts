import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { authComponent } from './auth'
import { createCompanySchema, deleteCompanySchema, updateCompanySchema } from './schema'

const normalizeCompanyDataKey = (input?: string | null): string | null => {
  if (!input) return null
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || null
}

const sanitizeCompanyData = (data?: Record<string, any>): Record<string, any> => {
  const sanitized: Record<string, any> = {}
  if (!data) return sanitized

  for (const [rawKey, value] of Object.entries(data)) {
    const canonicalKey = normalizeCompanyDataKey(rawKey)
    if (!canonicalKey) continue
    if (value === undefined || value === null) continue

    const cleanedValue = typeof value === 'string' ? value.trim() : value
    if (typeof cleanedValue === 'string' && cleanedValue === '') continue

    sanitized[canonicalKey] = cleanedValue
  }

  return sanitized
}

export const createCompany = mutation({
  args: createCompanySchema,
  handler: async (ctx, args) => {
    await authComponent.getAuthUser(ctx)

    const sanitizedData = sanitizeCompanyData(args.data)

    return await ctx.db.insert('company', {
      name: args.name,
      data: sanitizedData,
      handlerId: args.handlerId,
    })
  },
})

export const updateCompany = mutation({
  args: updateCompanySchema.extend({ id: v.id('company') }),
  handler: async (ctx, args) => {
    await authComponent.getAuthUser(ctx)

    const { id, ...updates } = args
    await ctx.db.patch(id, {
      ...updates,
      data: sanitizeCompanyData(updates.data),
    })
    return null
  },
})

export const deleteCompany = mutation({
  args: deleteCompanySchema,
  handler: async (ctx, args) => {
    await authComponent.getAuthUser(ctx)

    await ctx.db.delete(args.id)
    return null
  },
})

export const getCompany = query({
  args: { id: v.id('company') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

export const listCompanies = query({
  args: {},
  handler: async ctx => {
    await authComponent.getAuthUser(ctx)

    return await ctx.db.query('company').collect()
  },
})

export const searchCompanies = query({
  args: { searchTerm: v.string() },
  returns: v.array(
    v.object({
      _id: v.id('company'),
      _creationTime: v.number(),
      name: v.string(),
      data: v.record(v.string(), v.any()),
      handlerId: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await authComponent.getAuthUser(ctx)

    const allCompanies = await ctx.db.query('company').collect()

    // Simple fuzzy matching: normalize names and check for similarity
    const normalizedSearch = args.searchTerm.toLowerCase().trim()

    const matches = allCompanies
      .map(company => {
        const normalizedName = company.name.toLowerCase().trim()
        // Check if search term is contained in name or vice versa
        const containsMatch = normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName)
        // Check for exact match
        const exactMatch = normalizedName === normalizedSearch
        // Calculate simple similarity score (number of matching characters)
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
      .filter(match => match.score > 0.3) // Only return companies with >30% similarity
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .slice(0, 10) // Limit to top 10 matches
      .map(match => match.company)

    return matches
  },
})

export const internalGetCompany = internalQuery({
  args: { id: v.id('company') },
  returns: v.union(
    v.object({
      _id: v.id('company'),
      _creationTime: v.number(),
      name: v.string(),
      data: v.record(v.string(), v.any()),
      handlerId: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

export const internalListCompanies = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('company'),
      _creationTime: v.number(),
      name: v.string(),
      data: v.record(v.string(), v.any()),
      handlerId: v.string(),
    }),
  ),
  handler: async ctx => {
    return await ctx.db.query('company').collect()
  },
})

export const internalCreateCompany = internalMutation({
  args: createCompanySchema,
  returns: v.id('company'),
  handler: async (ctx, args) => {
    const sanitizedData = sanitizeCompanyData(args.data)

    return await ctx.db.insert('company', {
      name: args.name,
      data: sanitizedData,
      handlerId: args.handlerId,
    })
  },
})

/**
 * Determines if a field is company-level (not document-specific) based on its label and description.
 * Company-level fields are things like company name, address, registration number, shares, etc.
 * Document-specific fields are things like contract dates, agreement terms, signing dates, etc.
 */
function isCompanyLevelField(label: string, description: string): boolean {
  const normalizedLabel = label.toLowerCase().trim()
  const normalizedDesc = description.toLowerCase().trim()
  const combined = `${normalizedLabel} ${normalizedDesc}`

  // Company-level keywords
  const companyKeywords = [
    'company name',
    'company address',
    'company registration',
    'registration number',
    'ein',
    'tax id',
    'tax identification',
    'total shares',
    'total number of shares',
    'authorized shares',
    'authorized capital',
    'state of incorporation',
    'incorporation state',
    'company type',
    'entity type',
    'legal entity',
    'corporate address',
    'registered address',
    'principal address',
    'business address',
    'company phone',
    'company email',
    'fiscal year',
    'jurisdiction',
  ]

  // Document-specific keywords (exclude these)
  const documentKeywords = [
    'contract date',
    'agreement date',
    'signing date',
    'effective date',
    'document date',
    'execution date',
    'party name',
    'signatory',
    'signer',
    'witness',
    'document title',
    'agreement title',
    'contract title',
    'term',
    'clause',
    'section',
    'paragraph',
    'exhibit',
    'schedule',
    'annex',
  ]

  // Check if it matches document-specific keywords (exclude these)
  for (const keyword of documentKeywords) {
    if (combined.includes(keyword)) {
      return false
    }
  }

  // Check if it matches company-level keywords
  for (const keyword of companyKeywords) {
    if (combined.includes(keyword)) {
      return true
    }
  }

  // If label contains "company" and doesn't seem document-specific, include it
  if (normalizedLabel.includes('company') && !normalizedLabel.includes('party')) {
    return true
  }

  // If it's about shares/capital and not document-specific, include it
  if (
    (normalizedLabel.includes('share') || normalizedLabel.includes('capital')) &&
    !normalizedLabel.includes('agreement') &&
    !normalizedLabel.includes('contract')
  ) {
    return true
  }

  // Default to excluding if uncertain (be conservative)
  return false
}

export const internalAggregateCompanyDataFromDocuments = internalQuery({
  args: { companyId: v.id('company') },
  returns: v.record(v.string(), v.any()),
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId)
    if (!company) throw new Error('Company not found')

    // Get all documents for this company directly
    const documents = await ctx.db
      .query('document')
      .withIndex('by_company', q => q.eq('companyId', args.companyId))
      .collect()

    // Start with sanitized existing company data
    const aggregatedData: Record<string, any> = sanitizeCompanyData(company.data)

    // Extract filled values from all documents, but only company-level fields
    for (const document of documents) {
      if (document.data) {
        for (const item of document.data) {
          // Only include items that have values and are company-level fields
          const rawValue = typeof item.value === 'string' ? item.value.trim() : item.value
          if (rawValue === undefined || rawValue === null) continue
          if (typeof rawValue === 'string' && rawValue === '') continue

          if (isCompanyLevelField(item.label, item.description)) {
            const preferredKey = normalizeCompanyDataKey(item.key)
            const fallbackKey = normalizeCompanyDataKey(item.label)
            const canonicalKey = preferredKey ?? fallbackKey
            if (!canonicalKey) continue

            // Later documents override earlier ones since we process in creation order
            aggregatedData[canonicalKey] = rawValue
          }
        }
      }
    }

    return aggregatedData
  },
})

export const internalUpdateCompanyData = internalMutation({
  args: {
    companyId: v.id('company'),
    data: v.record(v.string(), v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.companyId, {
      data: sanitizeCompanyData(args.data),
    })
    return null
  },
})
