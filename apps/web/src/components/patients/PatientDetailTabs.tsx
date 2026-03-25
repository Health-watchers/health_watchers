'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface PatientDetailsTab {
  id: string
  label: string
  content: React.ReactNode
}

export interface PatientDetailTabsProps extends React.HTMLAttributes<HTMLDivElement> {
  patientName: string
  patientId: string
  patientInfo: {
    dateOfBirth?: string
    gender?: string
    phone?: string
    address?: string
    [key: string]: any
  }
  tabs: PatientDetailsTab[]
  defaultTab?: string
}

const PatientDetailTabs = React.forwardRef<HTMLDivElement, PatientDetailTabsProps>(
  (
    {
      patientName,
      patientId,
      patientInfo,
      tabs,
      defaultTab,
      className,
      ...props
    },
    ref
  ) => {
    const activeTabId = defaultTab || (tabs.length > 0 ? tabs[0].id : '')
    const [activeTab, setActiveTab] = useState(activeTabId)

    const formatDate = (date?: string): string => {
      if (!date) return 'N/A'
      try {
        return new Date(date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      } catch {
        return 'N/A'
      }
    }

    const getGenderDisplay = (gender?: string): string => {
      if (!gender) return 'N/A'
      const genderMap: Record<string, string> = {
        male: 'Male',
        female: 'Female',
        other: 'Other',
      }
      return genderMap[gender] || gender
    }

    const activeTabContent = tabs.find(tab => tab.id === activeTab)?.content

    return (
      <div ref={ref} className={cn('space-y-6', className)} {...props}>
        {/* Header Card with Patient Info */}
        <Card padding="md">
          <CardHeader>
            <div className="space-y-2">
              <CardTitle className="text-2xl">{patientName}</CardTitle>
              <CardDescription>
                ID: <span className="font-mono text-xs text-secondary-600">{patientId}</span>
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              {patientInfo.dateOfBirth && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-secondary-600 uppercase tracking-wide">
                    Date of Birth
                  </p>
                  <p className="text-sm text-secondary-900">{formatDate(patientInfo.dateOfBirth)}</p>
                </div>
              )}
              {patientInfo.gender && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-secondary-600 uppercase tracking-wide">
                    Gender
                  </p>
                  <p className="text-sm text-secondary-900">{getGenderDisplay(patientInfo.gender)}</p>
                </div>
              )}
              {patientInfo.phone && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-secondary-600 uppercase tracking-wide">
                    Phone
                  </p>
                  <p className="text-sm text-secondary-900">{patientInfo.phone}</p>
                </div>
              )}
              {patientInfo.address && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-secondary-600 uppercase tracking-wide">
                    Address
                  </p>
                  <p className="text-sm text-secondary-900 truncate">{patientInfo.address}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        {tabs.length > 0 && (
          <Card padding="md">
            {/* Tab Navigation */}
            <div className="border-b border-secondary-200 pb-0">
              <div className="flex gap-8">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'relative px-0 py-4 text-sm font-medium transition-colors',
                      activeTab === tab.id
                        ? 'text-primary-600'
                        : 'text-secondary-600 hover:text-secondary-900'
                    )}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <CardContent className="pt-6">
              {activeTabContent ? (
                <div className="space-y-4">{activeTabContent}</div>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <p className="text-secondary-600">No content available for this tab.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    )
  }
)

PatientDetailTabs.displayName = 'PatientDetailTabs'

export { PatientDetailTabs }
