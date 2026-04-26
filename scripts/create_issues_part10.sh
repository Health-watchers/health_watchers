#!/bin/bash
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "Define the global design system — color palette, typography, and spacing scale" \
  --label "design" \
  --body "**Branch:** \`design/global-design-system\`
**Timeframe:** 2 days

## Description
There is no visual identity for Health Watchers. Every frontend issue that touches UI will make ad-hoc decisions about colors, fonts, and spacing unless a design system is defined first.

## Design Deliverables
- Color palette: Primary \`#0F6FEC\`, Success \`#16A34A\`, Warning \`#D97706\`, Danger \`#DC2626\`, Neutral scale
- Typography: Inter font, scale from xs(12px) to 3xl(30px), weights 400/500/600/700
- Spacing scale: 4px base unit
- Border radius: sm(4px), md(8px), lg(12px), full(9999px)
- All tokens defined in \`tailwind.config.ts\` under \`theme.extend\`

## Tasks
- Configure \`tailwind.config.ts\` with all tokens
- Add \`Inter\` font via \`next/font/google\` in \`layout.tsx\`
- Create \`apps/web/src/styles/globals.css\` with Tailwind base + CSS custom properties
- Create \`apps/web/src/components/ui/\` directory as the home for all base components
- Document all tokens in a \`DESIGN_SYSTEM.md\` file

## Acceptance Criteria
- All color, typography, and spacing tokens are defined in \`tailwind.config.ts\`
- No hardcoded hex colors or pixel values exist outside of \`tailwind.config.ts\`
- \`DESIGN_SYSTEM.md\` documents every token with its intended use case

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Design the reusable UI component library" \
  --label "design" \
  --body "**Branch:** \`design/ui-component-library\`
**Timeframe:** 3 days

## Description
All frontend issues depend on a consistent set of base UI components. Without a shared component library, each page will implement its own version of buttons, inputs, tables, and modals — leading to visual inconsistency and duplicated code.

## Components to Build
- \`Button\` — variants: primary, secondary, ghost, danger; sizes: sm, md, lg; states: default, hover, focus, disabled, loading
- \`Input\` — with label, helper text, error state, left/right icon slots
- \`Select\`, \`Textarea\`, \`Badge\`, \`Card\`, \`Modal\`, \`SlideOver\`, \`Table\`, \`Pagination\`, \`Tabs\`, \`Spinner\`, \`Toast\`, \`EmptyState\`, \`Skeleton\`, \`Avatar\`, \`SearchInput\`

## Tasks
- Create each component in \`apps/web/src/components/ui/\`
- Each component must be fully typed with TypeScript props interface
- Install \`class-variance-authority\` (CVA) for variant management
- Install \`@radix-ui/react-dialog\` for Modal and SlideOver
- Install \`sonner\` for Toast notifications

## Acceptance Criteria
- All 17 components exist in \`apps/web/src/components/ui/\`
- Every component accepts and forwards a \`className\` prop
- Modal and SlideOver trap focus correctly and close on Escape
- No component uses inline \`style={{}}\` props

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Design the navigation layout and sidebar structure" \
  --label "design" \
  --body "**Branch:** \`design/navigation-layout\`
**Timeframe:** 1 day

## Description
The app currently has a single-line nav with plain anchor tags. A clinical EMR needs a persistent, role-aware sidebar navigation that gives staff quick access to all modules.

## Design Deliverables
- Left sidebar (240px wide on desktop, hidden on mobile behind hamburger)
- Top header bar (56px) with: app logo left, clinic name center, user avatar + logout right
- Sidebar nav items with icons: Dashboard, Patients, Encounters, Payments, Appointments, Documents, Settings, Audit Log
- Active state: left border accent 4px solid primary, background primary/10
- Mobile: sidebar slides in from left as a drawer overlay

## Tasks
- Create \`apps/web/src/components/layout/Sidebar.tsx\`
- Create \`apps/web/src/components/layout/TopBar.tsx\`
- Create \`apps/web/src/components/layout/AppLayout.tsx\`
- Wrap all authenticated pages in \`AppLayout\` via \`layout.tsx\`
- Implement mobile drawer with \`useState\` open/close and focus trap

## Acceptance Criteria
- Sidebar is visible on screens ≥ 768px and hidden (drawer) on smaller screens
- Active route is visually distinct from inactive routes
- Role-restricted nav items are not rendered for users without the required role

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Design the authentication screens — login and password reset" \
  --label "design" \
  --body "**Branch:** \`design/auth-screens\`
**Timeframe:** 1 day

## Description
The login page is the first thing every user sees. It must be clean, trustworthy, and accessible. The design must also cover the forgot-password and reset-password flows.

## Design Deliverables
- Login page: centered card (400px wide) on bg-gray-50, app logo + heading, email + password fields, 'Forgot password?' link, primary CTA button
- Forgot password page: single email field + 'Send reset link' button
- Reset password page: new password + confirm password fields + strength indicator bar
- MFA challenge page: 6-digit OTP input with auto-advance

## Tasks
- Create \`apps/web/src/app/(auth)/login/page.tsx\`
- Create \`apps/web/src/app/(auth)/forgot-password/page.tsx\`
- Create \`apps/web/src/app/(auth)/reset-password/page.tsx\`
- Create \`apps/web/src/components/ui/PasswordInput.tsx\` (with show/hide toggle)
- Create \`apps/web/src/components/ui/OtpInput.tsx\` (6-digit auto-advance)

## Acceptance Criteria
- Login page renders correctly on 375px and 1280px viewports
- Password show/hide toggle works and is keyboard accessible
- Error messages are announced to screen readers via \`role=\"alert\"\`
- The auth layout has no sidebar or top bar

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Design the Dashboard / Home page" \
  --label "design" \
  --body "**Branch:** \`design/dashboard-home\`
**Timeframe:** 2 days

## Description
The current home page is a blank page with three links. The dashboard should give clinical staff an at-a-glance view of the clinic's activity for the day.

## Design Deliverables
- Stats row (4 cards): Today's Patients, Today's Encounters, Pending Payments, Active Doctors
- Recent Patients table (last 5 registered)
- Today's Encounters list (last 5)
- Pending Payments list (last 5)
- Quick action buttons row: '+ New Patient', '+ Log Encounter', '+ Payment Intent'
- Empty states for each section

## Tasks
- Create \`apps/web/src/app/(dashboard)/page.tsx\`
- Create \`apps/web/src/components/dashboard/StatCard.tsx\`
- Create \`apps/web/src/components/dashboard/RecentTable.tsx\`
- Fetch all dashboard data in parallel using TanStack Query \`useQueries\`

## Acceptance Criteria
- Dashboard loads in under 1 second on a fast connection
- All four stat cards show real data from the API
- Empty states display when sections have no data
- Dashboard is responsive: stat cards stack 2×2 on tablet, 4×1 on desktop

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Design the Patients module — list, search, detail, and create/edit forms" \
  --label "design" \
  --body "**Branch:** \`design/patients-module\`
**Timeframe:** 3 days

## Description
The patients module is the core of the EMR. It needs a well-structured list view with search, a detailed patient profile page, and forms for creating and editing patients.

## Design Deliverables
- Patient list page: page header with '+ New Patient' button, search bar, table with columns (System ID, Full Name, DOB, Sex, Contact, Status, Actions), pagination
- Patient detail page: header card with patient info, tabs (Overview, Encounters, Payments, Documents)
- Create/Edit patient slide-over panel (400px wide): fields for all patient data, Cancel + Save footer

## Tasks
- Create \`apps/web/src/components/patients/PatientTable.tsx\`
- Create \`apps/web/src/components/patients/PatientDetailTabs.tsx\`
- Create \`apps/web/src/components/ui/SlideOver.tsx\`
- Create \`apps/web/src/components/forms/PatientForm.tsx\`

## Acceptance Criteria
- Patient list renders with correct columns and data from the API
- Search filters the list in real time (debounced 300ms)
- The slide-over opens on '+ New Patient' and 'Edit' clicks and closes on Cancel or Escape

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Design the Encounters module — list, detail, and log encounter form" \
  --label "design" \
  --body "**Branch:** \`design/encounters-module\`
**Timeframe:** 2 days

## Description
Encounters are the clinical heart of the EMR. Doctors log encounters during or after a patient visit. The design must make it fast to log a new encounter and easy to review past ones.

## Design Deliverables
- Encounters list page: filter bar (date range, doctor, status, patient search), table with status badges
- Encounter detail page: header, vital signs section, chief complaint, diagnosis, treatment plan, prescriptions, AI Summary card, follow-up date
- Log Encounter form (slide-over, 560px): multi-step form with progress indicator

## Tasks
- Create \`apps/web/src/components/encounters/EncounterTable.tsx\`
- Create \`apps/web/src/components/encounters/EncounterDetail.tsx\`
- Create \`apps/web/src/components/encounters/AiSummaryCard.tsx\`
- Create \`apps/web/src/components/forms/EncounterForm.tsx\` (multi-step)

## Acceptance Criteria
- Encounter list filters work independently and in combination
- The AI Summary card shows a loading skeleton while the AI generates the summary
- The multi-step form validates each step before advancing

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Design the Payments module — list, intent creation, and confirmation flow" \
  --label "design" \
  --body "**Branch:** \`design/payments-module\`
**Timeframe:** 2 days

## Description
The payments module handles Stellar blockchain transactions. The UI must make the payment flow clear and trustworthy — users need to understand what they are authorising before a transaction is submitted.

## Design Deliverables
- Payments list page: filter bar (status tabs, date range), table with status badges, 'Confirm' and 'View on Explorer' row actions
- Create Payment Intent slide-over: patient search, amount + asset selector, summary box before submit
- Confirm Payment modal: transaction hash input, loading/success/failure states

## Tasks
- Create \`apps/web/src/components/payments/PaymentTable.tsx\`
- Create \`apps/web/src/components/payments/ConfirmPaymentModal.tsx\`
- Create \`apps/web/src/components/forms/PaymentIntentForm.tsx\`
- Create \`apps/web/src/components/ui/AssetSelector.tsx\`
- Create \`apps/web/src/components/ui/StellarAddressDisplay.tsx\`

## Acceptance Criteria
- Payment list shows correct status badges and filters work
- 'Confirm' action is only visible on \`pending\` rows
- The confirm modal shows a loading state while calling the API
- 'View on Explorer' link uses the correct network URL

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Design the user settings and profile page" \
  --label "design" \
  --body "**Branch:** \`design/settings-profile-page\`
**Timeframe:** 1 day

## Description
Users need a place to manage their account: update their profile, change their password, enable MFA, and set their language preference.

## Design Deliverables
- Settings page (\`/settings\`) with left sub-navigation: Profile, Security, Preferences
- Profile section: editable Full Name, read-only Email/Role/Clinic
- Security section: change password form with strength bar, MFA enable/disable toggle with QR code
- Preferences section: language selector, notification toggles

## Tasks
- Create \`apps/web/src/app/(dashboard)/settings/page.tsx\`
- Create \`apps/web/src/components/settings/ProfileForm.tsx\`
- Create \`apps/web/src/components/settings/ChangePasswordForm.tsx\`
- Create \`apps/web/src/components/settings/MfaSetupModal.tsx\`
- Create \`apps/web/src/components/ui/PasswordStrengthBar.tsx\`

## Acceptance Criteria
- Profile form only shows the Save button when a field value has changed
- Password strength bar updates in real time as the user types
- MFA setup modal shows a scannable QR code and a 6-digit verification input

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Design the empty states, loading skeletons, and error screens" \
  --label "design" \
  --body "**Branch:** \`design/empty-loading-error-states\`
**Timeframe:** 1 day

## Description
Every data-driven page has three states beyond the happy path: loading, empty, and error. These states are currently either missing or show raw text strings.

## Design Deliverables
- Loading skeletons: table skeleton (5 rows), stat card skeleton, detail page skeleton
- Empty states per module: Patients, Encounters, Payments, Search results
- Error screens: API error with retry button, 404 page, 500/error boundary page

## Tasks
- Create \`apps/web/src/components/ui/Skeleton.tsx\` with \`TableSkeleton\`, \`CardSkeleton\`, \`DetailSkeleton\` variants
- Create \`apps/web/src/components/ui/EmptyState.tsx\` with per-module presets
- Create \`apps/web/src/app/not-found.tsx\`
- Create \`apps/web/src/app/error.tsx\` (Next.js error boundary)

## Acceptance Criteria
- Every list page shows the table skeleton while data is loading
- Every list page shows the correct empty state when the API returns an empty array
- The 404 page renders for unknown routes
- The error boundary catches rendering errors and shows the error screen with a \`requestId\`

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Design the responsive mobile layout" \
  --label "design" \
  --body "**Branch:** \`design/responsive-mobile-layout\`
**Timeframe:** 2 days

## Description
Clinical staff use tablets and phones at the point of care. The entire app must be usable on a 375px viewport. This issue defines the specific responsive behaviour for every layout pattern in the app.

## Design Deliverables
- Mobile-specific patterns: bottom navigation bar (4 icons + 'More' overflow), tables switch to stacked card layout, slide-overs and modals become full-screen, forms single column
- Touch targets: all interactive elements minimum 44×44px (WCAG 2.5.5)

## Tasks
- Update \`AppLayout.tsx\` to show bottom nav on mobile instead of sidebar
- Create \`apps/web/src/components/layout/BottomNav.tsx\`
- Update all Table components to render as card lists on mobile
- Update all SlideOver and Modal components to be full-screen on mobile

## Acceptance Criteria
- Bottom navigation is visible on viewports < 768px and hidden on ≥ 768px
- All tables render as stacked cards on mobile (no horizontal scroll of the page)
- All touch targets are at least 44×44px
- Lighthouse mobile score ≥ 85 on all main pages

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Inline styles used throughout — no design system or CSS" \
  --label "design" \
  --body "**Branch:** \`design/tailwind-design-system-impl\`
**Timeframe:** 3 days

## Description
All pages use raw \`style={{}}\` props with hardcoded pixel values and colors. There is no CSS modules setup, no Tailwind, and no component library. The UI is visually inconsistent, inaccessible, and extremely difficult to maintain.

## Tasks
- Install and configure Tailwind CSS in \`apps/web\` following the Next.js + Tailwind setup guide
- Create a design token file (\`tailwind.config.ts\`) with the app's color palette, typography, and spacing
- Replace all inline \`style={{}}\` props with Tailwind utility classes
- Create base layout components: \`PageWrapper\`, \`PageHeader\`, \`Card\`, \`Button\`, \`Input\`, \`Select\`, \`Table\`
- Ensure all interactive elements have visible focus styles

## Acceptance Criteria
- No \`style={{}}\` props remain in any component
- All pages use Tailwind classes for layout and styling
- Buttons have hover, focus, and disabled states
- Color contrast ratio meets WCAG AA (4.5:1 for normal text)
- \`npm run build\` succeeds with Tailwind configured

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."
