# UX Screen Inventory (Release 1)

**ID:** UX-SCREEN-INVENTORY · **Status:** APPROVED · **Version:** 2.0 · **Updated:** 2026-08-09 · **Theme:** Unified Light SaaS Dashboard Aesthetic

This document registers all the screens required for the POS operations and admin interfaces in Release 1, styled under the unified Light SaaS Design System (Nonprofit CRM aesthetic reference).

---

## 1. POS Client Application (`apps/pos-web/pages/index.tsx`)

### Screen 1: Dashboard & Terminal Lock
* **Purpose**: Terminal security, cashier shift login/unlock, quick user session identification.
* **Layout**: Centered white lock card (`width: 360px`, `radius-lg`), dark badge icon, live clock, 4-dot PIN indicator, and 10-key numeric keypad (`min-height: 50px`).

### Screen 2: Main Register / 3-Column Workspace
* **Purpose**: Primary cashier order-taking and checkout screen.
* **Layout**:
  * **Top Bar**: Sticky white header (`64px`), outlet status pill, navigation pill bar, date & live clock, cashier profile chip.
  * **Left Column**: Order Type switcher (Dine-In, Takeaway, Delivery), Table dropdown, Category filters with item count chips and mint active pill.
  * **Middle Column**: Search field with `⌘F` focus, 210px+ product card grid (food icon, stock pill, description, price, dark navy "+ Add" button).
  * **Right Column**: Active Cart panel with item list, modifier chips, stepper (+ / -), 5% GST tax line, and dark navy / emerald primary checkout CTA.

### Screen 3: Modifiers Selector Overlay Modal
* **Purpose**: Configuring item options (e.g. crust options, spice levels, add-on dips).
* **Layout**: Centered white dialog (`max-width: 580px`) with blurred backdrop. Required vs Optional modifier group cards with interactive option chips.

### Screen 4: Split & Settlement Panel Modal
* **Purpose**: Payment method selection (UPI QR Code with simulated webhook capture, Cash settlement with quick currency buttons & change calculator, EDC / Card terminal capture), bill splitting (1-5 ways), and invoice generation.

---

## 2. Operations & Back-Office Screens

### Screen 5: Kitchen Display System (KDS) (`apps/pos-web/pages/kitchen.tsx`)
* **Purpose**: Real-time kitchen staff order tracking and status transitions.
* **Layout**: Responsive grid of white ticket cards with status borders (Green normal, Amber warning, Red SLA breach), item quantity chips, age timers, and status progression action buttons.

### Screen 6: Inventory & 86-List Control Console (`apps/pos-web/pages/inventory.tsx`)
* **Purpose**: Stock portion adjustments, 86-list deactivations, and catalog availability management.
* **Layout**: 4-up KPI metric tiles with pastel icon squares, search & status filter pills, item cards with portion adjusters (-5, -1, +1, +5) and one-touch activation toggles.

### Screen 7: Executive Sales & Analytics Dashboard (`apps/pos-web/pages/admin.tsx`)
* **Purpose**: Executive revenue analysis, payment channel splits, statutory GST tax tracking (DEC-004), and settled invoices audit ledger.
* **Layout**:
  * **Header**: Personal greeting ("Good morning, Abdul") with time range switcher (Day, Month, Quarter, Year) and export button.
  * **4-Up KPI Cards**: Total Revenue (MTD), Table Occupancy Rate, Settled Invoices, and Average Order Value (AOV) with pastel icon badges, percentage trend chips, and mini progress sparklines.
  * **Split Panels**: Payment channel progress bars (UPI 56%, Card 28%, Cash 16%) and GST statutory provisions.
  * **Invoices Table**: Clean white data table with hairline dividers, payment mode pills, and timestamped audit records.
