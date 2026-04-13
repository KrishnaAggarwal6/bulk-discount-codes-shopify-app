# Bulk Discount Codes — Shopify App

A production-ready Shopify embedded app that lets merchants generate and apply **bulk discount codes** in seconds — directly from the Shopify Admin.

Built as a portfolio project to demonstrate full-stack Shopify app development using the modern React Router 7 + Shopify App Bridge stack.

---

## Features

- **Bulk code generation** — generate any number of unique, random discount codes in one click
- **Percentage or fixed-amount** discounts, configurable per campaign
- **Custom code length** — control character count for generated codes
- **Start date scheduling** — set when each discount campaign goes live
- **Targeted discount scope** — apply codes to all products, specific collections, or specific products
- **Two-phase Shopify API flow**:
  1. `discountCodeBasicCreate` — creates the discount with the first code
  2. `discountRedeemCodeBulkAdd` — bulk-attaches all remaining codes atomically
- **Live feedback** — inline success/error banners with the full list of generated codes
- **Embedded in Shopify Admin** — no external login, runs inside the merchant's dashboard

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [React Router v7](https://reactrouter.com/) (file-based SSR routing) |
| Shopify Integration | [@shopify/shopify-app-react-router](https://www.npmjs.com/package/@shopify/shopify-app-react-router) |
| UI Components | [Polaris Web Components](https://shopify.dev/docs/api/app-home/using-polaris-components) (`s-*` tags) |
| API | [Shopify Admin GraphQL API 2026-07](https://shopify.dev/docs/api/admin-graphql) |
| Auth | OAuth 2.0 via Shopify App Bridge (embedded, session-token based) |
| Database | SQLite + [Prisma ORM](https://www.prisma.io/) (session storage) |
| Build Tool | [Vite](https://vitejs.dev/) |
| Language | JavaScript (ESM) + TypeScript types |

---

## Architecture

```
bulk-discount-codes/
├── app/
│   ├── shopify.server.js           # Shopify auth + session config
│   ├── db.server.js                # Prisma client singleton
│   └── routes/
│       ├── app.jsx                 # App shell: AppProvider + nav
│       ├── app._index.jsx          # Redirects / → /app/creatediscount
│       ├── app.creatediscount.jsx  # Main feature: bulk discount UI + actions
│       ├── auth.$.jsx              # OAuth callback handler
│       ├── auth.login/             # Login entry point
│       ├── webhooks.app.uninstalled.jsx
│       └── webhooks.app.scopes_update.jsx
├── prisma/
│   └── schema.prisma               # Session model (SQLite)
├── shopify.app.toml                # App config: scopes, webhooks, OAuth URLs
└── package.json
```

### Discount Creation Flow

```
Merchant fills form
       ↓
Select scope: All Products | Specific Collections | Specific Products
       ↓
POST /app/creatediscount (action)
       ↓
Generate N unique codes (alphanumeric Set)
       ↓
discountCodeBasicCreate(firstCode, customerGets.items)  ← Shopify Admin GraphQL
       ↓
discountRedeemCodeBulkAdd(restCodes)                    ← Shopify Admin GraphQL
       ↓
Return codes list → render in UI
```

**`customerGets.items` is built based on scope selection:**
- `"all"` → `{ all: true }`
- `"collections"` → `{ collections: { add: [selectedCollectionIds] } }`
- `"products"` → `{ products: { productsToAdd: [selectedProductIds] } }`

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20.19
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) >= 3.x
- A [Shopify Partner account](https://partners.shopify.com/) with a development store

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/krishnaaggarwal/bulk-discount-codes.git
cd bulk-discount-codes

# 2. Install dependencies
npm install

# 3. Start the development server (handles OAuth + tunneling automatically)
npm run dev
```

Shopify CLI will open a browser to install the app on your development store. Once installed, you'll land directly on the Bulk Discount Code Generator page.

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with Shopify CLI tunneling |
| `npm run build` | Production build |
| `npm run deploy` | Deploy app config to Shopify Partners |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type check |

---

## Shopify API Usage

### Required Scopes

```
write_discounts
write_products
```

> `write_products` is required to fetch the store's product and collection lists for targeted discount scoping.

### Loader Queries

**Fetch all collections (for scope selector)**
```graphql
query {
  collections(first: 250) {
    edges { node { id title } }
  }
}
```

**Fetch all products (for scope selector)**
```graphql
query {
  products(first: 250) {
    edges { node { id title } }
  }
}
```

### Mutations Used

**1. Create a discount with the first code**
```graphql
mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
    codeDiscountNode { id }
    userErrors { field message }
  }
}
```

**2. Bulk-add remaining codes to the same discount**
```graphql
mutation discountRedeemCodeBulkAdd($discountId: ID!, $codes: [DiscountRedeemCodeInput!]!) {
  discountRedeemCodeBulkAdd(discountId: $discountId, codes: $codes) {
    bulkCreation { id }
    userErrors { code field message }
  }
}
```

---

## Key Implementation Details

- **Percentage values** are sent as `0.0–1.0` floats to the API (e.g. 10% → `0.10`)
- **Fixed amount** discounts use `discountAmount: { amount, appliesOnEachItem }`
- Codes are generated using an alphanumeric character set and deduplicated with a `Set` before submission
- All GraphQL errors are surfaced to the merchant via `userErrors` — no silent failures
- The app uses **session-token authentication** (embedded mode) — no cookies, no redirects in normal flow
- Loader queries (collections + products) are run **sequentially**, not in parallel — the Shopify `admin` client reuses the same session token and is not safe for concurrent requests

---

## Database

Uses SQLite in development via Prisma. The only model is `Session` (managed by `@shopify/shopify-app-session-storage-prisma`). No custom tables needed — all discount data lives in Shopify.

For production, swap the Prisma datasource to PostgreSQL or MySQL by updating `prisma/schema.prisma` and the `DATABASE_URL` environment variable.

---

## Deployment

```bash
# Deploy app configuration to Shopify Partners
npm run deploy

# Build for production
npm run build

# Start production server
npm run start
```

The app can be containerised using the included `Dockerfile`. Recommended hosting options:

- [Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run)
- [Fly.io](https://fly.io/docs/js/shopify/)
- [Render](https://render.com/docs/deploy-shopify-app)

---

## Environment Variables

| Variable | Description |
|---|---|
| `SHOPIFY_API_KEY` | Your app's API key from the Partner Dashboard |
| `SHOPIFY_API_SECRET` | Your app's API secret |
| `HOST` | Public URL of your app (auto-set by Shopify CLI in dev) |
| `DATABASE_URL` | Prisma database connection string (defaults to SQLite) |
| `NODE_ENV` | Set to `production` for production deployments |

---

## Author

**Krishna Aggarwal**
Built as a portfolio project demonstrating Shopify App development with the Admin GraphQL API, React Router 7, and Polaris Web Components.

- GitHub: [@krishnaaggarwal](https://github.com/krishnaaggarwal)

---

## License

MIT
