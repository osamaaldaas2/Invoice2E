# Load Testing

> FIX: Audit V2 [F-032] — Load testing scaffold.

## Tools

- **k6** (recommended): `npm install -g k6` or download from https://k6.io
- **Artillery** (alternative): `npm install -g artillery`

## Planned Test Scenarios

1. **Credit deduction race condition**: 50 concurrent extractions for the same user — verify atomic deduction and no double-spend
2. **Batch processing throughput**: 100 invoices in parallel — measure p50/p95 latency and error rate
3. **Format conversion under load**: 20 concurrent conversions per format — verify no XML corruption
4. **Rate limiter behavior**: Exceed configured limits — verify 429 responses and correct Retry-After headers

## Run

```bash
k6 run tests/load/credit-race.js
```

## TODO

- [ ] Write k6 scripts for each scenario above
- [ ] Add to CI as nightly job (not on every PR)
- [ ] Configure thresholds (p95 < 2s for single conversion, p95 < 5s for batch)
- [ ] Set up Grafana dashboard for load test results
