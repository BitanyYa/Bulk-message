# Yonas Mobile SMS Sender

A lightweight, secure, and production-ready enterprise SMS campaign application for **Yonas Mobile**. Authorized employees can import customer contact lists, personalize messages, manage persistent campaigns, monitor delivery metrics in a real-time operations dashboard, and dispatch SMS to up to 500 unique customers per batch via the official **AfroMessage SMS API**.

Backed by **PostgreSQL** with **Prisma ORM** (compatible with Supabase, Neon, or Vercel Postgres).

---

## Key Features

- **Operations Dashboard**: Default landing page (`/`) featuring aggregate metrics (total campaigns, messages sent, delivered, failed, pending, success rate) and live AfroMessage balance.
- **Persistent Campaign History**: Searchable, filterable campaign archive (`/campaigns`) with status filtering (`DRAFT`, `SENDING`, `COMPLETED`, `PARTIALLY_FAILED`, `FAILED`, `INTERRUPTED`), date ranges, and pagination.
- **Campaign Creation & Dispatch**: Guided wizard (`/campaigns/new`) preserving verified file upload, duplicate detection, phone normalization, personalization previews, and client-orchestrated micro-batch sending.
- **Deep Campaign Inspection (`/campaigns/[id]`)**: Full audit view showing template, metrics, recipient-level statuses, error reasons, delivery timestamps, and masked phone numbers (`+251 91 ••• ••34`).
- **Safe Partial-Failure Retry**: Re-dispatches only recipients in `FAILED` or `TIMEOUT_UNCONFIRMED` state, never double-sending to accepted (`SUBMITTED` / `DELIVERED`) recipients.
- **CSV Audit Export**: Generates downloadable campaign recipient reports directly from persistent records.
- **Delivery Webhook Reconciler (`/api/webhooks/afromessage`)**: Handles real-time handset delivery status callbacks with optional secret validation (`AFROMESSAGE_WEBHOOK_SECRET`).
- **Resilient Batch Orchestration**: Micro-batch dispatching (concurrency of 5 per batch) ensures zero serverless timeout issues on Vercel while persisting live state to PostgreSQL.
- **Internal Access Protection**: Protects write and dispatch endpoints via `APP_ACCESS_KEY` validation with session persistence.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack, Partial Prerendering)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with rich enterprise palette and responsive layouts
- **Database & ORM**: PostgreSQL with Prisma ORM v6
- **SMS Gateway**: AfroMessage API (Ethiopian telecom gateway)
- **File Parsing**: ExcelJS for `.xlsx` and `.csv` files
- **Testing**: Vitest with comprehensive mocked unit and integration suites

---

## Database Schema (Prisma)

The application uses two primary relational models with referential integrity:

### `Campaign`
- `id`: Unique identifier (`cuid`)
- `name`: Human-readable campaign title
- `messageTemplate`: Text template containing optional `{{name}}`
- `status`: `DRAFT` | `SENDING` | `COMPLETED` | `PARTIALLY_FAILED` | `FAILED` | `INTERRUPTED`
- `totalRecipients`, `submittedCount`, `deliveredCount`, `failedCount`, `pendingCount`: Aggregated counters
- `createdAt`, `updatedAt`, `completedAt`: Audit timestamps

### `CampaignRecipient`
- `id`: Unique identifier (`cuid`)
- `campaignId`: Foreign key to `Campaign` (with `onDelete: Cascade`)
- `recipientName`: Customer name (optional)
- `phone`: Raw / Normalized phone number
- `maskedPhone`: Masked phone for UI & logs (`+251 91 ••• ••34`)
- `personalizedText`: Rendered personalized SMS message
- `status`: `PENDING` | `SUBMITTED` | `DELIVERED` | `FAILED` | `TIMEOUT_UNCONFIRMED`
- `providerMessageId`: AfroMessage callback correlation ID (indexed)
- `errorMessage`: Error description if failed
- `retryCount`: Count of re-send attempts
- `submittedAt`, `deliveredAt`: Delivery timestamps

---

## Environment Configuration

Configure `.env.local` based on `.env.example`:

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (pooled / transaction mode) |
| `DIRECT_URL` | Optional | — | Direct PostgreSQL connection string for migrations (e.g. Supabase port 5432) |
| `AFROMESSAGE_API_KEY` | **Yes** | — | Bearer API token from the AfroMessage developer dashboard |
| `AFROMESSAGE_SENDER_NAME` | Optional | `YonasMobile` | Approved AfroMessage Sender ID |
| `AFROMESSAGE_IDENTIFIER_ID` | Optional | — | System identifier ID for short code routing |
| `AFROMESSAGE_CALLBACK_URL` | Optional | — | Public URL where AfroMessage posts delivery callbacks |
| `AFROMESSAGE_WEBHOOK_SECRET`| Optional | — | Shared secret token verified on delivery webhooks |
| `APP_ACCESS_KEY` | Optional | — | Internal passphrase required to send SMS from the UI |
| `SMS_COST_PER_SEGMENT` | Optional | `0.35` | Tariff estimate in ETB per SMS segment |
| `SMS_CURRENCY` | Optional | `ETB` | Currency code for cost display |
| `DEFAULT_COUNTRY_CODE` | Optional | `+251` | Country calling code applied to local phone numbers |

---

## Database Setup & Migrations

### Local PostgreSQL Setup
If running PostgreSQL locally with Docker:
```bash
docker run --name yonas-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=yonas_sms -p 5432:5432 -d postgres:16
```
Set in `.env.local`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/yonas_sms?schema=public"
```

Apply migrations and generate Prisma Client:
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### Supabase / Vercel Postgres Setup
1. Create a PostgreSQL project on [Supabase](https://supabase.com/) or [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres).
2. Copy the Connection Pooling URL (Session / Transaction pooler, port `6543`) to `DATABASE_URL`.
3. Copy the Direct Connection URL (port `5432`) to `DIRECT_URL`.
4. Deploy migrations:
```bash
npx prisma migrate deploy
npx prisma generate
```

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma Client
npx prisma generate

# 3. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser:
- **`/`**: Campaign Dashboard with metrics and recent campaign table
- **`/campaigns`**: Full campaign history with search and filtering
- **`/campaigns/new`**: Create and dispatch a new SMS campaign
- **`/campaigns/[id]`**: Campaign details, recipient audit log, and retry controls

---

## Automated Testing

Automated test suites use Vitest with mocked provider responses and zero side effects:

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch
```

### Test Coverage Highlights
- **Campaign State & Resilience (`tests/campaigns.test.ts`)**:
  - Campaign creation and recipient aggregation
  - Interrupted campaign status detection
  - Safe retry candidate filtering (only `FAILED` / `TIMEOUT_UNCONFIRMED`)
  - Webhook delivery callback parser and status mapping
  - CSV report formatting and RFC 4180 escaping
  - Protected API routes access key verification
- **File Parsing (`tests/parser.test.ts`)**:
  - Excel (`.xlsx`) & CSV (`.csv`) reading via ExcelJS
  - Leading zero preservation (`09...`, `07...`)
  - Column auto-detection & manual mapping
  - Validation filtering & 500-recipient limit enforcement
- **SMS Personalization & Encoding (`tests/sms.test.ts`)**:
  - `{{name}}` placeholder interpolation
  - GSM-7 7-bit vs UCS-2 Unicode (Ge'ez/Amharic) segment calculation
- **AfroMessage Client (`tests/afromessage.test.ts`)**:
  - Token authentication, rate limiting (HTTP 429), and balance fetching
- **Access Control & Safe Retry (`tests/auth_and_retry.test.ts`)**:
  - Header authorization checks and retry selection logic

---

## Production Build

```bash
# Typecheck, lint, and build Next.js optimized bundle
npm run lint
npm run build
```

---

## Delivery Webhook Setup (AfroMessage)

To enable handset delivery confirmation:
1. Register your callback endpoint in the AfroMessage Developer Console:
   ```
   https://<your-domain.com>/api/webhooks/afromessage?secret=<YOUR_SECRET>
   ```
2. Set `AFROMESSAGE_WEBHOOK_SECRET` in your environment.
3. When AfroMessage receives handset carrier acknowledgments, it posts updates to this endpoint. The reconciler updates the recipient status to `DELIVERED` or `FAILED` and synchronizes the parent campaign counters in real time.

---

## Security Best Practices

1. **Phone Number Privacy**: Phone numbers are masked in all UI views, logs, and exports (`+251 91 ••• ••34`).
2. **Access Protection**: Configure `APP_ACCESS_KEY` to block unauthorized public access to sending routes.
3. **Server-Side Credentials**: `AFROMESSAGE_API_KEY` and database credentials are strictly server-side and never exposed to the client.
