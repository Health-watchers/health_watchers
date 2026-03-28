'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PatientSchema, type PatientInput } from '@health-watchers/types';
import { Button, Input, Select } from '@/components/ui';

export type PatientFormData = PatientInput;

export interface PatientFormProps {
  initialData?: Partial<PatientFormData>;
  isLoading?: boolean;
  onSubmit: (data: PatientFormData) => Promise<void>;
  onSuccess?: () => void;
  onCancel: () => void;
}

const PatientForm = React.forwardRef<HTMLFormElement, PatientFormProps>(
  ({ initialData, isLoading = false, onSubmit, onSuccess, onCancel }, ref) => {
    const {
      register,
      handleSubmit,
      setError,
      formState: { errors, isSubmitting },
    } = useForm<PatientFormData>({
      resolver: zodResolver(PatientSchema),
      defaultValues: {
        firstName: initialData?.firstName || '',
        lastName: initialData?.lastName || '',
        dateOfBirth: initialData?.dateOfBirth || '',
        sex: initialData?.sex || 'M',
        contactNumber: initialData?.contactNumber || '',
        address: initialData?.address || '',
      },
    });

    const submit = async (data: PatientFormData) => {
      try {
        await onSubmit(data);
        onSuccess?.();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save patient';
        setError('root', { message });
      }
    };

    return (
      <form ref={ref} onSubmit={handleSubmit(submit)} className="space-y-4">
        {errors.root && (
          <p role="alert" className="text-sm text-red-600">
            {errors.root.message}
          </p>
        )}

        {/* First Name */}
        <Input
          label="First Name"
          placeholder="John"
          {...register('firstName')}
          error={errors.firstName?.message}
          disabled={isSubmitting || isLoading}
          required
        />

        {/* Last Name */}
        <Input
          label="Last Name"
          placeholder="Doe"
          {...register('lastName')}
          error={errors.lastName?.message}
          disabled={isSubmitting || isLoading}
          required
        />

        {/* Date of Birth */}
        <Input
          label="Date of Birth"
          type="date"
          {...register('dateOfBirth')}
          error={errors.dateOfBirth?.message}
          disabled={isSubmitting || isLoading}
          required
        />

        {/* Sex */}
        <Select
          label="Sex"
          {...register('sex')}
          error={errors.sex?.message}
          disabled={isSubmitting || isLoading}
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
          placeholder="+1 (555) 123-4567"
          {...register('contactNumber')}
          error={errors.contactNumber?.message}
          disabled={isSubmitting || isLoading}
          required
        />

        {/* Address */}
        <Input
          label="Address"
          placeholder="123 Main Street, City, State 12345"
          {...register('address')}
          error={errors.address?.message}
          disabled={isSubmitting || isLoading}
          required
        />

        {/* Footer with action buttons */}
        <div className="flex gap-3 pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting || isLoading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || isLoading}
            className="flex-1"
          >
            {isSubmitting || isLoading ? 'Saving...' : 'Save Patient'}
          </Button>
        </div>
      </form>
    );
  },
);

PatientForm.displayName = 'PatientForm';

export { PatientForm };
