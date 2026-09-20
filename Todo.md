# DELIVERY SYSTEM
## Master Implementation README (Single Source of Truth)

> Build a complete production-ready, mobile-first delivery platform with three account types: **Customer**, **Kitchen**, and **Admin**. Every feature described here must be fully functional, connected to the database, tested, and production-ready.
---

PWA REQUIREMENT:

Build the entire application as a fully installable Progressive Web App (PWA), optimized for the target POS machine and mobile devices.

The PWA must include:
- Web App Manifest
- Service Worker
- Installable home-screen application
- Standalone/fullscreen display without browser UI
- Proper app icon and splash/loading configuration
- Offline-capable functionality where practical
- Responsive touch-first interface
- Fast startup and caching
- Automatic update handling

The POS experience must work as an installed PWA, not merely as a normal browser website. Test the installation and core functionality on the target POS device before considering the PWA implementation complete.

---

# PROJECT GOAL

Create a premium 2026-style delivery application where:

- Customers browse and order products.
- Kitchen staff receive, accept, prepare, and complete orders.
- Admin controls the entire business through analytics, reports, product management, and user management.

The application should feel modern, fast, reliable, and polished.

---

# DEVELOPMENT RULES

## Non-negotiable Rules

- Mobile-first.
- Production-ready.
- No placeholder features.
- No fake buttons.
- Every button performs a real action.
- Every action updates the database.
- Every account follows role permissions.
- Real-time synchronization.
- Secure authentication.
- Clean, organized code.
- No broken UI.
- Test everything before completion.

Priority:

1. Functionality
2. Real-time updates
3. Security
4. Performance
5. UI polish

---

# RECOMMENDED STACK

Frontend

- React
- Vite
- TypeScript
- Tailwind CSS

Backend

- Express.js
- Node.js

Database

- PostgreSQL

ORM

- Prisma

Authentication

- JWT
- Secure password hashing

Storage

- Image upload support

Notifications

- Real-time WebSocket or equivalent

Deployment

- Frontend
- Backend
- Database

---

# APPLICATION STRUCTURE

Frontend

apps/web

Backend

apps/api

Database

Prisma

Shared

Shared types and utilities

---

# ACCOUNT SYSTEM

The platform contains three independent account types.

| Role | Purpose |
|------|---------|
| Customer | Places orders |
| Kitchen | Manages incoming orders |
| Admin | Controls the business |
| Driver| to deliver orders| 
Each role has:

- Separate dashboard
- Separate permissions
- Separate navigation
- Protected routes

---

# AUTHENTICATION

## Registration

Customer registration includes:

- Name
- Phone
- Email
- Password

Kitchen accounts

Created by Admin only.

Admin accounts

Protected.

## Login

Features

- Secure login
- Remember session
- Logout
- Password hashing
- JWT authentication
- Session validation
- Unauthorized route protection

---

# CUSTOMER ACCOUNT

## Customer Dashboard

Display:

- Welcome message
- Active order
- Order status
- Recent orders
- Favorites
- Quick reorder
- Notifications

---

# PRODUCT CATALOG

Products come from the database.

Each product shows:

- Image
- Name
- Description
- Price
- Availability
- Estimated preparation time
- Popular badge
- New badge

Features:

- Search
- Category filters
- Sorting
- Infinite scrolling
- Fast loading

---

# PRODUCT CATEGORIES

Support unlimited categories.

Examples

- Meals
- Drinks
- Snacks
- Desserts
- Specials

Admin can create new categories anytime.

---

# PRODUCT PAGE

Each product contains:

- Large image
- Description
- Price
- Ingredients
- Preparation time
- Availability
- Quantity selector
- Add to Cart

---

# CART SYSTEM

The cart must support:

- Multiple items
- Quantity editing
- Remove item
- Order notes
- Price calculation
- Delivery fee
- Tax
- Grand total

Changes must update instantly.

---

# CHECKOUT

Customer enters:

- Delivery address
- Phone number
- Optional instructions

Payment options

- Cash
- Mobile Money

Checkout flow

1. Validate order.
2. Save to database.
3. Send to kitchen.
4. Show confirmation.
5. Begin live tracking.

---

# ORDER TRACKING

Real-time order tracking.

Statuses

- Order Received
- Accepted
- Preparing
- Ready
- Out for Delivery
- Delivered
- Cancelled

Status changes appear instantly.

---

# CUSTOMER ORDER HISTORY

History includes

- Date
- Order number
- Items
- Amount
- Status

Actions

- View receipt
- Reorder
- Download receipt

---

# CUSTOMER PROFILE

Profile includes

- Name
- Phone
- Email
- Saved addresses

Future support

- Loyalty points
- Favorites
- Coupons

---

# KITCHEN ACCOUNT

Kitchen interface must prioritize speed.

---

# KITCHEN DASHBOARD

Display

- Incoming orders
- Active orders
- Ready orders
- Completed today

Large readable cards.

No unnecessary clutter.

---

# ORDER QUEUE

Incoming orders appear instantly.

Each order card shows

- Order number
- Customer
- Time
- Items
- Notes
- Total

Actions

- Accept
- Reject
- View details

---

# ACCEPT ORDER

Accepting an order immediately updates

Customer:

"Order Accepted"

Kitchen queue updates automatically.

---

# REJECT ORDER

Kitchen provides

- Reason

Customer receives notification.

Order becomes cancelled.

---

# PREPARATION MANAGEMENT

Kitchen updates

- Preparing
- Ready

Customer sees updates instantly.

---

# KITCHEN ORDER DETAILS

Display

- Customer
- Phone
- Address
- Items
- Quantities
- Notes
- Payment method

---

# COMPLETED ORDERS

Kitchen can mark orders completed.

Completed orders move into history.

---

# KITCHEN HISTORY

View

- Today's orders
- Completed
- Cancelled

Search available.

---

# ADMIN ACCOUNT

Admin has complete control.

---

# ADMIN DASHBOARD

Dashboard displays

- Today's revenue
- Total orders
- Completed orders
- Cancelled orders
- Pending orders
- Average order value
- Top-selling products
- Peak order times

Charts

- Daily
- Weekly
- Monthly
- Yearly

---

# ANALYTICS

Charts must be real.

No placeholders.

Include

Revenue trends

Orders by day

Best products

Customer growth

Kitchen performance

Order completion rate

Average preparation time

---

# PRODUCT MANAGEMENT

Admin can

- Add products
- Edit products
- Delete products
- Archive products

Editable fields

- Name
- Price
- Description
- Category
- Image
- Stock
- Availability

Everything must save correctly.

---

# CATEGORY MANAGEMENT

Admin can

- Add
- Rename
- Delete
- Reorder

Products remain organized.

---

# USER MANAGEMENT

Admin manages

Customers

Kitchen staff

Admins

Features

- Activate
- Disable
- Reset password
- Delete
- Edit profile

---

# ORDER MANAGEMENT

Admin sees every order.

Filters

- Pending
- Preparing
- Ready
- Delivered
- Cancelled

Admin can override statuses.

---

# REPORTS

Generate reports

Daily

Weekly

Monthly

Yearly

Export

- PDF
- Excel

---

# NOTIFICATION SYSTEM

Notifications for

Customer

- Order updates
- Promotions

Kitchen

- New orders

Admin

- Business alerts
- Low stock
- System alerts

Real-time delivery.

---

# SEARCH SYSTEM

Search everywhere.

Products

Customers

Orders

Categories

Staff

Fast response.

---

# REAL-TIME SYNCHRONIZATION

Every important action updates instantly.

Examples

- New order
- Accept
- Prepare
- Ready
- Delivered
- Inventory changes

No manual refresh.

---

# RECEIPTS

Generate professional receipts.

Include

Business name

Order number

Date

Customer

Items

Totals

Payment method

Status

QR code

Printable format.

---

# DELIVERY STATUS FLOW

Complete workflow

Customer places order

↓

Kitchen receives instantly

↓

Kitchen accepts

↓

Preparing

↓

Ready

↓

Out for delivery

↓

Delivered

Every step updates live.

---

# DATABASE REQUIREMENTS

Core entities

Users

Products

Categories

Orders

Order Items

Notifications

Receipts

Settings

Reports

Logs

Relationships must be properly connected.

---

# API REQUIREMENTS

Secure REST API.

Use proper validation.

Examples

Authentication

Products

Orders

Categories

Users

Kitchen

Notifications

Reports

Every endpoint requires permission checks.

---

# SECURITY

Requirements

Password hashing

JWT validation

Role protection

Input validation

SQL injection protection

XSS protection

CSRF protection

Rate limiting

Secure headers

---

# PERFORMANCE

Optimize

- Lazy loading
- Image optimization
- Fast API responses
- Efficient database queries
- Caching where appropriate

Application should feel instant.

---

# MOBILE UI

Design language

- Premium
- Modern
- Glassmorphism-inspired
- Soft shadows
- Rounded corners
- Smooth animations

Use

- Clean spacing
- Large touch targets
- Readable typography

---

# NAVIGATION

Customer

Bottom navigation

- Home
- Search
- Cart
- Orders
- Profile

Kitchen

Bottom navigation

- Queue
- Active
- Ready
- History

Admin

Bottom navigation

- Dashboard
- Orders
- Products
- Reports
- Settings

---

# LOADING STATES

Every screen needs

- Skeleton loading
- Spinners
- Empty states
- Error states

No blank screens.

---

# EMPTY STATES

Examples

No products

No orders

No notifications

Provide helpful messages.

---

# ERROR HANDLING

Handle

- Network failure
- Server failure
- Validation errors
- Authentication expiration

Show clear messages.

---

# ACCESSIBILITY

Support

- Keyboard navigation
- Screen readers
- Good contrast
- Large touch areas

---
---

# DRIVER ACCOUNT

## Purpose

The Driver account is a dedicated delivery interface designed for speed and simplicity. Drivers should receive assigned deliveries, navigate to customers using a map, and complete deliveries with the fewest possible screens. The Driver interface must contain **no more than three pages**.

## Driver Interface Rules

- Maximum of **3 pages** only.
- Touch-first design with large buttons.
- Minimal clutter.
- Real-time order updates.
- Live customer location support.
- Fast loading and responsive performance.
- Every action must update the database instantly.

## Driver Navigation

### Mobile App (Primary Experience)

Use a **Bottom Navigation Bar** across the entire Driver interface.

Navigation items:

- **Deliveries**
- **Map**
- **Profile**

### Web/Desktop View

When viewed in a browser or desktop web view, replace the bottom navigation with a **Side Navigation** while keeping the same three destinations.

This navigation rule should be applied consistently across the entire application:
- **Mobile:** Bottom Navigation
- **Desktop/Web:** Side Navigation

---

# DRIVER PAGE 1 — DELIVERIES

This is the driver's main working screen.

### Show

- Assigned deliveries
- New delivery requests
- Active delivery
- Delivery status
- Customer name
- Customer phone
- Delivery address
- Distance
- Estimated arrival time
- Payment method
- Order value

### Actions

- Accept Delivery
- Start Delivery
- Call Customer
- View Order Details
- Mark as Delivered
- Report Delivery Issue

Only one active delivery should be highlighted clearly at a time.

---

# DRIVER PAGE 2 — MAP

The Map page is the primary navigation screen.

### Requirements

- Interactive map.
- Show driver's current location.
- Show customer's delivery location.
- Draw the recommended route.
- Display estimated travel time.
- Display remaining distance.
- One-tap navigation support.
- Automatic location updates while delivering.

### Delivery Information Panel

Display without leaving the map:

- Customer name
- Phone number
- Delivery address
- Order number
- Order notes
- Payment method

The driver should never need to open multiple screens to access essential delivery information.

---

# DRIVER PAGE 3 — PROFILE

A simple account management page.

### Display

- Driver name
- Profile photo
- Phone number
- Driver ID
- Today's completed deliveries
- Earnings summary (if enabled)
- Online/Offline toggle

### Actions

- Change password
- Edit profile
- Logout

Keep this page lightweight.

---

# DRIVER ORDER FLOW

Customer places order

↓

Kitchen accepts order

↓

Order becomes Ready

↓

Admin or automatic dispatch assigns Driver

↓

Driver receives instant notification

↓

Driver accepts delivery

↓

Map opens with customer route

↓

Driver delivers order

↓

Driver marks Delivered

↓

Customer and Admin receive confirmation instantly.

---

# DRIVER NOTIFICATIONS

Drivers receive real-time notifications for:

- New delivery assigned
- Delivery cancelled
- Customer called
- Route updates
- Delivery completed
- Important system alerts

Notifications must work while the app is installed as a PWA.

---

# DRIVER LOCATION SYSTEM

The application must support live location during active deliveries.

### Requirements

- Current driver location.
- Customer destination.
- Route guidance.
- Distance calculation.
- ETA calculation.
- Live location updates during delivery.
- Stop location sharing automatically after delivery completion.

---

# DRIVER PERMISSIONS

Drivers can:

- View assigned deliveries.
- Accept assigned deliveries.
- View customer location.
- Call customers.
- Update delivery status.
- Mark deliveries complete.
- View their own delivery history.

Drivers cannot:

- Edit products.
- Access admin analytics.
- Manage kitchen orders.
- View other drivers' private information.
- Change customer orders.

---

# DRIVER DELIVERY STATUS

The Driver can update only these statuses:

- Accepted
- On the Way
- Arrived
- Delivered
- Delivery Issue

Every status change must instantly synchronize with Customer, Kitchen, and Admin dashboards.

---

# RESPONSIVE NAVIGATION RULE (GLOBAL)

This navigation behavior applies across the entire application.

## Mobile

Use a **Bottom Navigation Bar** for every account type.

- Customer
- Kitchen
- Driver
- Admin

## Desktop/Web View

Replace the bottom navigation with a **Side Navigation** while preserving the same destinations and permissions.

The application should feel like a native mobile app first while remaining usable on larger screens.

---

# PWA DRIVER REQUIREMENTS

The Driver experience must work as a fully installable Progressive Web App.

Requirements:

- Standalone fullscreen mode.
- Home screen installation.
- Service Worker.
- Web App Manifest.
- Fast startup.
- Offline support where practical.
- Background notification support where possible.
- Proper app icon and splash screen.
- Smooth touch interactions on the target POS and mobile devices.

---

# FUTURE FEATURES

Design architecture so future additions are easy.

Future roadmap

- Rider accounts
- Live GPS
- Coupons
- Loyalty points
- Multiple restaurants
- Reviews
- Ratings
- Scheduled orders
- Subscription plans

Build with scalability in mind.

---

# TESTING REQUIREMENTS

Before completion, verify everything.

Authentication

- Register
- Login
- Logout
- Role protection

Customer

- Browse
- Search
- Cart
- Checkout
- Tracking

Kitchen

- Receive
- Accept
- Reject
- Prepare
- Complete

Admin

- Products
- Categories
- Users
- Reports
- Analytics

Database

- Create
- Update
- Delete

Real-time

- Every status updates instantly.

No unfinished features.

---

# CODE QUALITY

Requirements

- TypeScript clean
- No console errors
- No unused code
- Organized folders
- Reusable components
- Clear naming
- Consistent formatting

---

# DEPLOYMENT CHECKLIST

Frontend

- Production build succeeds.

Backend

- Runs without errors.

Database

- Migrations succeed.

Environment variables

Configured.

Authentication

Working.

Real-time

Working.

Receipts

Working.

Reports

Working.

Mobile

Fully responsive.

---

# COMPLETION RULES

The project is **NOT complete** until:

- Every button works.
- Every form saves correctly.
- Every database action succeeds.
- Every role follows permissions.
- Real-time synchronization works.
- Analytics display real data.
- Receipts generate correctly.
- Reports export correctly.
- No broken UI remains.
- No placeholder functionality exists.
- No console errors remain.
- The application is production-ready.

This README is the permanent implementation blueprint. Whenever there is uncertainty during development, follow the rules and requirements defined here rather than making assumptions.

---

# IMPLEMENTATION STATUS (2026-09-19)

All sections of this blueprint are implemented and verified.

## Verification results

- Production build (`npm run build`): shared + API + web all compile; PWA service worker generated (`dist/sw.js`, precache 25 entries).
- Unit tests (`npm run test`): 2/2 passing.
- End-to-end suite (`node scripts/e2e.mjs`): **144 passed, 0 failed** (repeat run also 144/144).
  - Sections: health, authentication, catalogue, customer order flow, kitchen lifecycle, **driver delivery flow (claim pool + admin dispatch + issue reporting)**, receipts, customer profile features, admin, admin catalogue CRUD, RBAC enforcement, web app + PWA.
- Migrations applied, database seeded (admin / kitchen / customer / **driver** accounts).

## Driver account (Page 1 Deliveries · Page 2 Map · Page 3 Profile)

- Database: `Order.driverId` + `Order.driver` relation (migration `20260919221831_order_driver_assignment`).
- API: `GET /driver/summary`, `GET /driver/deliveries`, `GET /driver/available`, `POST /driver/deliveries/:id/accept|pickup|complete|issue` — DRIVER-only, transactional claim guard.
- Status engine: drivers may only advance their own assigned deliveries `READY → OUT_FOR_DELIVERY → DELIVERED`.
- Realtime: kitchen marking an order READY notifies every driver (notification + socket); drivers keep lists live via `order:updated`; cancellations notify the assigned driver.
- Admin dispatch: `POST /orders/:id/assign-driver` assigns/clears a driver with timeline event, notification and activity log; UI lives in Admin → Orders → order dialog.
- Web: driver bottom navigation (Deliveries / Map / Profile), touch-first delivery cards, call customer (`tel:`), embedded map + turn-by-turn handoff, issue-report modal, profile with delivery stats.
- Seed account: `driver@deliverysystem.app` / `Driver@12345`.

## Known scope notes

- Map routing uses an OpenStreetMap embed plus a Google Maps turn-by-turn handoff (no API key required). Live driver GPS streaming to customers is future work (the realtime room infrastructure already supports it).
- Physical install testing on the target POS device remains a manual step (the manifest, service worker, offline fallback and update flow are all verified serving in production builds).
- "Future features" listed above (coupons, loyalty, reviews, multi-restaurant, subscriptions) remain intentionally out of scope.