'use client'

import { FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { Doc } from '@/convex/_generated/dataModel'
import { cn } from '@/lib/utils'

type DocumentDataSheetProps = {
  document: Doc<'document'>
  renderTrigger?: (state: { hasData: boolean; filledCount: number; totalPlaceholders: number }) => ReactNode
}

type PlaceholderField = NonNullable<Doc<'document'>['data']>[number]

export default function DocumentDataSheet({ document, renderTrigger }: DocumentDataSheetProps) {
  const placeholders = document.data ?? []
  const filledCount = placeholders.filter(field => field.value && field.value.trim() !== '').length
  const sheetTitle = `${document.title || document.fileName || 'Document'} data`

  const triggerNode = renderTrigger?.({
    hasData: placeholders.length > 0,
    filledCount,
    totalPlaceholders: placeholders.length,
  }) ?? (
    <Button variant="secondary" className="whitespace-nowrap">
      <FileText className="mr-2 size-4" />
      View document data
    </Button>
  )

  if (!triggerNode) {
    return null
  }

  return (
    <Sheet>
      <SheetTrigger asChild>{triggerNode}</SheetTrigger>
      <SheetContent side="right" className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{sheetTitle}</SheetTitle>
          <SheetDescription>Placeholders detected in this document and any values provided so far.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {placeholders.length === 0 ? (
            <PlaceholderMessage message="No placeholders have been extracted for this document yet." />
          ) : (
            <>
              <Summary filledCount={filledCount} totalCount={placeholders.length} />
              <div className="space-y-3">
                {placeholders.map(field => (
                  <PlaceholderCard key={field.label} field={field} />
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Summary({ filledCount, totalCount }: { filledCount: number; totalCount: number }) {
  if (totalCount === 0) return null

  return (
    <div className="rounded-md border bg-muted/40 p-3 text-muted-foreground text-xs">
      <span className="font-semibold text-foreground">{filledCount}</span> of {totalCount} placeholders have values.
    </div>
  )
}

function PlaceholderCard({ field }: { field: PlaceholderField }) {
  const hasValue = !!field.value && field.value.trim() !== ''

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-sm">{field.label}</p>
          {field.description && <p className="mt-1 text-muted-foreground text-xs">{field.description}</p>}
        </div>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 font-medium text-xs',
            hasValue
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
          )}
        >
          {hasValue ? 'Filled' : 'Missing'}
        </span>
      </div>
      <div className="mt-4">
        <p className="font-medium text-muted-foreground text-xs uppercase">Value</p>
        <p className={cn('mt-1 whitespace-pre-wrap text-sm', !hasValue && 'text-muted-foreground italic')}>
          {hasValue ? field.value : 'Not provided'}
        </p>
      </div>
    </div>
  )
}

function PlaceholderMessage({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed p-4 text-center text-muted-foreground text-sm">{message}</div>
}
