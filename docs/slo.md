# Service Level Objectives (SLOs)

## Overview

This document defines the Service Level Indicators (SLIs), Service Level Objectives (SLOs),
and Error Budget policy for Invoice2E.

## SLIs and SLOs

### Availability

| SLI                                      | Target (SLO) | Measurement           |
| ---------------------------------------- | ------------ | --------------------- |
| Success rate (non-5xx responses / total) | 99.5%        | Rolling 30-day window |

Error Budget: 0.5% = ~3.6 hours of downtime per 30 days.

### API Latency (Standard Endpoints)

| SLI         | Target  | Endpoints                                  |
| ----------- | ------- | ------------------------------------------ |
| P50 latency | < 500ms | /api/auth/_, /api/credits/_, /api/users/\* |
| P95 latency | < 2s    | /api/auth/_, /api/credits/_, /api/users/\* |
| P99 latency | < 5s    | /api/auth/_, /api/credits/_, /api/users/\* |

### AI Extraction Latency

| SLI         | Target | Endpoints                                    |
| ----------- | ------ | -------------------------------------------- |
| P50 latency | < 15s  | /api/invoices/extract, /api/invoices/convert |
| P95 latency | < 30s  | /api/invoices/extract, /api/invoices/convert |
| P99 latency | < 55s  | /api/invoices/extract, /api/invoices/convert |

Hard timeout: 60 seconds (configured in lib/constants.ts).

### Error Rate

| SLI                        | Target | Scope                        |
| -------------------------- | ------ | ---------------------------- |
| 5xx error rate             | < 0.5% | All API endpoints            |
| AI extraction failure rate | < 5%   | Invoice extraction endpoints |

### Batch Processing

| SLI                      | Target    | Scope                     |
| ------------------------ | --------- | ------------------------- |
| Job completion rate      | > 95%     | Batch upload jobs         |
| Per-file extraction time | P95 < 45s | Individual files in batch |

## Error Budget Policy

When the error budget for any SLO is exhausted (< 0% remaining):

1. Halt non-critical feature deployments
2. Prioritize reliability fixes and improvements
3. Conduct incident review if budget was consumed by a single event
4. Resume normal development when budget is restored above 25%

## Measurement

- Availability and error rates: Sentry + Vercel Analytics
- Latency: Sentry performance monitoring (increase sample rate to 100% for SLO tracking)
- Health checks: /api/health endpoint with database, Redis, and AI provider status

## Review Cadence

Review SLOs quarterly. Adjust targets based on actual performance data and business needs.
