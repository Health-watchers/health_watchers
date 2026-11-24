# Empty State Design Pattern

## Overview

Empty states appear when a page, section, or list contains no data to display. They serve three purposes:
1. **Inform** users why the area is empty
2. **Guide** users toward the next action
3. **Encourage** engagement with the feature

## When to Use Empty States

- **Data lists**: Patient lists, encounters, payments, appointments
- **Search results**: When no matches are found
- **Notifications**: When there are no unread notifications
- **First-time experiences**: When a user hasn't created any content yet

## Anatomy of an Empty State

A good empty state includes:

1. **Illustration or Icon** (required)
   - Use lucide-react icons wrapped in a circular background
   - Use semantic icons that relate to the content type
   - Size: 48px (h-12 w-12)

2. **Title** (required)
   - Clear, concise message explaining the empty state
   - Use sentence case
   - Examples: "No patients yet", "No results found"

3. **Description** (optional but recommended)
   - 1-2 sentences providing context or guidance
   - Explain why it's empty or what will appear here
   - Keep it under 100 characters when possible

4. **Call-to-Action** (recommended for empty data lists)
   - Primary button for the most common action
   - Examples: "Add patient", "Schedule appointment", "Create encounter"
   - Should directly address the empty state

## Component Usage

### Basic Empty State

```tsx
import { EmptyState } from '@/components/ui/EmptyState';
import { Users } from 'lucide-react';

<EmptyState
  illustration="patients"
  title="No patients yet"
  description="Start by adding your first patient to the system."
  action={
    <Button onClick={handleAddPatient}>
      Add Patient
    </Button>
  }
/>
```

### Using Presets with i18n

```tsx
import { ModuleEmptyState } from '@/components/ui/EmptyState';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';

function PatientsList() {
  const t = useTranslations();
  
  if (patients.length === 0) {
    return (
      <ModuleEmptyState
        module="patients"
        t={t}
        action={
          <Button href="/patients/new">
            {t('patients.addNew')}
          </Button>
        }
      />
    );
  }
  
  return <PatientsTable data={patients} />;
}
```

## Available Illustrations

The component supports these built-in illustrations:

- `patients` - Users icon (for patient lists)
- `encounters` - FileText icon (for encounter lists)
- `payments` - CreditCard icon (for payment lists)
- `appointments` - Calendar icon (for appointment lists)
- `notifications` - Bell icon (for notification lists)
- `search` - Search icon (for search results)

## Empty State vs Loading State vs Error State

### Empty State
- **When**: No data exists or no results match filters
- **Message**: "No patients yet" / "No results found"
- **Action**: Add/create button or adjust filters

### Loading State
- **When**: Data is being fetched
- **Message**: Skeleton loaders or "Loading..."
- **Action**: None (system is working)

### Error State
- **When**: Data fetch failed
- **Message**: "Failed to load patients"
- **Action**: "Retry" button

## Best Practices

### Do ✅
- Use relevant icons that match the content type
- Provide clear, actionable next steps
- Keep messages concise and friendly
- Use sentence case for titles
- Distinguish between "no data" and "no results"
- Make CTAs prominent and easy to find

### Don't ❌
- Leave the area completely blank
- Use generic messages like "Nothing here"
- Overload with multiple CTAs
- Use technical jargon or error codes
- Make users guess what to do next
- Use the same empty state for loading/error states

## Responsive Behavior

Empty states should:
- Center both horizontally and vertically
- Scale icon size appropriately on mobile (min 44px touch target)
- Stack illustration, text, and button vertically
- Maintain padding on small screens (py-16)

## Accessibility

- Use `role="status"` and `aria-live="polite"` on the container
- Ensure icon has `aria-hidden="true"` (decorative)
- Keep focus on the CTA button when the empty state appears
- Ensure text meets WCAG contrast requirements (4.5:1 for body text)
- Make CTA buttons at least 44×44px for touch targets

## Examples by Module

### Patients List
```tsx
<ModuleEmptyState
  module="patients"
  t={t}
  action={<Button href="/patients/new">Add Patient</Button>}
/>
```

### Encounter History
```tsx
<ModuleEmptyState
  module="encounters"
  t={t}
  action={<Button href="/encounters/new">Log Encounter</Button>}
/>
```

### Payment History
```tsx
<ModuleEmptyState
  module="payments"
  t={t}
  action={<Button href="/payments/new">Create Payment</Button>}
/>
```

### Search Results (No CTA)
```tsx
<ModuleEmptyState
  module="search"
  t={t}
/>
```

### Appointments
```tsx
<ModuleEmptyState
  module="appointments"
  t={t}
  action={<Button href="/appointments/new">Schedule Appointment</Button>}
/>
```

## Filtered vs Unfiltered Empty States

### Unfiltered (No data at all)
- Title: "No patients yet"
- Description: "Start by adding your first patient to the system."
- Action: "Add Patient" button

### Filtered (Data exists but doesn't match filters)
- Title: "No patients match your filters"
- Description: "Try adjusting your search criteria or clearing filters."
- Action: "Clear Filters" button

## i18n Structure

Add translations to `messages/{locale}.json`:

```json
{
  "emptyStates": {
    "patients": {
      "title": "No patients yet",
      "description": "Start by adding your first patient to the system."
    },
    "filtered": {
      "title": "No results match your filters",
      "description": "Try adjusting your search criteria or clearing filters."
    }
  }
}
```

## Testing Checklist

- [ ] Empty state appears when data array is empty
- [ ] Icon renders correctly and is visible
- [ ] Title and description text are readable
- [ ] CTA button is functional and navigates/triggers correctly
- [ ] Dark mode styling works properly
- [ ] Touch targets are at least 44×44px on mobile
- [ ] Screen readers announce the empty state properly
- [ ] Different from loading and error states
- [ ] i18n strings load correctly for all supported languages
