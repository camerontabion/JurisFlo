'use client'

import { useQuery } from 'convex/react'
import { Building2, ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

type CompanySelectorProps = {
  selectedCompanyId: Id<'company'> | null
  onSelectCompany: (companyId: Id<'company'> | null) => void
}

export default function CompanySelector({ selectedCompanyId, onSelectCompany }: CompanySelectorProps) {
  const companies = useQuery(api.company.listCompanies, {})
  const isLoading = companies === undefined

  const selectedCompany = selectedCompanyId ? companies?.find(c => c._id === selectedCompanyId) : null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between" disabled={isLoading}>
          <div className="flex items-center gap-2">
            <Building2 className="size-4" />
            <span className="truncate">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-3 animate-spin" />
                  Loading...
                </span>
              ) : selectedCompany ? (
                selectedCompany.name
              ) : (
                'All Documents'
              )}
            </span>
          </div>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuItem
          onClick={() => onSelectCompany(null)}
          className={selectedCompanyId === null ? 'bg-accent' : ''}
        >
          <Building2 className="size-4" />
          <span>All Documents</span>
        </DropdownMenuItem>
        {companies && companies.length > 0 && (
          <>
            {companies.map(company => (
              <DropdownMenuItem
                key={company._id}
                onClick={() => onSelectCompany(company._id)}
                className={selectedCompanyId === company._id ? 'bg-accent' : ''}
              >
                <Building2 className="size-4" />
                <span className="truncate">{company.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        {companies && companies.length === 0 && (
          <DropdownMenuItem disabled>
            <span className="text-muted-foreground text-sm">No companies yet</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

