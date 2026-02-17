# Monitoring — Invoice2E

Prometheus + Grafana observability stack for Invoice2E.

## Architecture

```
Invoice2E (Next.js)
  ├─ /api/metrics   → Prometheus scrape endpoint (prom-client)
  ├─ /api/health    → Health check endpoint (JSON)
  └─ lib/metrics.ts → Business metric counters, histograms, gauges
         │
         ▼
    Prometheus  ──→  Grafana
    (scrape)         (dashboards + alerts)
```

## Quick Start

### 1. Prerequisites

- Docker & Docker Compose (or standalone Prometheus + Grafana)
- Invoice2E running with metrics endpoint exposed

### 2. Prometheus Configuration

Add Invoice2E as a scrape target in `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: invoice2e
    scrape_interval: 15s
    metrics_path: /api/metrics
    static_configs:
      - targets: ["localhost:3000"]
        labels:
          app: invoice2e
          environment: production
```

### 3. Import Grafana Dashboards

1. Open Grafana → **Dashboards** → **Import**
2. Upload or paste JSON from:
   - `grafana/dashboards/invoice2e-overview.json` — Operational overview
   - `grafana/dashboards/invoice2e-business.json` — Business metrics
3. Select your Prometheus data source when prompted

### 4. Import Alert Rules

Copy `alerts/alert-rules.yaml` into your Prometheus `rule_files` directory:

```yaml
# prometheus.yml
rule_files:
  - /etc/prometheus/rules/alert-rules.yaml
```

Or import via Grafana Alerting (Grafana 9+):
1. **Alerting** → **Alert rules** → **Import**
2. Paste the YAML content

### 5. SLO Tracking

SLO definitions live in `slo/slo-definitions.yaml`. Compatible with:
- [Sloth](https://github.com/slok/sloth) — generates Prometheus recording rules
- [OpenSLO](https://openslo.com/) — vendor-neutral SLO spec
- Manual Grafana panels using the PromQL expressions provided

## Available Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `extraction_total` | Counter | `status`, `provider` | Invoice extraction attempts |
| `conversion_total` | Counter | `status`, `format` | Format conversion attempts |
| `credit_deduction_total` | Counter | — | Credit deductions applied |
| `batch_total` | Counter | — | Batch jobs created |
| `extraction_duration_seconds` | Histogram | — | Extraction duration |
| `conversion_duration_seconds` | Histogram | — | Conversion duration |
| `ai_provider_latency_seconds` | Histogram | `provider` | AI provider response time |
| `active_jobs` | Gauge | `queue` | Currently active jobs |
| `credit_balance_total` | Gauge | — | Aggregate credit balance |

Plus default Node.js metrics (CPU, memory, event loop lag, GC) via `prom-client`.

## Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| HighErrorRate | >5% errors for 5 min | critical |
| SlowExtractions | p95 >45 s for 10 min | warning |
| AIProviderDown | >95% failure for 5 min | critical |
| LowCreditBalance | <100 credits | warning |
| QueueBacklog | >100 jobs for 10 min | warning |
| HighMemoryUsage | >85% for 5 min | warning |

## SLOs

| SLO | Target | Budget |
|-----|--------|--------|
| Availability | 99.9% | 43.2 min/month |
| Extraction latency | p95 <30 s | — |
| Conversion latency | p95 <10 s | — |
| API response time | p95 <500 ms | — |

## File Structure

```
monitoring/
├── README.md                          ← You are here
├── alerts/
│   └── alert-rules.yaml               ← Prometheus alert rules
├── grafana/
│   └── dashboards/
│       ├── invoice2e-overview.json     ← Operational dashboard
│       └── invoice2e-business.json     ← Business metrics dashboard
└── slo/
    └── slo-definitions.yaml            ← SLO definitions + error budgets
```
