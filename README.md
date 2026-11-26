# MediBook - Clinic Appointment Booking Backend

**Video walkthrough:** VIDEO_LINK_HERE

Express.js + MySQL (`mysql2`, parameterized queries only, no ORM) + Redis (BullMQ job queues and a Redis-list waitlist).
Doctors see patients in 30-minute slots between 09:00 and 17:00, with at most 12 appointments per doctor per day.

## Contents

- [Setup](#setup) · [Running](#running) · [Tests](#tests)
- [API reference](#api-reference)
- [Design decisions and justifications (Parts A, C, D, E)](#design-decisions-and-justifications)
- [Project structure](#project-structure)
- [Demo script](#demo-script)
- [Original assignment brief](#original-assignment-brief)

## Setup

**Prerequisites:** Node.js 20+, MySQL 8, Redis 6+ (Redis is required for the waitlist and job queues; tests need neither).

1. **Create the database and sample data** (run as a MySQL admin user):

   ```bash
   mysql -u root -p < database/schema.sql
   mysql -u root -p < database/seed.sql
   ```

2. **Create an application user** (optional but recommended; or use root in `.env`):

   ```sql
   CREATE USER 'medibook_user'@'localhost' IDENTIFIED BY 'change_me';
   GRANT ALL PRIVILEGES ON medibook.* TO 'medibook_user'@'localhost';
   ```

3. **Start Redis** (for example `redis-server`, or `docker run -d -p 6379:6379 redis:7`).

4. **Configure the environment** - copy the template and edit the values:

   ```bash
   cp .env.example .env
   ```

   | Variable | Purpose | Default |
   |---|---|---|
   | `PORT` | web server port | `3000` |
   | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection | `localhost`, `3306`, `root`, *(empty)*, `medibook` |
   | `DB_POOL_SIZE` | connection pool size | `10` |
   | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Redis connection | `localhost`, `6379`, *(none)* |
   | `AUDIT_LOG_DIR` | audit log directory (auto-created) | `logs` |

   `.env` is git-ignored; only `.env.example` is committed.

5. **Install dependencies:** `npm install`

## Running

The web server and the worker are **two separate processes**; run each in its own terminal.

```bash
npm start          # web API  (http://localhost:3000)
npm run worker     # background worker: waitlist promotion + confirmation notifications
```

The seed uses dates relative to the day it is run, so there is always upcoming data. To reset: drop the `medibook` database and rerun step 1.

## Tests

```bash
npm test
```

36 Jest unit tests over pure functions (refund calculator, slot validation, input validators, date parsing, notification builder, feedback i18n). They import no database or Redis code, so they pass with MySQL and Redis switched off.

## API reference

All bodies are JSON. Datetimes are clinic-local wall-clock time, `YYYY-MM-DD HH:MM`.

| Method & path | Purpose | Success | Errors |
|---|---|---|---|
| `GET /api/patients` · `GET /api/patients/:id` | read all / one | 200 | 400, 404 |
| `POST /api/patients` | create (`fullName`, `email`, `phone`) | 201 + `Location` | 400, 409 duplicate email |
| `PUT /api/patients/:id` · `PATCH /api/patients/:id` | full / partial update | 200 | 400, 404, 409 |
| `DELETE /api/patients/:id` | delete | 204 | 404, 409 has appointment history |
| `/api/doctors` (same five operations) | `fullName`, `specialty`, `consultationFee`, `room` | | |
| `GET /api/doctors/:id/statistics` | revenue, upcoming count, next-7-days per-day counts, utilization % | 200 | 404 |
| `GET /api/appointments?doctorId=&patientId=&status=&date=` | list with optional filters | 200 | 400 |
| `GET /api/appointments/:id` | read one (also cancelled ones) | 200 | 404 |
| `POST /api/appointments` | **book** (`patientId`, `doctorId`, `datetime`) | 201 | 400, 404, 409 `SLOT_TAKEN` / `DAY_FULL` (with waitlist offer), 422 |
| `DELETE /api/appointments/:id` | **cancel** with server-computed refund | 200 (body states refund) | 404, 409 already cancelled, 422 already started |
| `POST /api/waitlist` | join the waitlist for an unavailable slot/day | 201 | 400, 404, 409, 422 |
| `GET /api/waitlist?doctorId=&date=` · `GET /api/waitlist/failed` | inspect the queue / parked failures | 200 | 400 |
| `GET /api/reports/doctors` | every doctor's total appointments and revenue (zero-appointment doctors included) | 200 | |
| `GET /api/reports/busy-days` | doctor-days with more than 80% of the 12-slot cap booked | 200 | |
| `GET /feedback?lang=en\|fr` | course feedback page (i18n) | 200 | |

Error responses share one shape: `{ "error": { "code", "message", "details?" } }`, produced by the central error-handling middleware.

Status code usage: **400** malformed or missing input; **404** unknown id or route; **409** the request is valid but conflicts with current state (slot taken, day full, duplicate email, already cancelled); **422** well-formed but violates a booking rule (past, off the 30-minute boundary, outside working hours, already started).

## Design decisions and justifications

### Part A - normalization (3NF)

The spreadsheet repeats patient details on every row and doctor details (specialty, fee, room) on every row. Splitting by what each attribute depends on:

- Patient name, email and phone depend on the patient, not on the appointment -> `patients`.
- Specialty, fee and room depend on the doctor -> `doctors`. Keeping them in `appointments` would be a transitive dependency (appointment -> doctor -> specialty).
- Only facts about the booking itself stay in `appointments`: slot, status, `amount_paid`, refund, timestamps. `amount_paid` is deliberately **not** derived from `doctors.consultation_fee`: the spreadsheet shows a patient paying 120.00 against a 150.00 fee, and a later fee change must not rewrite history.
- `appt_ref` ("AP-001") is derived from the primary key (`CONCAT('AP-', LPAD(id, 3, '0'))`) in the model query rather than stored.

Diagram: `schema-diagram.png` / `schema-diagram.pdf` (source: `docs/schema-diagram.dot`; the same design as DBML for dbdiagram.io is in `docs/schema.dbml`).

### Part C - booking, cancellation, concurrency

**No double booking, even for simultaneous requests.** `appointments` has a stored generated column `active_slot = IF(status = 'booked', appointment_datetime, NULL)` and `UNIQUE (doctor_id, active_slot)`. The database itself therefore refuses a second booked row for the same doctor and time. A plain `UNIQUE (doctor_id, appointment_datetime)` would also forbid rebooking a cancelled slot, which the requirements forbid; because MySQL treats NULLs as distinct in unique indexes, cancelled rows drop out of the constraint but stay in the table.

**The 12-per-day cap cannot race.** A count-then-insert check is a classic race, and a unique index cannot enforce a cap. Booking therefore runs in one transaction (`READ COMMITTED`) that first runs `SELECT ... FOR UPDATE` on the doctor's row. Concurrent bookings for the *same doctor* queue up on that lock; each one then sees the committed count left by the previous one. Different doctors do not block each other. Verified by firing 14 simultaneous requests at a 12-slot day (exactly 12 succeed) and 12 simultaneous requests for one slot (exactly one succeeds). The unique index remains as the last line of defence, and a duplicate-key error is mapped to the same `409 SLOT_TAKEN`.

**Refund policy** (single definition in `src/config/constants.js`, applied by the pure function `src/utils/refund.js`, never read from the client):

| Notice before the appointment | Refund |
|---|---|
| more than 48 hours | 100% |
| 24 hours up to and **including** exactly 48 hours | 50% |
| less than 24 hours | 0% |

So exactly 48h -> 50% (100% requires *more than* 48h) and exactly 24h -> 50% (0% requires *less than* 24h). Comparison is done in milliseconds and money in integer cents to avoid floating-point surprises.

**Cancellation and refund succeed or fail together.** Cancelling is one transaction: lock the row (`FOR UPDATE`), compute the refund from the locked row, then a single `UPDATE` sets `status`, `refund_amount` and `cancelled_at` together. With only three tables allowed, the refund record lives on the appointment row, so atomicity comes from that single transactional update. Cancelled rows are never deleted, which keeps refund history; `DELETE /api/appointments/:id` is therefore a soft delete and returns 200 with the refund breakdown (a 204 would hide the amount).

**Statistics and reports are computed in SQL** (`src/models/reportModel.js`): conditional aggregates, a recursive calendar CTE so quiet days show 0, `LEFT JOIN` so doctors with no appointments still appear, and `HAVING COUNT(*) * 100 > threshold * cap` for the busy-days report. "Revenue collected" means amount paid minus refunds. The 7-day window is today plus the next six days; its utilization is booked / (7 x 12).

### Part D - audit log

`src/utils/auditLogger.js` appends one JSON object per line to `logs/audit.log` with `fs/promises` (`mkdir({ recursive: true })` on first use and at start-up, then `appendFile`). No `*Sync` call exists in any request path. Every write is wrapped so failure is logged to the console and swallowed: a broken log can never fail a booking or cancellation. The worker writes to the same file (`CONFIRMATION_SENT`, `WAITLIST_PROMOTED`, `WAITLIST_PROMOTION_FAILED`).

### Part E - queues, waitlist and failure handling

- **Offering the waitlist.** A booking that hits a taken slot or a full day returns `409` with a ready-made `waitlist` offer. `POST /api/waitlist` then pushes the patient onto a Redis list, one list per doctor per day, FIFO. A request for a slot that is actually free is rejected, and so are duplicates.
- **Cancellation notifies the waitlist.** After the cancellation commits, a `promote-waitlist` job is added to a BullMQ queue. The separate `npm run worker` process consumes it (concurrency 1, so two promotions never fight over one entry). An entry for a specific taken slot matches only that slot; an entry for a full day matches any freed capacity that day and is booked at its requested time. The first matching entry in FIFO order is booked through the same `bookAppointment` rules as a normal request.
- **A failed promotion never loses the patient.** An entry is removed from Redis only *after* its booking has committed. If the booking fails:
  - `409` (someone took the slot first): the entry stays queued and the next candidate is tried.
  - `400/404/422` (patient deleted, slot no longer valid...): permanent, so the entry moves atomically (`MULTI`) to the `waitlist:failed` dead-letter list with a failure code and is logged. It is visible at `GET /api/waitlist/failed`.
  - Anything else (database or Redis outage): the job throws and BullMQ retries three times with exponential backoff; the entry is still queued throughout.

  If the worker crashes between the commit and the removal, the next run notices the patient already holds the slot and just removes the entry instead of double booking.
- **Confirmation jobs.** Each confirmed booking (including promoted ones) enqueues a `appointment-confirmation` job; the worker writes an email and an SMS line to the audit log. If Redis is unreachable, the booking itself still succeeds (enqueue is best-effort and logged).
- **Known limitation.** If Redis is down at the moment of a cancellation, that promotion job is not enqueued; the patients stay on the waitlist and are promoted on the next cancellation for that day.

### Part G - i18n/l10n

`locales/en.json` and `locales/fr.json` hold the title, instructions and the five questions. `GET /feedback?lang=fr` renders French; a missing or unsupported `lang` (including values like `__proto__`) falls back to English. Today's date is formatted with `Intl.DateTimeFormat` for the active locale.

### Code quality

All business values (12-slot cap, slot length, working hours, refund tiers, busy-day threshold, queue names) live once in `src/config/constants.js`; configuration comes from environment variables. The database `CHECK` constraints for working hours (09:00-16:30 start) mirror the constants as a safety net. Patients and doctors share one generic CRUD controller and router.

## Project structure

```
database/            schema.sql, seed.sql
docs/                schema-diagram.dot (source), schema.dbml
locales/             en.json, fr.json
schema-diagram.png   schema-diagram.pdf
src/
  config/            env.js, db.js (pool), constants.js (business rules, defined once)
  models/            ALL SQL lives here (patient, doctor, appointment, report models)
  services/          booking, cancellation, waitlist, statistics, feedback page
  controllers/       HTTP <-> service/model glue, no SQL
  routes/            URL + method mapping
  middleware/        central error handler, 404
  queues/            Redis connection, BullMQ producers, waitlist store
  utils/             pure functions (refund, slot validation, validators, dates), audit logger
  server.js          web process        worker.js   background worker process
postman/             Postman collection for the demo
tests/               Jest unit tests (no MySQL/Redis needed)
```

## Demo script

A ready-made Postman collection is in `postman/MediBook.postman_collection.json` (import it, set nothing, run folders top to bottom: it computes future dates and passes ids between requests; all 43 assertions pass against a freshly seeded database). Start `npm start` and `npm run worker` first. The same flow with curl:

```bash
BASE=http://localhost:3000
D=$(date -d "+3 days" +%F)          # macOS: date -v+3d +%F ; Dr. Boateng is fully booked (12/12) on this day

# 1. Day is full -> 409 with a waitlist offer
curl -s -XPOST $BASE/api/appointments -H 'content-type: application/json' \
  -d "{\"patientId\":5,\"doctorId\":1,\"datetime\":\"$D 15:00\"}"

# 2. Join the waitlist
curl -s -XPOST $BASE/api/waitlist -H 'content-type: application/json' \
  -d "{\"patientId\":5,\"doctorId\":1,\"datetime\":\"$D 15:00\"}"

# 3. Cancel any booked appointment that day -> refund in the response; the worker then promotes patient 5
curl -s "$BASE/api/appointments?doctorId=1&date=$D"        # pick an id with status "booked"
curl -s -XDELETE $BASE/api/appointments/<id>

# 4. See the result, the audit trail and the reports
curl -s "$BASE/api/appointments?doctorId=1&date=$D&status=booked"
cat logs/audit.log
curl -s $BASE/api/reports/doctors
curl -s $BASE/api/reports/busy-days
curl -s $BASE/api/doctors/1/statistics
```

## Original assignment brief

<details>
<summary>The assignment instructions this project implements (unchanged)</summary>

```text
Final Assessment — Backend Development
Weight: 30% of final grade Duration: 2 weeks Mode: Individual project Stack (mandatory): Node.js, Express.js, MySQL (with parameterized queries only), Redis

Scenario — "MediBook" Clinic Appointment System
A community clinic wants a backend service for booking doctor appointments. Doctors see patients in fixed 30-minute slots during working hours (09:00–17:00), each doctor can handle at most 12 appointments per day, and the clinic administrator needs reports. You will design the database, build the API, and handle the operational concerns (background jobs, logging, testing).

Entity limit: Your database must contain exactly 3 entities:

Entity	Purpose
patients	People who book appointments
doctors	Doctors with a specialty, consultation fee, and room
appointments	A patient's booking with a doctor at a specific date/time (links the other two)
You may add columns as needed, but no additional tables (lookup/locale JSON files don't count).

Part A — Database Design & Normalization
The clinic currently tracks everything in this single spreadsheet:

appt_ref	patient_name	patient_email	patient_phone	doctor_name	specialty	consultation_fee	room	appt_datetime	amount_paid	booked_on
AP-001	Ama Mensah	ama@mail.com	0244-111-222	Dr. Boateng	Dermatology	150.00	R-12	2026-08-10 09:00	150.00	2026-07-01
AP-002	Kojo Owusu	kojo@mail.com	0555-333-444	Dr. Boateng	Dermatology	150.00	R-12	2026-08-10 09:30	120.00	2026-07-02
AP-003	Ama Mensah	ama@mail.com	0244-111-222	Dr. Adjei	Paediatrics	100.00	R-03	2026-08-15 10:00	100.00	2026-07-03
Study the spreadsheet, then produce a database schema diagram of your design in fully normalized form (up to 3NF). The diagram must show everything:

all 3 entities with every column and its MySQL data type,
primary keys and foreign keys, clearly marked,
the relationships between the entities and their cardinality (1:N, etc.),
every constraint that enforces a business rule (NOT NULL, UNIQUE, CHECK) — in particular, it must be visible from the diagram that a doctor cannot have two appointments at the same date/time.
Use any tool you like (dbdiagram.io, draw.io) and include it in your repository as schema-diagram (image or PDF).

Part B — Database Implementation & Project Setup
Table creation. Translate your Part A diagram into a MySQL DDL script, database/schema.sql, that creates the database and the 3 tables — data types, primary keys, foreign keys, and every constraint shown on the diagram. The script must run cleanly on a fresh MySQL server. Also provide database/seed.sql with realistic sample data: at least 3 patients, 3 doctors (including one with no appointments), and 8 appointments (including one doctor-day at or near the 12-slot daily cap).

Project structure. Set up the Express project in a models / controllers / routes structure:

├── database/          schema.sql and seed.sql (Part B.1)
└── src/
    ├── models/        all application SQL lives here — nowhere else
    ├── controllers/   business logic; calls model functions, never the DB directly
    └── routes/        maps URLs and HTTP methods to controllers
Every SQL statement in the application must use parameterized queries (? placeholders via mysql2). SQL found in a controller or route file loses marks. Do not use any ORM for this assignment.

Part C — Controllers & Endpoints
Implement endpoints for the operations below. Designing the API is part of the assessment: you choose the URL paths, the HTTP methods, and how the endpoints are grouped into controllers and routes — your choices should follow REST conventions and will be marked. The business rules listed are requirements — how you satisfy them is your design decision, and you will be asked to defend it at the viva.

Basic CRUD — standard Create, Read (one and all), Update, and Delete operations for patients and for doctors, with sensible validation. (Appointments get their create/delete behaviour from the two operations below — no separate CRUD needed there.)

Book an appointment. Rules that must always hold:

Appointments can only be booked in the future, within working hours (09:00–17:00), on a 30-minute slot boundary.
A doctor never exceeds 12 appointments in a day.
Two patients can never hold the same doctor slot — even when both requests arrive at the same instant.
Cancel an appointment. Rules:

The refund is computed by the server from the notice given: more than 48 hours → 100%; 24–48 hours → 50%; less than 24 hours → 0%. The response states the refund amount.
The cancellation and its refund record succeed or fail together.
A cancelled slot becomes bookable by another patient, while the cancellation record is kept for refund history.
A cancellation notifies the waitlist (Part E).
Doctor statistics — for a given doctor: revenue collected, upcoming appointment count, appointments per day for the next 7 days, and utilization % against the 12-slot daily cap.

Operations 5 and 6 are where your advanced SQL is assessed: the results must be produced by the SQL in your models (joins, aggregates, etc) — not fetched raw and computed in JavaScript.

Doctors report — every doctor's total appointments and revenue collected, including doctors with zero appointments.
Busy days report — every (doctor, date) where more than 80% of the 12-slot daily capacity is booked.
General requirements (all endpoints)
Input validation with meaningful 400 messages; correct status codes (201, 404, 409, 422); a central error-handling middleware.

Part D — Node.js fs Module
Audit log: every successful booking and cancellation must be appended as a JSON line to logs/audit.log using the fs module (async, non-blocking — no *Sync calls inside request handlers). The logger must create the logs/ directory on first run if it doesn't exist, and a logging failure must not fail the user's request.

Part E — Queues & Redis
Waitlist queue: when the requested slot (or the doctor's whole day) is fully booked, offer the patient a waitlist spot — push them onto a queue (Redis list, or Bull/BullMQ). When a cancellation frees a slot, a worker process (separate from the web server) pops the first waitlisted patient and books them in. Think through: what happens if the promoted booking itself fails? The patient must not simply vanish from both the queue and the appointments table.
Notification jobs: every confirmed appointment enqueues a "confirmation SMS/email" job; the worker processes it by writing the message to the audit log (no real sending needed).
Part F — Unit Testing
Using Jest, write at least 6 meaningful unit tests:

The refund calculator from Part C.3 — cover all three tiers and both boundaries (exactly 24 hours, exactly 48 hours). Boundary behaviour must match your documented policy.
One validation function of your choice — e.g., the slot-alignment/working-hours check — including at least one edge case (17:00 exactly? 09:15? a malformed date?).
Tests must not require a live MySQL or Redis connection — that's the point of extracting pure functions. npm test must run them.

Part G — i18n & l10n: Course Feedback Page
Create a simple HTML page (served by your Express app at GET /feedback) containing a short course-feedback form with exactly 5 essay questions (each answered in a <textarea>):

Which topic in this course did you find most challenging, and why?
Describe one concept you understood only after the practical assignments. What made it click?
How has your approach to designing databases or APIs changed since the start of the trimester?
What would you improve about how this course was taught or assessed?
How do you plan to apply what you learned in this course going forward?
i18n/l10n requirement (keep it simple): the page title, instructions, and all 5 questions must be loaded from locale files (e.g., locales/en.json and locales/fr.json — English plus one other language of your choice). Visiting /feedback?lang=fr shows the translated page; the default is English, and an unsupported lang value must fall back to English rather than crash. Display today's date on the page formatted for the active locale (e.g., using Intl.DateTimeFormat).

Submission Requirements
Git repository (with meaningful commit history — a single "final commit" will be questioned) containing:
schema-diagram (image or PDF), schema.sql, and seed.sql (as specified in Part B)
Application source, worker process, tests, locale files
README.md with: setup steps, .env.example, and the short written justifications requested in Parts C, D, and E
The app must start with npm install && npm start (plus documented MySQL/Redis setup) and tests with npm test.
A short viva/demo (10 minutes) walkthrough.
Automatic penalties: SQL injection vector anywhere in the app (−15), secrets committed to the repo (−5), app does not start per README instructions (−10), work the student cannot explain in the video (or at a follow-up viva if called) | Academic integrity referral; affected criteria re-scored at Developing or below |
```

</details>
