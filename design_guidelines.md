# Concordia Pharmacy Design Guidelines

## Design Approach

**System-Based Approach**: Healthcare-focused design inspired by **Material Design** and modern healthcare portals like CVS Health and Kaiser Permanente. Emphasis on clarity, trust, accessibility, and professional medical aesthetics.

**Core Principles**:
- Clinical precision with approachable warmth
- Information hierarchy prioritizing patient safety
- Scannable layouts for quick decision-making
- Trust-building through clean, professional presentation

## Typography

**Font Families** (Google Fonts):
- Primary: Inter (400, 500, 600, 700) - UI elements, body text, data tables
- Accent: Plus Jakarta Sans (600, 700) - Headlines, section titles

**Hierarchy**:
- H1: text-4xl md:text-5xl font-bold (page titles)
- H2: text-3xl font-bold (section headers)
- H3: text-xl font-semibold (card headers, subsections)
- Body: text-base (standard content)
- Small: text-sm (metadata, labels)
- Micro: text-xs (timestamps, fine print)

## Layout System

**Spacing Primitives**: Tailwind units of **2, 4, 6, 8, 12, 16** (e.g., p-4, gap-6, mb-8, py-12)

**Grid Structure**:
- Container: max-w-7xl mx-auto px-4 md:px-6
- Dashboard layouts: Grid-based with 12-column system
- Card grids: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6

**Vertical Rhythm**:
- Section padding: py-12 md:py-16
- Card padding: p-6
- Tight spacing: gap-4 (related items)
- Generous spacing: gap-8 (distinct sections)

## Component Library

### Navigation
- **Top Navigation Bar**: Fixed header with logo left, main nav center, user profile/cart right
- **Sidebar (Admin)**: Collapsible left sidebar (width: 64 for icons, 256 expanded) with categorized menu items
- **Breadcrumbs**: For deep navigation in admin sections

### Cards & Containers
- **Prescription Cards**: Rounded corners (rounded-lg), subtle shadow (shadow-md), border treatment for status indication
- **Product Cards**: Image top, content below, hover lift effect (transform scale)
- **Dashboard Stat Cards**: Large number display with trend indicators and icons
- **Info Cards**: Border-left accent (border-l-4) for categorization

### Forms & Inputs
- **Text Inputs**: Bordered with focus ring, floating labels, clear error states
- **Selects/Dropdowns**: Consistent height, icon indicators
- **Search Bars**: Prominent with icon, autocomplete suggestions
- **Upload Areas**: Dashed border drop zones for prescription uploads

### Data Display
- **Tables**: Striped rows, sortable headers, sticky header on scroll, action buttons right-aligned
- **Status Badges**: Rounded-full with status-specific styling (pending, active, completed, expired)
- **Progress Indicators**: Linear for refill timelines, circular for points balance

### Actions & CTAs
- **Primary Buttons**: High contrast, rounded-md, font-semibold, adequate padding (px-6 py-3)
- **Secondary Buttons**: Outlined or ghost variant
- **Icon Buttons**: Consistent 40x40 or 48x48 touch targets
- **FABs (Admin)**: Fixed bottom-right for quick actions

### Overlays
- **Modals**: Centered, max-width constraints, backdrop blur
- **Toasts**: Top-right notifications, auto-dismiss with progress bar
- **Confirmation Dialogs**: Clear action hierarchy (destructive vs cancel)

### Healthcare-Specific Components
- **Medication Display**: Drug name prominent, dosage/instructions clearly separated, refill countdown
- **Prescription History Timeline**: Vertical timeline with dates, status updates
- **Loyalty Points Widget**: Visual progress bar showing points to next reward tier
- **Cart Summary**: Sticky on scroll with real-time total updates

## Icons

**Library**: Heroicons (via CDN)
- Use outline variants for navigation and secondary actions
- Use solid variants for active states and primary icons
- Size: w-5 h-5 for inline, w-6 h-6 for standalone

## Images

**Hero Section (Marketing/About Page)**:
- Full-width image: Professional pharmacy interior or staff assisting patient
- Overlay: Subtle gradient for text readability
- Height: min-h-[500px] md:min-h-[600px]
- CTA buttons on hero: Backdrop blur (backdrop-blur-md) with semi-transparent background

**Product Images**:
- OTC products: Square ratio (1:1), white background, 300x300px minimum
- Placeholder: Clean medical icons for items without images

**Trust Elements**:
- HIPAA compliance badge
- Secure payment icons
- Pharmacy certifications/accreditations

## Accessibility & Healthcare Compliance

- WCAG 2.1 AA minimum contrast ratios throughout
- All interactive elements minimum 44x44px touch targets
- Clear focus indicators on all interactive elements
- Form validation with inline error messaging
- Screen reader optimized labels for prescription data
- High-stakes actions (submit prescription, payment) require confirmation
- Sensitive data (Rx numbers, PHI) displayed with truncation and reveal pattern

## Animations

**Minimal & Purposeful**:
- Page transitions: Fade-in on route change
- Loading states: Skeleton screens for data-heavy sections
- Success confirmations: Checkmark animation on order completion
- NO distracting scroll animations or parallax effects

## Dashboard-Specific Layouts

**Patient Dashboard**:
- Quick actions bar at top (Refill, Shop OTC, View Wallet)
- Active prescriptions in prominent cards grid
- Recent orders timeline
- Points balance widget with progress visualization

**Admin Dashboard**:
- KPI cards row at top (4-column grid)
- Main content area: Tabbed interface or split view
- Data tables with filtering and export capabilities
- Right sidebar: Recent activity feed

## Multi-Column Strategy

**Use Multi-Columns For**:
- Feature showcases: 3-column grid (lg:grid-cols-3)
- Product listings: 2-3 columns responsive
- Dashboard stats: 4-column on desktop (lg:grid-cols-4)
- Order history: 2-column (order details + status timeline)

**Single Column For**:
- Prescription details (prioritize readability)
- Checkout flow (reduce cognitive load)
- Mobile views (always stack)
- Form sections (clear progression)

## Page-Specific Guidance

**Landing/Marketing Page**: 6-8 sections including Hero with pharmacy image, Features (HIPAA, Loyalty, Refills), How It Works, Trust badges/certifications, Testimonials, Contact/Signup CTA

**Patient Portal**: Dashboard-first design, persistent header with cart/profile, tabbed sub-navigation for Prescriptions/Orders/Wallet/Profile

**Admin Interface**: Sidebar navigation, bulk action toolbars, export functionality prominent, real-time status updates

This healthcare platform requires trust, clarity, and efficiency above all. Every design decision should reinforce patient confidence and streamline critical pharmacy workflows.