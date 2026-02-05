# Operations & Maintenance Documentation
## Invoice2E - Production Operations

| Property | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-02-01 |
| **Support Contact** | ops@invoice2e.com |

---

## 1. Monitoring

### 1.1 Health Check

**Endpoint:** `GET /api/health`

```bash
curl https://invoice2e.com/api/health
```

**Expected Response:**
```json
{
    "status": "healthy",
    "timestamp": "2026-02-01T12:00:00Z",
    "version": "1.0.0"
}
```

### 1.2 Key Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Response Time | > 5s |
| Error Rate | > 1% |
| CPU Usage | > 80% |
| Memory Usage | > 85% |
| Database Connections | > 80% |

### 1.3 Vercel Dashboard

Access at: https://vercel.com/[team]/invoice2e

- Deployment status
- Function invocations
- Error logs
- Core Web Vitals

### 1.4 Supabase Dashboard

Access at: https://supabase.com/dashboard

- Database metrics
- Query performance
- Storage usage
- Auth events

---

## 2. Logging

### 2.1 Log Levels

| Level | When | Example |
|-------|------|---------|
| INFO | Normal operations | User login, conversion complete |
| WARN | Potential issues | Low credits, rate limit approaching |
| ERROR | Failures | API error, database failure |
| DEBUG | Development only | Request payload, internal state |

### 2.2 Log Format

```json
{
    "timestamp": "2026-02-01T12:00:00.000Z",
    "level": "ERROR",
    "message": "Extraction failed",
    "data": {
        "userId": "uuid",
        "error": "Timeout exceeded"
    }
}
```

### 2.3 Viewing Logs

**Vercel CLI:**
```bash
vercel logs invoice2e --follow
```

**Vercel Dashboard:**
Functions → Select function → View logs

---

## 3. Backups

### 3.1 Database Backups

| Schedule | Retention | Type |
|----------|-----------|------|
| Daily | 7 days | Point-in-time |
| Weekly | 30 days | Full backup |

**Supabase Automatic Backups:**
- Enabled by default on Pro tier
- Access via Dashboard → Database → Backups

### 3.2 Manual Backup

```bash
# Export using pg_dump
pg_dump -h [host] -U [user] -d [database] > backup.sql
```

### 3.3 Restore Procedure

1. Access Supabase Dashboard
2. Navigate to Database → Backups
3. Select backup point
4. Click "Restore"

---

## 4. Incident Response

### 4.1 Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| P1 | Service down | 15 minutes |
| P2 | Major feature broken | 1 hour |
| P3 | Minor bug | 4 hours |
| P4 | Enhancement | Next sprint |

### 4.2 Runbooks

#### AI Extraction Failures
1. Check Gemini/DeepSeek API status
2. Verify API key validity
3. Check credit balance
4. Review error logs
5. Escalate if persistent

#### Payment Failures
1. Check Stripe/PayPal status
2. Verify webhook signature
3. Check payment logs
4. Manual credit add if needed

#### Database Connection Issues
1. Check Supabase status
2. Verify connection pool
3. Check connection limits
4. Restart if needed

---

## 5. Performance Optimization

### 5.1 Current Benchmarks

| Operation | Target | Actual |
|-----------|--------|--------|
| AI Extraction | < 30s | ~15-25s |
| XML Generation | < 2s | ~500ms |
| Page Load (LCP) | < 2.5s | ~1.5s |
| API Response | < 500ms | ~200ms |

### 5.2 Optimization Checklist

- [ ] Enable CDN caching
- [ ] Optimize images
- [ ] Minimize bundle size
- [ ] Database query optimization
- [ ] Connection pooling

---

## 6. Security Procedures

### 6.1 Key Rotation

| Secret | Rotation | Procedure |
|--------|----------|-----------|
| API Keys | Quarterly | Generate new, update env, retire old |
| JWT Secret | Annually | Rolling update via Supabase |
| Webhook Secrets | On incident | Immediate rotation |

### 6.2 Vulnerability Response

1. Assess severity
2. Isolate if critical
3. Patch and deploy
4. Verify fix
5. Post-mortem

---

## 7. Maintenance Windows

### 7.1 Scheduled Maintenance

| Type | Schedule | Duration |
|------|----------|----------|
| Supabase updates | Monthly | 15 min |
| Dependency updates | Weekly | Deploy |
| Schema migrations | As needed | Variable |

### 7.2 Maintenance Notification

1. Notify users 24h before
2. Post status on status page
3. Execute during low-traffic
4. Confirm completion

---

## 8. Disaster Recovery

### 8.1 Recovery Objectives

| Metric | Target |
|--------|--------|
| RTO (Recovery Time) | 1 hour |
| RPO (Recovery Point) | 24 hours |

### 8.2 Recovery Steps

1. Identify failure scope
2. Restore from backup
3. Verify data integrity
4. Resume operations
5. Root cause analysis

---

## 9. Contact Information

| Role | Contact |
|------|---------|
| On-call Engineer | oncall@invoice2e.com |
| Technical Lead | tech@invoice2e.com |
| Security Team | security@invoice2e.com |

---

## Document References

| Document | Path |
|----------|------|
| Deployment | [01-deployment.md](./01-deployment.md) |
| Architecture | [02-architecture/01-software-architecture.md](../02-architecture/01-software-architecture.md) |
