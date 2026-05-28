# Smart School Backend API

Express.js + PostgreSQL backend for the Smart School platform (CMS, ERP, portals, chatbot, WhatsApp/SMS alerts).

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL, JWT, and optional integrations

# 3. Create database & apply schema
npm run setup-db

# 4. Run migrations & seed
npm run migrate:all
npm run seed

# 5. Start dev server (port 4500)
npm run dev
```

API base URL: `http://localhost:4500/api`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server with nodemon |
| `npm start` | Production server |
| `npm run setup-db` | Create DB and apply `database/schema.sql` |
| `npm run migrate:all` | Run all ERP/CMS migrations |
| `npm run seed` | Seed admin user and demo data |
| `npm test` | Run unit tests |

## Environment

Copy `.env.example` to `.env`. Required:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — strong random secret for production

Optional integrations: OpenAI, WhatsApp Cloud API, SMTP, Razorpay, Twilio/MSG91 SMS.

## API Documentation

See [docs/API.md](docs/API.md).

## License

MIT
