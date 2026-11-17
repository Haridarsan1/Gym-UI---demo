# Gym Management SaaS · Product requirements

Source: Gym_Management_SaaS_Requirements.docx (version 1.0). Requirement IDs (R01, T01, W01, P01, M01, O01, S01, A01…) are referenced throughout `docs/PLAN.md` and the code.

Version 1.0 • Product and development handoff

The platform lets independent gyms and multi-branch operators manage members, sell memberships, schedule training, and track each client’s results. Trainers can plan and review sessions from a phone. Members can see what to do next, log what they completed, and manage their bookings and membership.

## Product model

Each gym organization is a separate tenant and may operate multiple branches. The software provider bills the gym for its SaaS subscription. Each gym separately sells memberships, training packages, and classes to its members.

## Roles and access

**R01 Platform administrator** Manages tenant provisioning, SaaS plans, limits, subscriptions, and support. Tenant access for support is time-limited, reasoned, and audited.

**R02 Gym owner and branch manager** The owner configures branches, roles, pricing, and organization-wide reporting. Branch managers operate within assigned locations and permission limits.

**R03 Front desk and finance** Front desk registers members, books sessions, records check-ins, and collects payments. Finance reconciles payments, exports accounts, and handles authorized refunds. Access to assessments and progress photos is restricted.

**R04 Trainer** Manages assigned clients, availability, assessments, workout plans, coaching notes, and progress reviews. Historical authorship remains visible after reassignment.

**R05 Member** Uses a mobile-friendly portal for personal workouts, progress, appointments, membership, payments, and receipts.

## Operating assumptions

Start with a responsive web application. Use one gym organization per tenant and support branch permissions from the first release. Currency, time zone, tax settings, and payment provider are configurable or selected at launch. The proposed release scope appears on page 7.

# Trainer and Client Workflow

**T01 Onboard and assign** Convert a trial or lead into a member, capture contact details and consent, and assign a primary trainer with effective dates. Authorized staff can reassign the trainer, revoke prior access, and preserve plans and logs.

**T02 Assess and set goals** Record training experience, availability, preferences, and member-reported restrictions. Capture baseline measurements and goals with target dates and review cadence. Make sensitive data optional and access-controlled.

**T03 Publish the plan** The trainer chooses a template or builds a program, schedules workout days, and publishes a dated version. The member sees the latest assigned workout and can open its instructions and alternatives.

**T04 Book coaching** Members or staff book sessions against trainer availability, branch hours, and package eligibility. A cancellation, reschedule, or no-show follows the gym’s policy and updates credits accordingly.

**T05 Complete and log** Member or trainer logs actual sets, reps, load, duration, distance, effort, and notes as applicable. A workout can be completed, partial, or skipped. Show which person entered or corrected a log.

**T06 Review and adjust** The trainer reviews adherence, trends, and client feedback, records shared feedback or private notes, and schedules a follow-up. Future workouts can change through a new plan version while prior prescriptions and results remain available.

**T07 Trainer dashboard** List assigned members, today’s sessions, overdue reviews, recent missed workouts, expiring training credits, and members awaiting a plan. The member dashboard shows today’s workout, upcoming bookings, progress, and renewal date.

## Example

A member joins on a monthly gym plan and buys eight personal training sessions. The trainer records a baseline, publishes three weekly workouts, and books two coached sessions. After four weeks, both review workout completion and strength trends. The trainer updates the next block while prior workouts and remaining training credits stay visible.

# Workout and Progress Requirements

**W01 Exercise library** Store name, category, muscle groups, equipment, instructions, optional video or image, and substitutions. Support tenant-defined exercises and archive exercises used in historical plans.

**W02 Program builder** Group workouts by program, week, and day. Configure exercise order, warm-up, cooldown, sets, reps or rep ranges, load, duration, distance, rest, tempo, effort target, and trainer cues where applicable. Support copying templates and previewing before publication.

**W03 Workout logging** Show prescribed and actual values side by side. Pre-fill targets for easy entry, record substitutions and skipped sets, and save drafts for later completion. Retried submissions must avoid duplicate workout logs.

**P01 Measurements and goals** Log dated weight, waist and other measurements, optional body-fat estimates with measurement method, fitness test results, strength benchmarks, and consented progress photos. Store units, data source, and the user who recorded each entry.

**P02 Progress views** Filter charts and history by date and metric. Show baseline, latest value, and change. Display workout completion, attendance, and personal records. Group volume by exercise and calculate comparable volume as the sum of load × completed reps where applicable.

**P03 Metric definitions** Count completed workouts against scheduled workouts whose dates have passed within the selected period, excluding canceled prescriptions. Show partial and skipped counts separately. Report logged activity alongside scheduled completion. Treat missing measurements as gaps.

**P04 Check-ins and reviews** Capture member feedback on effort, recovery, and obstacles. Mark goals as active, achieved, revised, or closed. Preserve goal changes and measurement corrections. Allow members to access shared reviews and progress reports.

## Example acceptance check

Given a workout prescribed as three sets of ten, a member logs 10, 10, and 8 reps. The trainer sees the original prescription and all three actual sets. Publishing a new plan leaves that session’s original targets intact.

# Membership Billing and Access

**M01 Plan catalogue** Configure trial, time-based, and visit-based plans with prices, effective dates, branch coverage, visits, class entitlements, and optional training credits. A sale snapshots its agreed terms.

**M02 Membership lifecycle** Support pending, scheduled, active, frozen, expired, and canceled memberships. Configure renewals, upgrades, proration, freeze rules, grace periods, and effective cancellation dates. Separate unpaid invoice status from membership status.

**M03 Invoices and payments** Create invoices with configurable taxes and discounts. Record cash, transfer, and online payments, including partial payments if enabled. Issue receipts, track dues and failed payments, and reconcile collections to gateway settlements and cash records.

**M04 Refunds and renewals** Allow authorized partial or full refunds and preserve a transaction history. Support manual renewal and opt-in auto-renewal where available. Process provider events idempotently and flag discrepancies for finance review.

**M05 Entry and attendance** Support front-desk lookup and QR check-in. Verify branch eligibility, plan validity, visit balance, and configured restrictions. Prevent a repeated scan from consuming an extra visit. Record staff overrides with a reason.

**M06 Personal training credits** Maintain a ledger of purchases, reservations, consumption, reversals, and expiry. Reserve a credit on booking where required. Consume or release it according to completion and cancellation policy. Apply refunds consistently to unused credits and payment records.

## Separate billing responsibilities

The gym’s owner dashboard shows member invoices, collections, and dues. The SaaS account dashboard shows the gym’s platform subscription, features, billing dates, and software invoices. Payments, refunds, and reports are scoped to their own billing account.

## Example acceptance check

A gateway retries a successful membership payment event. The platform keeps one recorded payment and activates the membership once. When a member on a visit-based plan scans twice in the same allowed check-in window, the platform debits one visit.

# Scheduling and Gym Operations

**O01 Calendar and class booking** Manage trainer shifts, leave, branch hours, rooms, recurring classes, and capacity. Show upcoming appointments to members. Prevent double-booking and overbooking when requests arrive concurrently.

**O02 Waitlists and attendance** Offer available spots to eligible waitlisted members according to configured rules. Track booked, canceled, attended, and no-show states. Send reminders and apply cancellation cutoffs and credit rules.

**O03 Leads and trials** Capture inquiry source, contact details, assigned staff, trial appointments, follow-up due date, and lead stage. Convert leads to member records with duplicate checks and preserve conversion history.

**O04 Communication** Send booking confirmations, cancellation notices, workout assignment updates, inactivity prompts, and renewal and payment reminders. Manage member preferences, marketing consent, templates, delivery logs, and retry behavior.

**O05 Equipment and incidents** Track equipment by branch, maintenance schedules, service history, and out-of-service status. Record facility incidents with restricted access and assign follow-up actions.

**O06 Reporting** Filter by branch and date. Track active and expiring memberships, renewals, leads and conversions, check-ins, peak hours, classes and no-shows, trainer utilization, personal training credits, invoices, collections, dues, and refunds. Export role-scoped CSV reports.

**O07 Reporting definitions** Calculate renewals against memberships due to expire in the selected cohort. Use attended seats divided by offered seats for class utilization. Compare coached hours with trainer hours available for booking. Show billed and collected amounts separately.

## Optional expansion

Add retail inventory and POS, commissions or payroll exports, locker management, in-app coaching chat, habit and nutrition logs, multi-location franchise rollups, turnstiles, and wearables according to the target gyms’ operating model.

# SaaS Administration and System Controls

**S01 Tenant onboarding** Create the gym account, invite the owner, configure branches and locale, and import members and plan balances with preview, validation, and row-level errors. Prevent duplicates when a batch is retried.

**S02 Platform subscriptions** Support trial, paid, past-due, suspended, and canceled tenant subscriptions. Configure plan limits by branches, staff, or active members and control feature entitlements. Define grace, read-only access, export, and reactivation behavior.

**S03 Tenant isolation** Apply organization, branch, and role checks to screens, APIs, reports, background jobs, and media downloads. Members access their own records and trainers access assigned members. Test cross-tenant access for records, exports, and direct links.

**S04 Data protection** Use secure authentication, administrative MFA, encrypted traffic and storage, and access-controlled files. Record consent and its scope for photos and assessments. Support authorized export and deletion requests according to the configured retention policy.

**S05 Audit and reliability** Log membership changes, refunds, credit adjustments, permission changes, support access, and sensitive record edits. Capture actor, time, action, reason where required, and the affected record. Monitor failures and verify backup restoration.

**S06 Proposed service targets** Validate a 99.9% monthly availability target, common views loading within two seconds at the 95th percentile under an agreed workload, a backup recovery point within 24 hours, and service restoration within eight hours.

**S07 Core records** Tenant, branch, user, staff role, member, trainer assignment, membership plan, membership, invoice, payment, refund, credit ledger entry, class, booking, check-in, exercise, workout plan version, workout log, goal, measurement, consent, and audit event.

## Operational interfaces

Platform console for tenant health and subscription support. Gym console for branch operations and finance. Mobile-friendly trainer and member views for workout logging, schedules, and reviews.

# Release Scope and Acceptance

## Proposed first release

Deliver tenant and branch setup, role permissions, member and trainer profiles, trainer assignment, assessments and goals, exercise library, versioned workout plans, workout logs and basic charts, memberships and renewals, invoices and payments, training credits, check-in, basic bookings, reminders, and core reports.

## Proposed second release

Add group classes and waitlists, lead and trial management, automated payment reconciliation, advanced analytics, equipment maintenance, and configurable notifications. Prioritize POS, turnstiles, coaching chat, and wearables based on the gyms selected for rollout.

## Release acceptance scenarios

**A01 End-to-end member journey** Register a member, record payment, check them in, assign a trainer, publish a workout, log a session, review a trend, and renew the membership.

**A02 Trainer transfer** Move a member between trainers. The new trainer can view the authorized history and the prior trainer loses member access. Existing records retain their original authors.

**A03 Booking conflicts** Submit two requests for the same trainer slot at the same time. One booking is confirmed and the unsuccessful attempt leaves the credit balance correct.

**A04 Lifecycle and finance** Verify a freeze, expiry, cancellation, refund, duplicate payment notification, no-show, and allowed override. Match resulting access, invoice status, and ledger entries to the configured rules.

**A05 Privacy and recovery** Verify tenant and branch isolation, consent-restricted photo access, role-scoped exports, and a backup restore in a test environment.

## Decisions for product sign-off

Confirm launch gyms and branch count, member and staff login methods, SaaS pricing metric, gym payment gateway and tax rules, access and cancellation policies, progress data retention, message channels, and expected peak load.
