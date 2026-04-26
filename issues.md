### #103 Create the Figma project structure and shared component library

**Label:** 🎨 design
**Branch:** `design/figma-project-setup`
**Timeframe:** 1 day

**Description:**
Before any screen can be designed, the Figma project must be set up with the correct structure, shared styles, and a component library that mirrors the design system defined in issue #91. Without this foundation, individual screen designers will make inconsistent decisions about spacing, color, and typography. This is the single most important Figma issue — all others depend on it.

**Tasks:**
- Create a Figma project named **"Health Watchers – Design System & Screens"**
- Set up three pages inside the file:
  - `🎨 Design System` — all tokens, components, and patterns
  - `📱 Screens` — all app screens organised by module
  - `🔄 Prototypes` — interactive flows linking screens together
- In the `Design System` page define all Figma Styles:
  - **Color styles:** Primary `#0F6FEC`, Primary Dark `#0A52B3`, Success `#16A34A`, Warning `#D97706`, Danger `#DC2626`, Neutral 50–900, Surface `#FFFFFF`, Background `#F3F4F6`
  - **Text styles:** H1–H4, Body Large, Body, Body Small, Label, Caption — all Inter font
  - **Effect styles:** Shadow SM, Shadow MD, Shadow LG
  - **Grid styles:** 12-column desktop grid, 4-column mobile grid
- Build the Figma Component Library for all 17 components from issue #92: Button (all variants + states), Input, Select, Textarea, Badge, Card, Modal, SlideOver, Table, Pagination, Tabs, Spinner, Toast, EmptyState, Skeleton, Avatar, SearchInput
- Each component must use **Auto Layout** and **Figma Variables** for spacing and color tokens
- Publish the library so all team members can use components via the Assets panel
- Add the Figma file link to `README.md` under a `## Design` section

**Acceptance Criteria:**
- Figma file is accessible to all team members via a shared link
- All color, text, and effect styles match the tokens in `tailwind.config.ts`
- Every component has default, hover, focused, disabled, and error states as Figma variants
- Components use Auto Layout — resizing does not break layout
- Library is published and components appear in the Assets panel
- Figma link is committed to `README.md`

**Verification:**
> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue.
> The media must show the Figma file open with the Design System page, published library, and all components visible in the Assets panel.
> PRs without visual proof will not be reviewed or merged.

---

### #104 Design Figma screens — Authentication flow

**Label:** 🎨 design
**Branch:** `design/figma-auth-screens`
**Timeframe:** 1 day

**Description:**
The authentication screens are the entry point to the entire application. These Figma frames define the exact layout, spacing, copy, and interaction states that the frontend engineer must implement for issues #45 (web auth) and #90 (MFA). Designs must cover all states: empty, filled, loading, error, and success.

**Tasks:**
- Design the following frames at **1440×900** (desktop) and **390×844** (mobile):
  - **Login:** logo, tagline, email field, password field with show/hide toggle, "Forgot password?" link, "Sign In" button — plus error banner state and loading state (spinner in button)
  - **Forgot Password:** heading, subtext, email field, "Send Reset Link" button, success state (email sent confirmation), back to login link
  - **Reset Password:** new password field, confirm password field, password strength bar (5 levels), "Reset Password" button, success redirect state
  - **MFA Challenge:** "Two-Factor Authentication" heading, 6-digit OTP input boxes with auto-advance, "Verify" button, "Resend code" link, error state (wrong code highlighted red)
- All screens use components from the shared library (#103)
- Annotate each screen with field labels, placeholder text, error messages, and button copy
- Add red-line spec overlay showing padding, margin, and font size values

**Acceptance Criteria:**
- All 4 screens exist in `Screens/Authentication` with desktop and mobile frames
- All interactive states (empty, filled, error, loading, success) are designed for each screen
- Components are from the shared library, not one-off designs
- A developer can implement any screen without asking design questions
- Figma link added as a comment on issues #45 and #90

**Verification:**
> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue.
> The media must show all 4 auth screens in Figma with desktop and mobile frames visible.
> PRs without visual proof will not be reviewed or merged.

---

### #105 Design Figma screens — Dashboard / Home

**Label:** 🎨 design
**Branch:** `design/figma-dashboard-screen`
**Timeframe:** 1 day

**Description:**
The dashboard is the first screen after login. It must communicate the clinic's daily activity at a glance. This issue covers the full desktop and mobile design including all data states (loaded, loading, empty).

**Tasks:**
- Design at **1440×900** (desktop) and **390×844** (mobile):
  - **Loaded state:** sidebar nav, top bar, 4 stat cards (Today's Patients, Today's Encounters, Pending Payments, Active Doctors), Recent Patients table (5 rows), Today's Encounters list, Pending Payments list, Quick Action buttons row
  - **Loading state:** skeleton versions of all cards and tables
  - **Empty state:** all sections showing empty state illustrations with CTAs
- Sidebar in both **expanded** (240px) and **collapsed** (64px icon-only) states
- Top bar: logo, clinic name, notification bell, user avatar with dropdown (Profile, Settings, Logout)
- Mobile: bottom navigation bar (4 icons), stacked single-column layout, stat cards in 2×2 grid
- Annotate all spacing, font sizes, and color tokens

**Acceptance Criteria:**
- Desktop and mobile frames exist for loaded, loading, and empty states
- Sidebar expanded and collapsed states are both designed
- Realistic placeholder data used throughout (not "Lorem ipsum")
- Figma link added as a comment on issue #95

**Verification:**
> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue.
> The media must show the dashboard Figma frames including all 3 data states.
> PRs without visual proof will not be reviewed or merged.

---

### #106 Design Figma screens — Patients module

**Label:** 🎨 design
**Branch:** `design/figma-patients-screens`
**Timeframe:** 2 days

**Description:**
The patients module is the most-used part of the EMR. Doctors and nurses interact with it dozens of times per day. Figma designs must cover every state and interaction so the frontend engineer has zero ambiguity when implementing issues #44, #46, #47, #49, and #96.

**Tasks:**
- Design at **1440×900** (desktop) and **390×844** (mobile):
  - **Patient List:** table (System ID, Full Name, DOB, Sex, Contact, Status, Actions), search bar, "+ New Patient" button, pagination — plus search active, empty, and loading states
  - **Create Patient slide-over:** right panel (400px), all form fields, Cancel + Save buttons, per-field validation error states
  - **Edit Patient slide-over:** same as create but pre-filled
  - **Patient Detail — Overview tab:** header card (name, systemId, age, sex, contact, Edit button), 2-column field grid
  - **Patient Detail — Encounters tab:** chronological encounter list
  - **Patient Detail — Payments tab:** payment records list
  - **Deactivate confirmation modal:** "Are you sure?" with Cancel + Confirm Deactivate buttons
- Mobile: table becomes stacked card list, slide-over becomes full-screen

**Acceptance Criteria:**
- All listed frames exist in `Screens/Patients` with desktop and mobile versions
- Every form field shows default, focused, filled, and error states
- Realistic placeholder data used (e.g. "Sarah Johnson", "HW-ABC-001042")
- Figma link added as a comment on issues #96 and #46

**Verification:**
> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue.
> The media must show the patient list, detail page, and create slide-over frames in Figma.
> PRs without visual proof will not be reviewed or merged.

---

### #107 Design Figma screens — Encounters module

**Label:** 🎨 design
**Branch:** `design/figma-encounters-screens`
**Timeframe:** 2 days

**Description:**
Encounters are the clinical core of the EMR. The log encounter form is the most complex form in the app — multi-step, with clinical data inputs. The AI summary card must also be designed here so the frontend engineer knows exactly how to present it (issue #35, #97).

**Tasks:**
- Design at **1440×900** (desktop) and **390×844** (mobile):
  - **Encounter List:** table (Patient, Chief Complaint, Doctor, Date & Time, Status), filter bar (date range, doctor dropdown, status tabs) — plus empty and loading states
  - **Encounter Detail:** header (patient name linked, date, status badge, doctor), Vital Signs row, Chief Complaint, Diagnosis list, Treatment Plan, Prescriptions table, AI Summary card, Follow-up date
  - **AI Summary card — 3 states:** loading (skeleton + "Generating AI summary…"), loaded (purple AI badge + summary text + "Regenerate" button), error ("AI unavailable" + retry)
  - **Log Encounter — Step 1:** step progress bar, patient search select, chief complaint, attending doctor
  - **Log Encounter — Step 2:** vital signs inputs grid, diagnosis add/remove rows, treatment plan
  - **Log Encounter — Step 3:** prescriptions add/remove rows, review summary, Submit button
  - **Step validation error state:** red borders on required fields, error messages, step indicator error state

**Acceptance Criteria:**
- All listed frames exist in `Screens/Encounters` with desktop and mobile versions
- Multi-step form shows all 3 steps with progress indicator in each state
- AI Summary card shows all 3 states (loading, loaded, error)
- Figma link added as a comment on issues #97 and #35

**Verification:**
> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue.
> The media must show the encounter list, detail, AI summary card states, and all 3 form steps.
> PRs without visual proof will not be reviewed or merged.

---

### #108 Design Figma screens — Payments module

**Label:** 🎨 design
**Branch:** `design/figma-payments-screens`
**Timeframe:** 1 day

**Description:**
The payments module handles real Stellar blockchain transactions. The UI must feel trustworthy and make the payment flow unambiguous. The confirmation flow must handle async blockchain verification with clear loading and result states (issues #50, #98).

**Tasks:**
- Design at **1440×900** (desktop) and **390×844** (mobile):
  - **Payment List:** status tab filters (All / Pending / Confirmed / Failed), table (Patient, Amount + Asset, Destination truncated, Memo, Status badge, Date, Actions) — plus empty and loading states
  - **Create Payment Intent slide-over:** patient search, amount input, asset selector (XLM / USDC), summary confirmation box, Submit button
  - **Confirm Payment modal — 4 states:** input (tx hash field, paste button, explorer link), loading ("Verifying on Stellar network…"), success (green checkmark, tx hash link), failure (red X, reason, "Try Again")
- Stellar address display: first 6 + `...` + last 6 characters, copy icon
- Status badges: pending=yellow, confirmed=green, failed=red

**Acceptance Criteria:**
- All listed frames exist in `Screens/Payments` with desktop and mobile versions
- All 4 confirm modal states are designed
- Stellar address truncation pattern is clearly shown
- Figma link added as a comment on issues #98 and #50

**Verification:**
> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue.
> The media must show the payments list and all 4 states of the confirm payment modal.
> PRs without visual proof will not be reviewed or merged.

---

### #109 Design Figma screens — Settings & Profile page

**Label:** 🎨 design
**Branch:** `design/figma-settings-screens`
**Timeframe:** 1 day

**Description:**
The settings page lets users manage their account, security, and preferences. Must cover all sub-sections: Profile, Security (password + MFA), and Preferences (language + notifications). Feeds into issues #45, #90, and #99.

**Tasks:**
- Design at **1440×900** (desktop) and **390×844** (mobile):
  - **Profile tab:** left sub-nav, editable Full Name, read-only Email + Role + Clinic (grayed), Save button (only visible when a field is changed — annotate this behaviour)
  - **Security tab:** Change Password form (Current, New, Confirm — all with show/hide toggles), password strength bar (5 segments, red→green), MFA card (status badge, "Enable MFA" button)
  - **MFA Setup modal:** QR code placeholder (128×128), instruction text, 6-digit verification input, "Verify & Enable" button
  - **Preferences tab:** language dropdown, notification toggles (Appointment Reminders, Payment Confirmations, System Alerts)
  - **Mobile:** sub-nav becomes horizontal scrollable tab bar at top

**Acceptance Criteria:**
- All 3 settings tabs designed with desktop and mobile frames
- Password strength bar shows all 5 levels with distinct colors
- Save button visibility logic is annotated on the frame
- Figma link added as a comment on issue #99

**Verification:**
> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue.
> The media must show all 3 settings tabs and the MFA setup modal in Figma.
> PRs without visual proof will not be reviewed or merged.

---

### #110 Design Figma — Empty states, loading skeletons, and error screens

**Label:** 🎨 design
**Branch:** `design/figma-states-screens`
**Timeframe:** 1 day

**Description:**
Every data-driven page has loading, empty, and error states. These must be designed consistently as a reusable pattern library so the frontend engineer has a single reference for all state designs (issue #100).

**Tasks:**
- Design a **States Pattern Library** frame in the `Design System` page:
  - **Skeletons:** table skeleton (5 rows matching patients/encounters/payments column widths), stat card skeleton, detail page skeleton
  - **Empty states:** Patients (person silhouette SVG + "No patients yet" + CTA), Encounters (stethoscope SVG), Payments (wallet SVG), Search results (magnifier SVG + "No results for '[query]'" + "Clear search")
  - **Error states:** API error (warning icon + "Something went wrong" + "Try again"), 404 page (large "404" + "Page not found" + "Go to Dashboard"), 500/crash page ("An unexpected error occurred" + error ID field + "Reload page")
- All SVG illustrations must be simple line-art style, consistent visual language
- Annotate skeleton animation: `opacity` pulse between `#E5E7EB` and `#F3F4F6`, 1.5s ease-in-out infinite

**Acceptance Criteria:**
- All 11 state designs exist in `Design System/States`
- Skeleton column widths match the actual table column widths
- All 4 empty state illustrations are unique and module-relevant
- Error states include a `requestId` display field
- Figma link added as a comment on issue #100

**Verification:**
> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue.
> The media must show the full States Pattern Library frame in Figma.
> PRs without visual proof will not be reviewed or merged.

---

### #111 Create Figma interactive prototype — full user journey flows

**Label:** 🎨 design
**Branch:** `design/figma-prototype-flows`
**Timeframe:** 2 days

**Description:**
Static screens alone are not enough to validate UX. An interactive Figma prototype links all screens together so the complete user journey can be clicked through before any code is written. This catches UX problems early when they are cheap to fix.

**Tasks:**
- Build interactive prototypes in the `Prototypes` page for 5 flows:
  - **Flow 1 — Login to Dashboard:** Login → (success) → Dashboard; Login → (wrong password) → error state; Login → MFA challenge → Dashboard
  - **Flow 2 — Register a patient:** Dashboard → Patients list → "+ New Patient" → slide-over opens → fill form → submit → slide-over closes → new patient in list
  - **Flow 3 — Log an encounter:** Patient detail → Encounters tab → "+ Log Encounter" → Step 1 → Step 2 → Step 3 → submit → encounter in list → Encounter detail with AI summary loading
  - **Flow 4 — Create and confirm a payment:** Payments list → "+ Create Intent" → submit → pending row → "Confirm" → modal → tx hash → loading → success
  - **Flow 5 — Password reset:** Login → "Forgot password?" → email sent state → Reset password → success → Login
- Use **Smart Animate** transitions: slide-overs animate from right (300ms ease-out), modals fade + scale (200ms ease-out)
- Share prototype links (view-only) and add all 5 to `README.md` under `## Design`

**Acceptance Criteria:**
- All 5 flows are clickable end-to-end in Figma prototype mode
- Slide-overs and modals use Smart Animate transitions
- Each flow has a clearly labelled start frame
- Prototype links are view-only and added to `README.md`
- A stakeholder can validate the full UX without a Figma account ("Anyone with the link" share setting)

**Verification:**
> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue.
> The media must show a screen recording of clicking through at least 2 complete prototype flows in Figma.
> PRs without visual proof will not be reviewed or merged.

---

### #112 Design Figma mobile screens — responsive layouts for all modules

**Label:** 🎨 design
**Branch:** `design/figma-mobile-screens`
**Timeframe:** 2 days

**Description:**
Issue #101 defines the responsive behaviour rules. This issue produces the actual Figma mobile frames (390×844) for every module so the frontend engineer has a pixel-perfect reference for the mobile layout. Mobile is not just "shrunk desktop" — it requires different layout patterns (bottom nav, stacked cards, full-screen panels).

**Tasks:**
- Design **390×844** mobile frames for every screen:
  - Dashboard (bottom nav bar, stacked stat cards 2×2, single-column lists)
  - Patient List (stacked card layout, search bar full width)
  - Patient Detail (single column, tabs as horizontal scroll)
  - Create Patient (full-screen slide-over, single-column form)
  - Encounter List (stacked card layout)
  - Encounter Detail (single column, collapsible sections)
  - Log Encounter multi-step form (full screen, step indicator at top)
  - Payment List (stacked card layout)
  - Confirm Payment modal (full screen)eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkNTc0M2JmNS03NGI0LTQwZDgtOTFjOC0eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkNTc0M2JmNS03NGI0LTQwZDgtOTFjOC0yZjU2NTlkNDQwMzciLCJlbWFpbCI6Im1hcmdhcmV0ZW55aW9tYUBnbWFpbC5jb20iLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3NzY3MDUyODYsImlhdCI6MTc3NjcwMTY4NiwidG9rZW5fdHlwZSI6ImFjY2VzcyJ9.JW4ua4gGjfEZjuXg5mI8MsWFmpYnEMpv7JRAUi7jarYyZjU2NTlkNDQwMzciLCJlbWFpbCI6Im1hcmdhcmV0ZW55aW9tYUBnbWFpbC5jb20iLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3NzY3MDUyODYsImlhdCI6MTc3NjcwMTY4NiwidG9rZW5fdHlwZSI6ImFjY2VzcyJ9.JW4ua4gGjfEZjuXg5mI8MsWFmpYnEMpv7JRAUi7jarY
  - Settings (tab bar at top instead of left sub-nav)
- Bottom navigation bar: 4 icons (Dashboard, Patients, Encounters, Payments) + "More" overflow, active state with label, inactive icon-only
- Annotate all touch targets as minimum 44×44px

**Acceptance Criteria:**
- Mobile frames exist for all 10 listed screens in `Screens/Mobile`
- Bottom navigation bar designed with active and inactive states
- Tables replaced with stacked card layouts on all mobile screens
- Slide-overs and modals are full-screen on mobile frames
- All touch targets annotated as ≥ 44×44px
- Figma link added as a comment on issue #101

**Verification:**
> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue.
> The media must show the mobile frames for at least the Dashboard, Patient List, and Encounter List screens.
> PRs without visual proof will not be reviewed or merged.

---