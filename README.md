# Yonas Mobile SMS Sender

A lightweight, secure, and production-ready internal company application that allows authorized employees of **Yonas Mobile** to import customer contact lists, personalize messages, and reliably dispatch SMS campaigns to up to 500 unique customers per batch via the official **AfroMessage SMS API**.

---

## Features

- **Excel & CSV File Ingestion**: Upload `.xlsx` or `.csv` files using `ExcelJS`.
- **Intelligent Header Detection**: Automatically identifies name and phone columns (`Customer Name`, `Full Name`, `Phone Number`, `Mobile`, etc.) with manual dropdown override.
- **Leading Zero Preservation**: Accurately preserves local Ethiopian mobile numbers starting with `09...` or `07...` without numeric truncation.
- **Phone Normalization & Masking**: Normalizes numbers into international E.164 format (`+251...`) as required by AfroMessage while masking phone numbers in UI and logs for customer privacy (`+251 91 ••• ••34`).
- **Duplicate & Validation Filtering**: Detects duplicate recipients after safe normalization, flags invalid rows with human-readable error reasons, and allows exclusion of invalid rows without dropping valid entries.
- **Enforced 500-Recipient Limit**: Strictly limits campaigns to 500 recipients both client-side and server-side to guarantee delivery reliability.
- **Dynamic SMS Personalization**: Replace `{{name}}` with recipient names or send uniform messages if omitted.
- **Segment & Encoding Estimation**:
  - Distinguishes standard **GSM-7** (160 characters/segment, 153 concatenated) from **UCS-2 Unicode** (70 characters/segment, 67 concatenated, for Ge'ez / Amharic text or emojis).
  - Multi-segment cost and warning indicators.
  - Live customer previews using actual imported customer names.
- **Client-Orchestrated Batching**: Chunks campaign dispatch into micro-batches to prevent serverless execution timeouts and provider rate limiting.
- **Safe Partial-Failure Retries**: Allows retrying only failed or unconfirmed messages without resending messages that were already accepted by the provider.
- **Internal Access Protection**: Protects sending endpoints via `APP_ACCESS_KEY` to prevent unauthorized public credit exhaustion.
- **Zero Permanent Storage**: Operates entirely in memory; files and customer lists are discarded after processing without retaining permanent databases.

---

## Prerequisites

- **Node.js**: v18.0.0 or higher (tested on Node.js v26.5.0)
- **Package Manager**: `npm` (v9+) or `yarn` / `pnpm`
- **AfroMessage Account**: Verified account on [AfroMessage](https://app.afromessage.com/) with an API token.

---

## Installation

Clone the repository and install dependencies:

```bash
cd Bulk-message
npm install
```

---

## Environment Configuration

Copy the example environment configuration:

```bash
cp .env.example .env.local
```

Configure the following variables in `.env.local`:

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `AFROMESSAGE_API_KEY` | **Yes** | — | Bearer API token from the AfroMessage developer dashboard |
| `AFROMESSAGE_SENDER_NAME` | Optional | `YonasMobile` | Your registered, approved AfroMessage Sender ID |
| `AFROMESSAGE_IDENTIFIER_ID` | Optional | — | System identifier ID if subscribed to multiple short codes |
| `AFROMESSAGE_CALLBACK_URL` | Optional | — | Public webhook URL for delivery status updates |
| `APP_ACCESS_KEY` | Optional | — | Internal secret password required to send SMS from the UI |
| `SMS_COST_PER_SEGMENT` | Optional | `0.35` | Tariff estimate in ETB per SMS segment |
| `SMS_CURRENCY` | Optional | `ETB` | Currency code for cost display |
| `DEFAULT_COUNTRY_CODE` | Optional | `+251` | Country calling code applied to local phone numbers |

---

## AfroMessage Setup

1. **Create and verify an account** on [AfroMessage](https://app.afromessage.com/).
2. Navigate to **API & Developers** to generate an API authorization token.
3. Add the token to `AFROMESSAGE_API_KEY` in `.env.local`.
4. Ensure your **Sender Name** (e.g., `YonasMobile`) is registered and approved by telecom operators (Ethio Telecom / Safaricom). Unapproved sender names will default to `AfroMessage` or be rejected.
5. Account balance and estimated messages can be verified via the AfroMessage balance endpoint (`/api/balance`), which is displayed in the application header.

---

## Internal Access Protection

To prevent unauthorized public visitors from triggering SMS campaigns and exhausting company credits:

1. Define an internal secret in `APP_ACCESS_KEY` (e.g. `APP_ACCESS_KEY=yonas-secret-key-2026`).
2. When configured, the sending endpoint `POST /api/send-batch` verifies the `x-app-access-key` header.
3. In the web interface, employees click the **"Company Access Key"** button in the header and enter the key once per session.

---

## Local Development

Start the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Automated Testing

Automated test suites are built with Vitest. **Automated tests use mocked provider responses and NEVER send real SMS messages.**

To run the full test suite:

```bash
npm run test
```

To run tests in watch mode:

```bash
npm run test:watch
```

### Test Coverage Highlights

- **File Parsing (`tests/parser.test.ts`)**:
  - Excel (`.xlsx`) and CSV (`.csv`) reading via ExcelJS
  - Preservation of phone numbers with leading zeros (`0911223344`, `0712345678`)
  - Automatic column detection (`Name`, `Customer Name`, `Phone`, `Mobile Number`)
  - Blank row and whitespace filtering
  - Missing name, invalid phone, and duplicate detection
  - Enforcement of the 500-recipient campaign cap
  - Manual column mapping overrides
- **SMS Personalization & Encoding (`tests/sms.test.ts`)**:
  - `{{name}}` placeholder replacement (case-insensitive)
  - Messages without placeholders
  - Unresolved placeholder detection (e.g., `{{amount}}`)
  - GSM-7 7-bit character encoding (160 single, 153 concatenated)
  - GSM-7 extended characters (`€`, `[`, `]`, `|`)
  - UCS-2 Unicode detection (Ge'ez/Amharic `ሰላም`, emojis, 70 single, 67 concatenated)
  - Multi-segment campaign segment estimation
- **AfroMessage Client (`tests/afromessage.test.ts`)**:
  - Successful single SMS submission
  - Authentication failure (HTTP 401/403)
  - Provider rate limiting (HTTP 429)
  - Provider validation errors (`acknowledge: "error"`)
  - Ambiguous timeouts without assuming confirmed failure
  - Account balance retrieval
- **Access Control & Safe Retry (`tests/auth_and_retry.test.ts`)**:
  - Unauthorized request blocking
  - Matching access key authorization
  - Safe retry candidate selector (only retrying failed/timed out items, skipping submitted items)

---

## Production Build & Deployment

Build the optimized production bundle:

```bash
npm run build
```

Run the production server:

```bash
npm run start
```

### Production Checklist

1. Set `NODE_ENV=production`.
2. Configure `AFROMESSAGE_API_KEY` and `APP_ACCESS_KEY` in your production environment variables.
3. Ensure the server has outbound HTTPS internet access to `https://api.afromessage.com`.
4. Deploy to any Node.js hosting platform (Vercel, AWS ECS/Amplify, Railway, Render, or a VPS with PM2).

---

## Safe Manual Verification Procedure

Before running large customer campaigns:

1. Download the sample CSV template using the button in the application.
2. Replace the sample numbers with **1 or 2 authorized internal staff phone numbers**.
3. Upload the file and verify:
   - Columns are detected as `Customer Name` and `Phone Number`.
   - Phone numbers show correct masking (`+251 91 ••• ••34`).
   - The message preview shows the recipient's actual name.
4. Review the confirmation dialog showing recipient count and segment estimate.
5. Click **"Confirm & Send Now"**.
6. Verify that the test phone receives the SMS and the application results table updates to **"Submitted"** with a valid AfroMessage message ID.

---

## Known Limitations & Provider Considerations

1. **Carrier Delivery Status**:
   - AfroMessage immediately returns `status: "Send in progress..."` with a unique `message_id` upon acceptance.
   - Per provider documentation, handset delivery confirmation requires configuring a public callback webhook URL with AfroMessage (`AFROMESSAGE_CALLBACK_URL`). The UI clearly differentiates between provider acceptance ("Submitted") and final handset delivery.
2. **Sender Name Approval**:
   - Custom sender IDs like `YonasMobile` require verification and telecom regulatory approval. In development or trial accounts, messages are sent under the default sender `AfroMessage`.
3. **Campaign Limit**:
   - Each campaign is capped at 500 unique valid recipients. Larger recipient lists must be dispatched in separate batches.
