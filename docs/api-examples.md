# API Examples & curl Reference

All endpoints accept and return JSON. Until Build 7, the caller is identified by the `x-user-id` HTTP header.

---

### 1. Create Event

**Request:**
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "x-user-id: org_001" \
  -d '{
    "title": "Lagos Tech Fest 2026",
    "city": "Lagos",
    "venue": "Landmark Centre",
    "startsAt": "2026-11-20T18:00:00Z"
  }'
```

**Response (`201 Created`):**
```json
{
  "id": "e4c84a2b-3129-45e6-993d-49d685fa6901",
  "organizerId": "org_001",
  "title": "Lagos Tech Fest 2026",
  "city": "Lagos",
  "venue": "Landmark Centre",
  "startsAt": "2026-11-20T18:00:00.000Z",
  "status": "draft",
  "tierIds": [],
  "createdAt": "2026-10-28T14:00:00.000Z"
}
```

---

### 2. Add Ticket Tier

**Request:**
```bash
curl -X POST http://localhost:3000/api/events/e4c84a2b-3129-45e6-993d-49d685fa6901/tiers \
  -H "Content-Type: application/json" \
  -H "x-user-id: org_001" \
  -d '{
    "name": "General Admission",
    "priceCents": 500000,
    "capacity": 100
  }'
```

**Response (`201 Created`):**
```json
{
  "id": "787bb715-cfef-4c6e-82d2-43bbdcb06579",
  "eventId": "e4c84a2b-3129-45e6-993d-49d685fa6901",
  "name": "General Admission",
  "priceCents": 500000,
  "capacity": 100,
  "sold": 0,
  "createdAt": "2026-10-28T14:01:00.000Z"
}
```

---

### 3. Publish Event

**Request:**
```bash
curl -X POST http://localhost:3000/api/events/e4c84a2b-3129-45e6-993d-49d685fa6901/publish \
  -H "x-user-id: org_001"
```

**Response (`200 OK`):**
```json
{
  "id": "e4c84a2b-3129-45e6-993d-49d685fa6901",
  "organizerId": "org_001",
  "title": "Lagos Tech Fest 2026",
  "city": "Lagos",
  "venue": "Landmark Centre",
  "startsAt": "2026-11-20T18:00:00.000Z",
  "status": "published",
  "tierIds": [
    "787bb715-cfef-4c6e-82d2-43bbdcb06579"
  ]
}
```

---

### 4. Search, Filter, and Sort Events

**Request:**
```bash
curl "http://localhost:3000/api/events?q=Lagos&city=Lagos&maxPriceCents=600000&sortBy=date"
```

**Response (`200 OK`):**
```json
[
  {
    "id": "e4c84a2b-3129-45e6-993d-49d685fa6901",
    "organizerId": "org_001",
    "title": "Lagos Tech Fest 2026",
    "city": "Lagos",
    "venue": "Landmark Centre",
    "startsAt": "2026-11-20T18:00:00.000Z",
    "status": "published",
    "tierCount": 1,
    "minPriceCents": 500000,
    "seatsLeft": 100,
    "totalCapacity": 100,
    "totalSold": 0
  }
]
```

---

### 5. Book Tickets

**Request:**
```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee_42" \
  -d '{
    "tierId": "787bb715-cfef-4c6e-82d2-43bbdcb06579",
    "quantity": 2
  }'
```

**Response (`201 Created`):**
```json
{
  "id": "c138fd90-1c5e-4404-8b65-0210eb704ba4",
  "reference": "8M4KF79T",
  "userId": "attendee_42",
  "tierId": "787bb715-cfef-4c6e-82d2-43bbdcb06579",
  "eventId": "e4c84a2b-3129-45e6-993d-49d685fa6901",
  "quantity": 2,
  "amountCents": 1000000,
  "status": "pending",
  "createdAt": "2026-10-28T14:05:00.000Z"
}
```

---

### 6. Pay for Booking (Simulated Mock Payment)

**Request (Successful Payment):**
```bash
curl -X POST http://localhost:3000/api/bookings/8M4KF79T/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee_42" \
  -d '{
    "shouldDecline": false
  }'
```

**Response (`200 OK`):**
```json
{
  "booking": {
    "id": "c138fd90-1c5e-4404-8b65-0210eb704ba4",
    "reference": "8M4KF79T",
    "userId": "attendee_42",
    "tierId": "787bb715-cfef-4c6e-82d2-43bbdcb06579",
    "eventId": "e4c84a2b-3129-45e6-993d-49d685fa6901",
    "quantity": 2,
    "amountCents": 1000000,
    "status": "paid",
    "paidAt": "2026-10-28T14:06:00.000Z",
    "transactionId": "txn_1793203560000_3x8a9c"
  },
  "payment": {
    "success": true,
    "transactionId": "txn_1793203560000_3x8a9c",
    "amountCents": 1000000,
    "currency": "kobo",
    "chargedAt": "2026-10-28T14:06:00.000Z"
  }
}
```

**Request (Declined Payment):**
```bash
curl -X POST http://localhost:3000/api/bookings/8M4KF79T/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee_42" \
  -d '{
    "shouldDecline": true,
    "declineReason": "Insufficient funds"
  }'
```

**Response (`402 Payment Required`):**
```json
{
  "error": {
    "code": "PAYMENT_DECLINED",
    "message": "Insufficient funds"
  }
}
```

---

### 7. Cancel Unpaid Booking

**Request:**
```bash
curl -X POST http://localhost:3000/api/bookings/8M4KF79T/cancel \
  -H "x-user-id: attendee_42"
```

**Response (`200 OK`):**
```json
{
  "id": "c138fd90-1c5e-4404-8b65-0210eb704ba4",
  "reference": "8M4KF79T",
  "userId": "attendee_42",
  "tierId": "787bb715-cfef-4c6e-82d2-43bbdcb06579",
  "eventId": "e4c84a2b-3129-45e6-993d-49d685fa6901",
  "quantity": 2,
  "amountCents": 1000000,
  "status": "cancelled",
  "cancelledAt": "2026-10-28T14:07:00.000Z"
}
```
