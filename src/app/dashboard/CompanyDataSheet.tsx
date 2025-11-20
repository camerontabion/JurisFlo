'use client'

import { useQuery } from 'convex/react'
import { FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

type CompanyDataSheetProps = {
  companyId: Id<'company'> | null
  renderTrigger?: (state: { isLoading: boolean; companyName?: string }) => ReactNode
}

export default function CompanyDataSheet({ companyId, renderTrigger }: CompanyDataSheetProps) {
  const companies = useQuery(api.company.listCompanies, {})
  const isLoading = companies === undefined

  const selectedCompany = useMemo(() => {
    if (!companyId || !companies) return null
    return companies.find(company => company._id === companyId) ?? null
  }, [companyId, companies])

  const dataEntries = useMemo(() => {
    if (!selectedCompany?.data) return []

    return Object.entries(selectedCompany.data).filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    )
  }, [selectedCompany])

  const sheetTitle = selectedCompany ? `${selectedCompany.name} data` : 'Company data'

  if (!companyId) {
    return null
  }

  const triggerNode = renderTrigger?.({ isLoading, companyName: selectedCompany?.name }) ?? (
    <Button variant="secondary" disabled={isLoading} className="whitespace-nowrap">
      <FileText className="mr-2 size-4" />
      View company data
    </Button>
  )

  if (!triggerNode) {
    return null
  }

  return (
    <Sheet>
      <SheetTrigger asChild>{triggerNode}</SheetTrigger>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{sheetTitle}</SheetTitle>
          <SheetDescription>Saved company-level fields gathered from your documents.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {isLoading && <PlaceholderMessage message="Loading company data..." />}
          {!isLoading && !selectedCompany && (
            <PlaceholderMessage message="We couldn't find this company. It may have been removed." />
          )}
          {!isLoading && selectedCompany && dataEntries.length === 0 && (
            <PlaceholderMessage message="No structured company data saved yet." />
          )}
          {!isLoading && selectedCompany && dataEntries.length > 0 && (
            <dl className="space-y-3">
              {dataEntries.map(([key, value]) => (
                <div key={key} className="rounded-md border bg-muted/40 p-4">
                  <dt className="font-medium text-muted-foreground text-sm">{formatLabel(key)}</dt>
                  <dd className="wrap-break-word mt-1 whitespace-pre-wrap text-foreground text-sm">
                    {formatValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function PlaceholderMessage({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed p-4 text-center text-muted-foreground text-sm">{message}</div>
}

function formatLabel(key: string) {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
