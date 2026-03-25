'use client'

import React, { useState, useCallback } from 'react'
import { Button, Input, Select } from '@/components/ui'

export interface PatientFormData {
  firstName: string
  lastName: string
  dateOfBirth: string
  sex: 'M' | 'F' | 'O'
  contactNumber: string
  address: string
}

export interface PatientFormProps {
  initialData?: Partial<PatientFormData>
  isLoading?: boolean
  onSubmit: (data: PatientFormData) => Promise<void>
  onCancel: () => void
}

const PatientForm = React.forwardRef<HTMLFormElement, PatientFormProps>(
  ({ initialData, isLoading = false, onSubmit, onCancel }, ref) => {
    const [formData, setFormData] = useState<PatientFormData>({
      firstName: initialData?.firstName || '',
      lastName: initialData?.lastName || '',
      dateOfBirth: initialData?.dateOfBirth || '',
      sex: initialData?.sex || 'M',
      contactNumber: initialData?.contactNumber || '',
      address: initialData?.address || '',
    })

    const [errors, setErrors] = useState<Partial<Record<keyof PatientFormData, string>>>({})
    const [submitting, setSubmitting] = useState(false)

    const validateForm = useCallback((): boolean => {
      const newErrors: typeof errors = {}

      if (!formData.firstName.trim()) {
        newErrors.firstName = 'First name is required'
      }
      if (!formData.lastName.trim()) {
        newErrors.lastName = 'Last name is required'
      }
      if (!formData.dateOfBirth) {
        newErrors.dateOfBirth = 'Date of birth is required'
      }
      if (!formData.contactNumber.trim()) {
        newErrors.contactNumber = 'Contact number is required'
      }
      if (!formData.address.trim()) {
        newErrors.address = 'Address is required'
      }

      setErrors(newErrors)
      return Object.keys(newErrors).length === 0
    }, [formData])

    const handleChange = useCallback((
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
      const { name, value } = e.target
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }))
      // Clear error when user starts typing
      if (errors[name as keyof PatientFormData]) {
        setErrors(prev => ({
          ...prev,
          [name]: undefined,
        }))
      }
    }, [errors])

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      if (!validateForm()) {
        return
      }

      setSubmitting(true)
      try {
        await onSubmit(formData)
      } catch (error) {
        console.error('Form submission error:', error)
      } finally {
        setSubmitting(false)
      }
    }

    return (
      <form
        ref={ref}
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {/* First Name */}
        <Input
          label="First Name"
          name="firstName"
          placeholder="John"
          value={formData.firstName}
          onChange={handleChange}
          error={errors.firstName}
          disabled={submitting || isLoading}
          required
        />

        {/* Last Name */}
        <Input
          label="Last Name"
          name="lastName"
          placeholder="Doe"
          value={formData.lastName}
          onChange={handleChange}
          error={errors.lastName}
          disabled={submitting || isLoading}
          required
        />

        {/* Date of Birth */}
        <Input
          label="Date of Birth"
          type="date"
          name="dateOfBirth"
          value={formData.dateOfBirth}
          onChange={handleChange}
          error={errors.dateOfBirth}
          disabled={submitting || isLoading}
          required
        />

        {/* Sex */}
        <Select
          label="Sex"
          name="sex"
          value={formData.sex}
          onChange={handleChange}
          error={errors.sex}
          disabled={submitting || isLoading}
          options={[
            { value: 'M', label: 'Male' },
            { value: 'F', label: 'Female' },
            { value: 'O', label: 'Other' },
          ]}
          required
        />

        {/* Contact Number */}
        <Input
          label="Contact Number"
          type="tel"
          name="contactNumber"
          placeholder="+1 (555) 123-4567"
          value={formData.contactNumber}
          onChange={handleChange}
          error={errors.contactNumber}
          disabled={submitting || isLoading}
          required
        />

        {/* Address */}
        <Input
          label="Address"
          name="address"
          placeholder="123 Main Street, City, State 12345"
          value={formData.address}
          onChange={handleChange}
          error={errors.address}
          disabled={submitting || isLoading}
          required
        />

        {/* Footer with action buttons */}
        <div className="flex gap-3 pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting || isLoading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || isLoading}
            className="flex-1"
          >
            {submitting || isLoading ? 'Saving...' : 'Save Patient'}
          </Button>
        </div>
      </form>
    )
  }
)

PatientForm.displayName = 'PatientForm'

export { PatientForm }
