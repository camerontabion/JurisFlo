'use client'

import { useState } from 'react'
import type { Id } from '@/convex/_generated/dataModel'
import CompanySelector from './CompanySelector'
import DocumentList from './DocumentList'
import DocumentUploader from './DocumentUploader'

export default function DashboardContent() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<Id<'company'> | null>(null)

  return (
    <main className="flex w-full max-w-6xl flex-col items-center justify-center gap-4">
      <DocumentUploader />
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <CompanySelector selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} />
        <DocumentList selectedCompanyId={selectedCompanyId} />
      </div>
    </main>
  )
}
