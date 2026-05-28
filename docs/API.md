# Smart School API Documentation

Base URL: `http://localhost:4500/api`

## Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | No | Admin login `{ email, password }` |
| POST | `/auth/logout` | Yes | Logout |
| GET | `/auth/me` | Yes | Current user |
| POST | `/auth/forgot-password` | No | Send reset email |
| POST | `/auth/reset-password` | No | Reset password `{ token, password }` |
| GET | `/auth/users` | Admin | List users |
| POST | `/auth/users` | Super Admin | Create user |

## Courses

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/courses` | No | List courses (`?class=&featured=&search=`) |
| GET | `/courses/:slug` | No | Course detail |
| POST | `/courses` | Admin | Create course (multipart) |
| PUT | `/courses/:id` | Admin | Update course |
| DELETE | `/courses/:id` | Admin | Soft delete |

## Faculty

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/faculty` | No | List faculty (`?department=&featured=`) |
| GET | `/faculty/:slug` | No | Faculty detail |
| POST | `/faculty` | Admin | Create (multipart) |
| PUT | `/faculty/:id` | Admin | Update |
| DELETE | `/faculty/:id` | Admin | Soft delete |

## Gallery

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/gallery` | No | List (`?category=&type=`) |
| POST | `/gallery` | Editor+ | Upload media |
| DELETE | `/gallery/:id` | Editor+ | Soft delete |

## Enquiries

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/enquiries` | No | Submit enquiry |
| GET | `/enquiries` | Admin | List enquiries (`?page=&limit=&status=`) |
| GET | `/enquiries/export` | Admin | Export CSV |
| PATCH | `/enquiries/:id` | Admin | Update status |

## AI Chatbot

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/chatbot/chat` | No | Chat `{ message, session_id?, language? }` |
| GET | `/chatbot/faqs` | No | List FAQs |
| GET | `/chatbot/logs` | Admin | Conversation logs (`?page=&limit=&search=&channel=`) |
| GET | `/chatbot/analytics` | Admin | Chat analytics |
| POST | `/chatbot/faqs` | Admin | Add FAQ |
| PUT | `/chatbot/faqs/:id` | Admin | Update FAQ |
| DELETE | `/chatbot/faqs/:id` | Admin | Delete FAQ |

## CMS

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/cms/announcements` | No | Active announcements |
| POST | `/cms/announcements` | Editor+ | Create |
| GET | `/cms/events` | No | Events list |
| POST | `/cms/events` | Editor+ | Create event |
| GET | `/cms/testimonials` | No | Testimonials |
| POST | `/cms/testimonials` | Editor+ | Create |
| GET | `/cms/achievements` | No | Achievements |
| POST | `/cms/achievements` | Editor+ | Create |
| POST | `/cms/contact` | No | Contact form |
| POST | `/cms/newsletter` | No | Subscribe `{ email }` |
| GET | `/cms/settings` | No | All settings |
| GET | `/cms/settings/integrations` | Admin | WhatsApp/SMS/Razorpay/email status |
| PUT | `/cms/settings/:key` | Admin | Update setting |
| GET | `/cms/contacts` | Editor+ | Contact messages (`?page=&limit=&search=`) |
| GET | `/cms/analytics` | Editor+ | Dashboard stats |

## ERP (Admin)

Base path: `/erp/*` — requires admin JWT unless noted.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/erp/students` | Paginated students (`?page=&limit=&search=&class=`) |
| POST | `/erp/attendance/bulk` | Bulk mark attendance |
| GET/POST | `/erp/homework` | Homework CRUD |
| GET/POST | `/erp/exam-terms` | Exam terms; PUT/DELETE `/erp/exam-terms/:id` |
| GET/POST | `/erp/exams` | Exams; POST `/erp/exams/:id/publish` |
| GET | `/erp/fee-invoices` | Paginated invoices |
| POST | `/erp/fee-invoices/send-reminders` | WhatsApp/SMS fee due reminders |
| POST | `/erp/fee-invoices/bulk-generate` | Bulk invoice generation |
| GET | `/erp/academic-years` | Academic years; PUT/DELETE `/erp/academic-years/:id` |
| GET | `/erp/portal/accounts` | Portal account management |
| GET | `/erp/analytics/dashboard` | ERP KPI dashboard |
| GET | `/erp/payroll/payslips/:id` | Single payslip detail |

## Portal & Teacher (JWT)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/erp/portal/login` | No | Parent/student login |
| GET | `/erp/portal/me` | Portal | Validate session |
| GET | `/erp/portal/dashboard` | Portal | Dashboard data (attendance, fees, homework, library, etc.) |
| POST | `/erp/portal/payments/invoices/:invoiceId/order` | Portal | Create Razorpay/mock payment order |
| POST | `/erp/portal/payments/verify` | Portal | Verify payment |
| POST | `/erp/teacher/login` | No | Teacher login |
| GET | `/erp/teacher/dashboard` | Teacher | Teacher dashboard |

Portal auth header: `Authorization: Bearer <portal_jwt>`

## WhatsApp

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/whatsapp/webhook` | Meta verify | Webhook verification |
| POST | `/whatsapp/webhook` | Meta | Incoming messages |

## Response Format

```json
{
  "success": true,
  "data": {},
  "message": "Optional message"
}
```

## Auth Header

```
Authorization: Bearer <jwt_token>
```
