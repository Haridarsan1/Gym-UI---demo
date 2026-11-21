# Screen-reader check: 15 minutes

For a person with an iPhone and a Mac. Automated checks (axe on every screen at 390 and 1440 px, run in `e2e/responsive.spec.ts`) cannot tell whether the app *makes sense* when spoken. This list does. VoiceOver’s exact wording differs a little between versions, so “hear” below means “something close to this”. Write down anything that is missing, wrong, or said twice.

Use the live preview address (or `npm run dev`). Each journey starts from the **Demo guide** (link on the login page and in the account menu): press **Start** on the scenario named, and you are signed in as the right person. Nothing is reset.

## Before you start

**iPhone (VoiceOver):** Settings → Accessibility → VoiceOver on (or say “Hey Siri, turn on VoiceOver”). Open Safari.
Swipe right = next item, swipe left = previous, double-tap = press, three-finger swipe = scroll. Rotor: twist two fingers to choose Headings, then swipe up or down.

**Mac (VoiceOver):** press ⌘F5. Safari. VO = Control+Option. VO+Right = next item, VO+Space = press, VO+U = rotor (arrow keys to pick Headings or Form controls, Enter to jump).

Turn the screen off or close your eyes for each journey if you can. If you get stuck for more than 30 seconds, that is a finding: write down where.

## 1. Log in (2 minutes)

Start at the login page (`/login`), signed out.

| Do | You should hear |
|---|---|
| Land on the page | The page title, then a heading such as “Log in”. |
| Swipe or Tab to the first field | “Email, edit text” (or “Phone number”). The label is spoken, not just “edit text”. |
| Swipe to the password field | “Password, secure edit text”. |
| Press Log in with the fields empty | An error in plain words (for example “Enter your email address…”), spoken without you moving. Focus moves to the problem field or the message. |
| Fill in `arjun.kumar@example.in` and any password, press Log in | “Today” and a greeting heading (“Good morning, Arjun”). You land on the main content, not the top of a long menu. |
| Use the rotor to list Headings | A sensible outline: the greeting first, then the cards (workout, week, membership). |

Pass if: every field is named, the error is spoken, and you know which page you are on without looking.

## 2. Log a set (4 minutes)

Demo guide → **Log a workout as Arjun** → Start. (Or from Today, the link “Start workout”.)

| Do | You should hear |
|---|---|
| Open the workout | A heading with the first exercise, “Arm circles” (level 2). |
| Swipe to the sets | A list named “Sets, …” (for example “Sets, 0 of 2 logged”), then each set as its own group (“Set 1”) with fields “Load (kg)” and “Reps” and their targets. |
| Press **Log set** | The set is announced as logged, and the list’s summary changes (for example “1 of 2 logged”). You do not have to hunt for the change. |
| Press **Next exercise** | The next exercise’s heading is spoken and focus is at its top. |
| Reach the last exercise and press **Finish** | A dialog or page that says the workout is complete, with the result read out (sets done, volume). No confetti is announced as text; celebration is visual only. |
| With “Reduce motion” on (Settings → Accessibility → Motion) | Same information, nothing animates. |

Pass if: you can log a whole workout without seeing the screen, and the rest timer, if it starts, is announced (not a silent countdown).

## 3. Book a session (3 minutes)

Still as Arjun. Tab bar or rail → **Bookings**.

| Do | You should hear |
|---|---|
| Press **Book a session** | “Book a session, dialog” (or sheet). Focus is inside it. Swiping does not wander to the page behind. |
| Choose a trainer | A list named “Trainers”; each trainer as a button with their name. |
| Choose a day, then a time | The days and times as buttons or radio buttons with their text (“Tue 18 Nov”, “6:30 am”), and which is selected. Times that are taken are “dimmed” or “unavailable”, not silent. |
| Confirm | A “Booking details” summary, then a status message that the session is booked and how many sessions are left. |
| Press Escape (Mac) or the two-finger scrub (iPhone) | The sheet closes and focus goes back to the “Book a session” button. |

Pass if: you never lose your place, the sheet traps focus, and the credits left are spoken.

## 4. Check in at the front desk (3 minutes)

Demo guide → **Check in a member at the front desk** → Start (you are Pooja Nair, front desk).

| Do | You should hear |
|---|---|
| Land on Check-in | A heading “Check-in” and a field “Search members, combo box”. |
| Type `arjun` | “Matching members, list box” and the number of matches, or the first match, spoken as you type. |
| Move down to “Arjun Kumar” and press | A result region: a heading with the outcome (for example “Checked in”), the member’s name, their plan and when it ends. |
| Search for `zzzzzz` | A plain message that nobody matches, and what to try next. |

Pass if: you can tell the outcome (allowed, not allowed and why) from the sound alone. Colour must not be the only signal.

## 5. Pay an invoice (3 minutes)

Demo guide → **Log a workout as Arjun** → Start, then **Membership** in the navigation. (Arjun has an invoice that can be paid; if none is open, press **Renew membership** instead.)

| Do | You should hear |
|---|---|
| Open Membership | A heading “Membership”, then the plan as a labelled region (“Monthly Plus”) with a list of what it includes. |
| Press **Pay ₹…** (or **Renew membership**, then **Continue to payment**) | A dialog named for what it is, with a “Summary” region reading the amount and the GST split (for example “₹3,500 plus ₹630 GST”). |
| Press **Pay ₹4,130** | A status message (“Paid”, or “Renewed”), not just a visual change. The invoice then shows as paid. |
| In the invoices list, open the receipt | A heading with the invoice number; the table of lines read as a table with column headings. |
| (Optional) turn on the switch “Make payments fail” in “Demo controls”, then pay | A plain error that says what happened and that nothing was charged, and a way to try again. |

Pass if: the amount you are about to pay is spoken before you press the button, and the result is announced.

## Write down

For each journey: pass, or the screen, what you heard, and what you expected. The most useful findings are:

- A button or link spoken as just “button” or “link”.
- Something that changes on screen but is silent.
- Focus that jumps to the top of the page, or is lost when a sheet closes.
- A control you could not reach without sight.
- The same thing spoken twice.

Send the notes to whoever is building the next fix. Nothing here needs a login to a real account; all of it is sample data in your browser.
