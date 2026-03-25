'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Input, Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui'
import { type Patient, formatDate } from '@health-watchers/types'

export type { Patient }

export interface PatientTableProps {
  patients: Patient[]
  isLoading?: boolean
  onEdit: (patient: Patient) => void
  onViewDetails: (patient: Patient) => void
  onSearch: (query: string) => Promise<void>
}

const PatientTable = React.forwardRef<HTMLDivElement, PatientTableProps>(
  ({ patients, isLoading = false, onEdit, onViewDetails, onSearch }, ref) => {
    const [searchQuery, setSearchQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [searching, setSearching] = useState(false)
    const itemsPerPage = 10

    useEffect(() => {
      const timer = setTimeout(async () => {
        if (searchQuery.trim()) {
          setSearching(true)
          try {
            await onSearch(searchQuery)
          } catch (error) {
            console.error('Search error:', error)
          } finally {
            setSearching(false)
          }
        }
        setCurrentPage(1)
      }, 300)
      return () => clearTimeout(timer)
    }, [searchQuery, onSearch])

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value)
    }, [])

    const handleClearSearch = useCallback(() => {
      setSearchQuery('')
    }, [])

    const totalPages = Math.ceil(patients.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const paginatedPatients = patients.slice(startIndex, startIndex + itemsPerPage)

    return (
      <div ref={ref} className="space-y-4">
        {/* Search Bar */}
        <div className="flex gap-2">
          <Input
            placeholder="Search by name..."
            value={searchQuery}
            onChange={handleSearchChange}
            disabled={isLoading || searching}
            className="flex-1"
          />
          {searchQuery && (
            <Button type="button" variant="outline" onClick={handleClearSearch} disabled={isLoading || searching}>
              Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-secondary-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>System ID</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead>Sex</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading || searching ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    <p className="text-secondary-600">Loading patients...</p>
                  </TableCell>
                </TableRow>
              ) : paginatedPatients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    <p className="text-secondary-600">
                      {searchQuery ? 'No patients found matching your search.' : 'No patients available.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPatients.map(patient => (
                  <TableRow key={patient._id}>
                    <TableCell className="font-mono text-xs text-secondary-500">
                      {patient.systemId}
                    </TableCell>
                    <TableCell className="font-medium text-secondary-900">
                      {patient.firstName} {patient.lastName}
                    </TableCell>
                    <TableCell>{formatDate(patient.dateOfBirth)}</TableCell>
                    <TableCell>{patient.sex}</TableCell>
                    <TableCell className="text-sm text-secondary-600">
                      {patient.contactNumber || 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => onViewDetails(patient)}>
                          View
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onEdit(patient)}>
                          Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-secondary-600">
              Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, patients.length)} of{' '}
              {patients.length} patients
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1 || isLoading}
              >
                Previous
              </Button>
              <div className="flex items-center gap-2">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`h-10 w-10 rounded-md text-sm font-medium transition-colors ${
                      currentPage === page
                        ? 'bg-primary-600 text-white'
                        : 'border border-secondary-300 text-secondary-900 hover:bg-secondary-50'
                    }`}
                    disabled={isLoading}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages || isLoading}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }
)

PatientTable.displayName = 'PatientTable'

export { PatientTable }
