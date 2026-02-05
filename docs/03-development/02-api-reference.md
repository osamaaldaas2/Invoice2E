# API Reference Documentation
## Invoice2E - REST API

| Property | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Base URL** | `/api` |
| **Authentication** | JWT via Supabase Auth |
| **Content-Type** | `application/json` (unless specified) |

---

## 1. Authentication

### 1.1 User Registration

**Endpoint:** `POST /api/auth/signup`

**Request Body:**
```json
{
    "email": "user@example.com",
    "password": "SecurePass123",
    "firstName": "John",
    "lastName": "Doe"
}
```

**Success Response:** `201 Created`
```json
{
    "success": true,
    "data": {
        "user": {
            "id": "uuid",
            "email": "user@example.com",
            "firstName": "John",
            "lastName": "Doe"
        },
        "session": { ... }
    }
}
```

**Error Responses:**
| Status | Error |
|--------|-------|
| 400 | Invalid email or password format |
| 409 | Email already registered |

---

### 1.2 User Login

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
    "email": "user@example.com",
    "password": "SecurePass123"
}
```

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "user": { ... },
        "session": { ... }
    }
}
```

**Error Responses:**
| Status | Error |
|--------|-------|
| 400 | Missing email or password |
| 401 | Invalid credentials |

---

## 2. Invoice Processing

### 2.1 Extract Invoice Data (AI)

**Endpoint:** `POST /api/invoices/extract`  
**Content-Type:** `multipart/form-data`  
**Max Duration:** 60 seconds

**Request Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | PDF, JPG, or PNG (max 25MB) |
| `userId` | string | Yes | Authenticated user ID |

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "extractionId": "uuid",
        "extractedData": {
            "invoiceNumber": "INV-2026-001",
            "invoiceDate": "2026-02-01",
            "buyerName": "ACME Corp",
            "sellerName": "Supplier GmbH",
            "lineItems": [...],
            "totalAmount": 1190.00,
            "currency": "EUR",
            "confidence": 0.95
        },
        "provider": "deepseek"
    }
}
```

**Error Responses:**
| Status | Code | Error |
|--------|------|-------|
| 400 | - | No file provided |
| 400 | - | User ID required |
| 402 | INSUFFICIENT_CREDITS | Not enough credits |
| 500 | EXTRACTION_ERROR | AI extraction failed |

---

### 2.2 Convert to XRechnung/UBL

**Endpoint:** `POST /api/invoices/convert`

**Request Body:**
```json
{
    "conversionId": "uuid",
    "userId": "uuid",
    "format": "CII",
    "invoiceData": {
        "invoiceNumber": "INV-2026-001",
        "invoiceDate": "2026-02-01",
        "buyerName": "ACME Corp",
        "buyerAddress": "123 Main St",
        "buyerCity": "Berlin",
        "buyerPostalCode": "10115",
        "buyerCountryCode": "DE",
        "buyerReference": "991-12345-67",
        "sellerName": "Supplier GmbH",
        "sellerEmail": "invoice@supplier.de",
        "sellerAddress": "456 Business Ave",
        "sellerCity": "Munich",
        "sellerPostalCode": "80331",
        "sellerCountryCode": "DE",
        "sellerTaxId": "DE123456789",
        "lineItems": [
            {
                "description": "Consulting Service",
                "quantity": 10,
                "unitPrice": 100.00,
                "totalPrice": 1000.00,
                "taxRate": 19
            }
        ],
        "subtotal": 1000.00,
        "taxAmount": 190.00,
        "totalAmount": 1190.00,
        "currency": "EUR",
        "paymentTerms": "Net 30 days"
    }
}
```

**Format Options:**
| Format | Description |
|--------|-------------|
| `CII` | XRechnung 3.0 (EN16931 Cross Industry Invoice) |
| `UBL` | UBL 2.1 (OASIS Universal Business Language) |

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "xmlContent": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>...",
        "fileName": "INV-2026-001_xrechnung.xml",
        "fileSize": 12345,
        "validationStatus": "valid",
        "validationErrors": [],
        "validationWarnings": []
    }
}
```

**Error Responses:**
| Status | Code | Error |
|--------|------|-------|
| 400 | - | Missing required fields |
| 400 | VALIDATION_ERROR | BR-DE rule violations |
| 402 | INSUFFICIENT_CREDITS | Not enough credits |
| 500 | CONVERSION_ERROR | XML generation failed |

---

### 2.3 Save Reviewed Data

**Endpoint:** `POST /api/invoices/review`

**Request Body:**
```json
{
    "extractionId": "uuid",
    "userId": "uuid",
    "invoiceData": { ... }
}
```

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "conversionId": "uuid"
    }
}
```

---

### 2.4 Get Conversion History

**Endpoint:** `GET /api/invoices/history`

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `userId` | string | Required | User ID |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 50) |
| `format` | string | - | Filter by CII/UBL |
| `status` | string | - | Filter by valid/invalid |

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "items": [
            {
                "id": "uuid",
                "invoiceNumber": "INV-2026-001",
                "buyerName": "ACME Corp",
                "format": "CII",
                "status": "valid",
                "creditsUsed": 1,
                "processingTimeMs": 2500,
                "createdAt": "2026-02-01T12:00:00Z"
            }
        ],
        "total": 50,
        "page": 1,
        "limit": 20,
        "totalPages": 3
    }
}
```

---

### 2.5 Get Analytics

**Endpoint:** `GET /api/invoices/analytics`

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `userId` | string | Required | User ID |
| `period` | string | month | week/month/year |

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "stats": {
            "totalConversions": 150,
            "successfulConversions": 142,
            "failedConversions": 8,
            "totalCreditsUsed": 150,
            "successRate": 94.67,
            "avgProcessingTime": 2300,
            "availableCredits": 50
        },
        "charts": {
            "dailyConversions": [...],
            "formatDistribution": [
                { "format": "CII", "count": 120, "percentage": 80 },
                { "format": "UBL", "count": 30, "percentage": 20 }
            ]
        }
    }
}
```

---

### 2.6 Bulk Upload (Batch Processing)

**Endpoint:** `POST /api/invoices/batch`  
**Content-Type:** `multipart/form-data`

**Request Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | ZIP file (max 100 PDFs) |
| `userId` | string | Yes | User ID |
| `format` | string | No | CII (default) or UBL |

**Success Response:** `202 Accepted`
```json
{
    "success": true,
    "data": {
        "jobId": "uuid",
        "status": "processing",
        "totalFiles": 25
    }
}
```

**Get Batch Status:** `GET /api/invoices/batch?jobId={id}`

---

## 3. Templates

### 3.1 List Templates

**Endpoint:** `GET /api/invoices/templates?userId={id}`

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": [
        {
            "id": "uuid",
            "name": "Standard Template",
            "isDefault": true,
            "usageCount": 45,
            "sellerName": "My Company GmbH"
        }
    ]
}
```

---

### 3.2 Create Template

**Endpoint:** `POST /api/invoices/templates`

**Request Body:**
```json
{
    "userId": "uuid",
    "name": "German Client Template",
    "sellerName": "My Company GmbH",
    "sellerTaxId": "DE123456789",
    "sellerIban": "DE89370400440532013000",
    "paymentTerms": "Net 14 days"
}
```

---

### 3.3 Update Template

**Endpoint:** `PUT /api/invoices/templates`

**Request Body:**
```json
{
    "userId": "uuid",
    "templateId": "uuid",
    "name": "Updated Template",
    ...
}
```

---

### 3.4 Delete Template

**Endpoint:** `DELETE /api/invoices/templates?userId={id}&templateId={id}`

---

## 4. Payments

### 4.1 Create Checkout Session

**Endpoint:** `POST /api/payments/checkout`

**Request Body:**
```json
{
    "userId": "uuid",
    "packageId": "professional",
    "email": "user@example.com",
    "paymentMethod": "stripe",
    "successUrl": "https://app.invoice2e.com/dashboard?success=true",
    "cancelUrl": "https://app.invoice2e.com/dashboard?canceled=true"
}
```

**Package Options:**
| Package ID | Credits | Price | Discount |
|------------|---------|-------|----------|
| `starter` | 10 | €5.00 | - |
| `basic` | 50 | €20.00 | 20% |
| `professional` | 100 | €35.00 | 30% |
| `enterprise` | 500 | €150.00 | 40% |

**Payment Methods:** `stripe`, `paypal`

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "sessionId": "cs_xxx",
        "url": "https://checkout.stripe.com/...",
        "method": "stripe",
        "credits": 100,
        "amount": 35.00
    }
}
```

---

### 4.2 Payment Webhook

**Endpoint:** `POST /api/payments/webhook`

Handles Stripe and PayPal webhook events for payment confirmation.

**Stripe Events:**
- `checkout.session.completed` → Add credits

**PayPal Events:**
- `CHECKOUT.ORDER.APPROVED` → Add credits

---

## 5. System

### 5.1 Health Check

**Endpoint:** `GET /api/health`

**Success Response:** `200 OK`
```json
{
    "status": "healthy",
    "timestamp": "2026-02-01T12:00:00Z",
    "version": "1.0.0"
}
```

---

## 6. Admin API (Role-Protected)

All admin endpoints require `admin` or `super_admin` role. Authentication via session cookie.

### 6.1 Dashboard Statistics

**Endpoint:** `GET /api/admin/stats`
**Required Role:** `admin`

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "totalUsers": 1500,
        "newUsersThisMonth": 120,
        "bannedUsers": 5,
        "totalRevenue": 25000.00,
        "revenueThisMonth": 3500.00,
        "totalTransactions": 850,
        "totalConversions": 15000,
        "successfulConversions": 14250,
        "conversionsThisMonth": 1200,
        "activePackages": 4
    }
}
```

---

### 6.2 List Users

**Endpoint:** `GET /api/admin/users`
**Required Role:** `admin`

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `search` | string | - | Search by email or name |
| `role` | string | - | Filter by role |
| `banned` | boolean | - | Filter banned users |

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "users": [
            {
                "id": "uuid",
                "email": "user@example.com",
                "firstName": "John",
                "lastName": "Doe",
                "role": "user",
                "isBanned": false,
                "availableCredits": 50,
                "totalConversions": 120,
                "createdAt": "2026-01-15T10:00:00Z",
                "lastLoginAt": "2026-02-05T08:30:00Z"
            }
        ],
        "pagination": {
            "page": 1,
            "limit": 20,
            "total": 1500,
            "pages": 75
        }
    }
}
```

---

### 6.3 Get User Detail

**Endpoint:** `GET /api/admin/users/[id]`
**Required Role:** `admin`

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "user": {
            "id": "uuid",
            "email": "user@example.com",
            "firstName": "John",
            "lastName": "Doe",
            "role": "user",
            "isBanned": false,
            "bannedAt": null,
            "bannedReason": null,
            "availableCredits": 50,
            "usedCredits": 200,
            "totalConversions": 120,
            "successfulConversions": 115,
            "totalSpent": 150.00,
            "loginCount": 45,
            "createdAt": "2026-01-15T10:00:00Z",
            "lastLoginAt": "2026-02-05T08:30:00Z"
        }
    }
}
```

---

### 6.4 Modify User Credits

**Endpoint:** `POST /api/admin/users/[id]/credits`
**Required Role:** `admin`

**Request Body:**
```json
{
    "amount": 50,
    "reason": "Compensation for service issue"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | integer | Yes | Credits to add (positive) or remove (negative) |
| `reason` | string | Yes | Reason for modification (audit trail) |

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "newBalance": 100,
        "previousBalance": 50,
        "change": 50
    }
}
```

---

### 6.5 Ban/Unban User

**Endpoint:** `POST /api/admin/users/[id]/ban`
**Required Role:** `admin`

**Request Body (Ban):**
```json
{
    "action": "ban",
    "reason": "Violation of terms of service"
}
```

**Request Body (Unban):**
```json
{
    "action": "unban"
}
```

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "userId": "uuid",
        "isBanned": true,
        "bannedAt": "2026-02-05T12:00:00Z",
        "bannedReason": "Violation of terms of service"
    }
}
```

---

### 6.6 List Transactions

**Endpoint:** `GET /api/admin/transactions`
**Required Role:** `admin`

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `status` | string | - | Filter: completed/pending/failed |
| `userId` | string | - | Filter by user ID |

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "transactions": [
            {
                "id": "uuid",
                "userId": "uuid",
                "userEmail": "user@example.com",
                "userName": "John Doe",
                "amount": 35.00,
                "currency": "EUR",
                "creditsPurchased": 100,
                "paymentMethod": "stripe",
                "paymentStatus": "completed",
                "createdAt": "2026-02-01T10:00:00Z"
            }
        ],
        "pagination": { ... }
    }
}
```

---

### 6.7 Refund Transaction

**Endpoint:** `POST /api/admin/transactions/[id]/refund`
**Required Role:** `super_admin`

**Request Body:**
```json
{
    "reason": "Customer requested refund"
}
```

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "transactionId": "uuid",
        "refundedAmount": 35.00,
        "creditsDeducted": 100,
        "newCreditBalance": 50
    }
}
```

**Error Responses:**
| Status | Error |
|--------|-------|
| 403 | Super admin access required |
| 400 | Can only refund completed transactions |

---

### 6.8 List/Create Packages

**Endpoint:** `GET /api/admin/packages`
**Required Role:** `admin`

**Endpoint:** `POST /api/admin/packages`
**Required Role:** `admin`

**Request Body (Create):**
```json
{
    "name": "Professional Pack",
    "description": "Best value for regular users",
    "credits": 100,
    "price": 35.00,
    "currency": "EUR",
    "isActive": true,
    "isFeatured": true,
    "sortOrder": 2
}
```

---

### 6.9 Update/Delete Package

**Endpoint:** `PUT /api/admin/packages/[id]`
**Required Role:** `admin`

**Endpoint:** `DELETE /api/admin/packages/[id]`
**Required Role:** `super_admin`

---

### 6.10 Audit Logs

**Endpoint:** `GET /api/admin/audit-logs`
**Required Role:** `admin`

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Items per page |

**Success Response:** `200 OK`
```json
{
    "success": true,
    "data": {
        "logs": [
            {
                "id": "uuid",
                "adminId": "uuid",
                "adminName": "Admin User",
                "adminEmail": "admin@example.com",
                "action": "user_banned",
                "resourceType": "user",
                "targetEmail": "user@example.com",
                "newValues": { "isBanned": true, "reason": "..." },
                "createdAt": "2026-02-05T12:00:00Z"
            }
        ],
        "pagination": { ... }
    }
}
```

---

## 7. Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `UNAUTHORIZED` | 401 | Authentication required |
| `INSUFFICIENT_CREDITS` | 402 | No credits available |
| `FORBIDDEN` | 403 | Access denied |
| `NOT_FOUND` | 404 | Resource not found |
| `EXTRACTION_ERROR` | 500 | AI extraction failed |
| `CONVERSION_ERROR` | 500 | XML generation failed |
| `DB_ERROR` | 500 | Database operation failed |

---

## 7. Rate Limits

| Resource | Limit |
|----------|-------|
| API requests | 100/minute per user |
| File uploads | 10/minute per user |
| Batch jobs | 5/hour per user |

---

## Document References

| Document | Path |
|----------|------|
| Source Code | [01-source-code.md](./01-source-code.md) |
| Architecture | [02-architecture/01-software-architecture.md](../02-architecture/01-software-architecture.md) |
| Database | [02-architecture/03-database.md](../02-architecture/03-database.md) |
