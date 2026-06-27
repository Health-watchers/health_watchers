# Stellar Keypair Decryption Failure Runbook

## Alert
StellarKeypairDecryptionFailure: One or more Stellar keypair decryption failures detected

## Severity
🚨 Critical (Security)

## Description
The system failed to decrypt a Stellar keypair. This prevents transaction signing and could indicate:
- Corrupted encryption keys
- Compromised keypairs
- Data integrity issues
- Configuration problems

## Immediate Actions (1-2 minutes)

1. **Page Security Team Immediately**
   - Trigger high-priority security alert
   - Notify #security-alerts channel
   - Page CTO/Security Lead

2. **Collect Evidence**
   ```bash
   # Get recent error logs
   docker logs health-watchers-api-prod --since 15m > /tmp/api-logs.txt
   
   # Get Stellar service logs
   docker logs health-watchers-stellar-prod --since 15m > /tmp/stellar-logs.txt
   ```

3. **Check Service Status**
   ```bash
   curl http://stellar-service:3002/health
   ```

## Investigation (5-15 minutes)

### Determine Failure Type

1. **Check Error Messages**
   ```bash
   docker logs health-watchers-api-prod | grep -i "decryption\|crypto" | tail -20
   ```
   - Identify which keypair/transaction failed
   - Note timestamp of first failure

2. **Check Encryption Key Status**
   ```bash
   # Verify key file exists
   ls -la /path/to/encryption/keys/
   
   # Check file permissions
   stat /path/to/encryption/keys/*
   ```

3. **Verify Configuration**
   - Check FIELD_ENCRYPTION_KEY environment variable is set
   - Verify key hasn't been rotated recently
   - Check recent configuration changes

4. **Database Integrity Check**
   ```bash
   docker exec health-watchers-mongodb-prod mongosh
   > use health_watchers
   > db.keypairs.find().limit(5)
   ```
   - Look for recently modified keypairs
   - Check encryption field format

## Resolution Steps

### If Configuration Issue
1. Verify encryption key is correct
2. Restore from backup if needed
3. Restart services:
   ```bash
   docker restart health-watchers-api-prod health-watchers-stellar-prod
   ```

### If Data Corruption
1. **DO NOT** proceed without security review
2. Restore from backup:
   ```bash
   # Stop services
   docker-compose down
   
   # Restore MongoDB backup
   mongorestore --uri="mongodb://..." /backup/path
   
   # Restart services
   docker-compose up -d
   ```

### If Compromised Keypair Detected
1. **Immediately isolate the keypair**
2. **Revoke on Stellar network** if possible
3. **Audit all transactions** using that keypair
4. Create new keypair
5. Update configuration
6. Rotate related secrets in AWS Secrets Manager

## Escalation

- **Immediately**: Page security team
- **5 minutes**: Page CEO if payment functionality affected
- **10 minutes**: Begin incident response protocol
- **Post-incident**: Full security audit required

## Prevention & Hardening

1. **Monitor Key Access**
   - Enable CloudTrail logging for AWS Secrets Manager
   - Monitor key rotation events
   - Alert on unexpected access

2. **Backup Strategy**
   - Regular encrypted backups of keys
   - Test restore procedures monthly
   - Keep backups in secure location

3. **Access Controls**
   - Limit who can access encryption keys
   - Use IAM roles with least privilege
   - Audit key access logs regularly

## Post-Incident Checklist
- [ ] Root cause identified
- [ ] No customer funds at risk
- [ ] Security audit completed
- [ ] Keypairs verified/rotated
- [ ] Incident report filed
- [ ] Post-mortem scheduled
- [ ] Preventive measures implemented
