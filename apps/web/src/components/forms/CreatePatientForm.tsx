'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input, Select, Button } from '@/components/ui';

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  dateOfBirth: z.string().min(1, 'Required'),
  sex: z.enum(['M', 'F', 'O']),
  contactNumber: z.string().min(1, 'Required'),
  address: z.string().min(1, 'Required'),
});

export type CreatePatientData = z.infer<typeof schema>;

interface Props {
  onSubmit: (data: CreatePatientData) => Promise<void>;
  onCancel: () => void;
}

export function CreatePatientForm({ onSubmit, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CreatePatientData>({
    resolver: zodResolver(schema),
    defaultValues: { sex: 'M' },
    mode: 'onBlur',
  });

  const submit = async (data: CreatePatientData) => {
    try {
      await onSubmit(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create patient';
      setError('root', { message: msg });
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="space-y-4">
      {errors.root && (
        <p
          role="alert"
          aria-live="assertive"
          className="bg-danger-50 text-danger-700 rounded-md px-3 py-2 text-sm"
        >
          {errors.root.message}
        </p>
      )}

      <Input
        label="First Name"
        required
        {...register('firstName')}
        error={errors.firstName?.message}
      />
      <Input
        label="Last Name"
        required
        {...register('lastName')}
        error={errors.lastName?.message}
      />
      <Input
        label="Date of Birth"
        type="date"
        required
        {...register('dateOfBirth')}
        error={errors.dateOfBirth?.message}
      />
      <Select
        label="Sex"
        required
        {...register('sex')}
        error={errors.sex?.message}
        options={[
          { value: 'M', label: 'Male' },
          { value: 'F', label: 'Female' },
          { value: 'O', label: 'Other' },
        ]}
      />
      <Input
        label="Contact Number"
        type="tel"
        required
        {...register('contactNumber')}
        error={errors.contactNumber?.message}
      />
      <Input label="Address" required {...register('address')} error={errors.address?.message} />

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? 'Saving...' : 'Save Patient'}
        </Button>
      </div>
    </form>
  );
}
