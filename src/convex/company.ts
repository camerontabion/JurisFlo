import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { authComponent } from './auth'
import { createCompanySchema, deleteCompanySchema, updateCompanySchema } from './schema'

export const createCompany = mutation({
  args: createCompanySchema,
  handler: async (ctx, args) => {
    await authComponent.getAuthUser(ctx)

    return await ctx.db.insert('company', {
      name: args.name,
      data: args.data,
      handlerId: args.handlerId,
    })
  },
})

export const updateCompany = mutation({
  args: updateCompanySchema.extend({ id: v.id('company') }),
  handler: async (ctx, args) => {
    await authComponent.getAuthUser(ctx)

    const { id, ...updates } = args
    await ctx.db.patch(id, updates)
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
