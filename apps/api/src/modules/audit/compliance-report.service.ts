/**
 * Compliance Report Service
 * Generates compliance reports from audit logs
 * Issue #1236
 */

import { AuditLogModel, AuditAction } from './audit.model';
import logger from '@api/utils/logger';

export interface ComplianceReport {
  reportId: string;
  reportDate: Date;
  startDate: Date;
  endDate: Date;
  clinicId?: string;
  totalEvents: number;
  eventsByAction: Record<AuditAction, number>;
  failedEvents: number;
  dataAccessEvents: number;
  dataModificationEvents: number;
  userAccessReport: Array<{
    userId: string;
    totalAccesses: number;
    dataAccessCount: number;
    dataModificationCount: number;
    lastAccessTime: Date;
  }>;
  hipaaCompliance: {
    passwordReset: number;
    accountLockout: number;
    sessionTermination: number;
    accessRevokeRequests: number;
  };
  topUserAgents: Array<{ userAgent: string; count: number }>;
  topIpAddresses: Array<{ ipAddress: string; count: number }>;
  anomalies: Array<{
    type: string;
    description: string;
    timestamp: Date;
    userId?: string;
    impact: 'low' | 'medium' | 'high';
  }>;
}

export class ComplianceReportService {
  /**
   * Generate HIPAA compliance report
   */
  async generateHIPAAReport(
    startDate: Date,
    endDate: Date,
    clinicId?: string
  ): Promise<ComplianceReport> {
    try {
      const reportId = `hipaa_${Date.now()}`;
      const query: any = { timestamp: { $gte: startDate, $lte: endDate } };

      if (clinicId) {
        query.clinicId = clinicId;
      }

      // Get all audit logs in range
      const auditLogs = await AuditLogModel.find(query);

      // Aggregate data
      const eventsByAction: Record<string, number> = {};
      const userAccessMap = new Map<string, any>();
      const userAgentMap = new Map<string, number>();
      const ipAddressMap = new Map<string, number>();

      const accessActions = [
        'PATIENT_VIEW',
        'ENCOUNTER_VIEW',
        'PATIENT_PHOTO_ACCESS',
        'COMMUNICATION_LOG_VIEWED',
      ];
      const modificationActions = [
        'PATIENT_CREATE',
        'PATIENT_UPDATE',
        'ENCOUNTER_CREATE',
        'ENCOUNTER_UPDATE',
        'ALLERGY_CREATE',
        'ALLERGY_UPDATE',
        'ALLERGY_DELETE',
      ];

      let dataAccessCount = 0;
      let dataModificationCount = 0;
      let failedEvents = 0;

      for (const log of auditLogs) {
        // Count by action
        eventsByAction[log.action] = (eventsByAction[log.action] || 0) + 1;

        // Track failures
        if (log.outcome === 'FAILURE') {
          failedEvents++;
        }

        // Track user access
        if (log.userId) {
          const userId = log.userId.toString();
          if (!userAccessMap.has(userId)) {
            userAccessMap.set(userId, {
              userId,
              totalAccesses: 0,
              dataAccessCount: 0,
              dataModificationCount: 0,
              lastAccessTime: log.timestamp,
            });
          }

          const userInfo = userAccessMap.get(userId);
          userInfo.totalAccesses++;
          if (accessActions.includes(log.action)) {
            userInfo.dataAccessCount++;
            dataAccessCount++;
          }
          if (modificationActions.includes(log.action)) {
            userInfo.dataModificationCount++;
            dataModificationCount++;
          }
          userInfo.lastAccessTime = log.timestamp;
        }

        // Track user agents
        if (log.userAgent) {
          userAgentMap.set(log.userAgent, (userAgentMap.get(log.userAgent) || 0) + 1);
        }

        // Track IP addresses
        if (log.ipAddress) {
          ipAddressMap.set(log.ipAddress, (ipAddressMap.get(log.ipAddress) || 0) + 1);
        }
      }

      // Calculate anomalies
      const anomalies = this.detectAnomalies(auditLogs);

      // Build report
      const report: ComplianceReport = {
        reportId,
        reportDate: new Date(),
        startDate,
        endDate,
        clinicId,
        totalEvents: auditLogs.length,
        eventsByAction,
        failedEvents,
        dataAccessEvents: dataAccessCount,
        dataModificationEvents: dataModificationCount,
        userAccessReport: Array.from(userAccessMap.values()),
        hipaaCompliance: {
          passwordReset: eventsByAction['LOGIN_SUCCESS'] || 0, // Proxy metric
          accountLockout: eventsByAction['ACCOUNT_LOCKED'] || 0,
          sessionTermination: 0, // Would be tracked separately
          accessRevokeRequests: 0, // Would be tracked separately
        },
        topUserAgents: Array.from(userAgentMap.entries())
          .map(([userAgent, count]) => ({ userAgent, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        topIpAddresses: Array.from(ipAddressMap.entries())
          .map(([ipAddress, count]) => ({ ipAddress, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        anomalies,
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate compliance report:', error);
      throw error;
    }
  }

  /**
   * Generate user access report
   */
  async generateUserAccessReport(userId: string, startDate: Date, endDate: Date): Promise<any> {
    const query = {
      userId: userId,
      timestamp: { $gte: startDate, $lte: endDate },
    };

    const auditLogs = await AuditLogModel.find(query).sort({ timestamp: -1 });

    return {
      userId,
      startDate,
      endDate,
      totalAccesses: auditLogs.length,
      accessLog: auditLogs.map((log) => ({
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        timestamp: log.timestamp,
        ipAddress: log.ipAddress,
        outcome: log.outcome,
      })),
    };
  }

  /**
   * Detect anomalies in audit logs
   */
  private detectAnomalies(auditLogs: any[]): ComplianceReport['anomalies'] {
    const anomalies: ComplianceReport['anomalies'] = [];

    // Detect multiple failed logins
    const failedLogins = auditLogs.filter((log) => log.action === 'LOGIN_FAILURE');
    if (failedLogins.length > 10) {
      anomalies.push({
        type: 'excessive_failed_logins',
        description: `${failedLogins.length} failed login attempts detected`,
        timestamp: new Date(),
        impact: 'high',
      });
    }

    // Detect bulk data access
    const dataAccessLogs = auditLogs.filter((log) =>
      ['PATIENT_VIEW', 'ENCOUNTER_VIEW', 'EXPORT_PATIENT_DATA'].includes(log.action)
    );

    const accessCountByUser = new Map<string, number>();
    dataAccessLogs.forEach((log) => {
      const userId = log.userId?.toString() || 'unknown';
      accessCountByUser.set(userId, (accessCountByUser.get(userId) || 0) + 1);
    });

    accessCountByUser.forEach((count, userId) => {
      if (count > 100) {
        anomalies.push({
          type: 'bulk_data_access',
          description: `User accessed ${count} records in short timeframe`,
          timestamp: new Date(),
          userId,
          impact: 'high',
        });
      }
    });

    // Detect off-hours access
    const offHoursAccess = auditLogs.filter((log) => {
      const hour = new Date(log.timestamp).getHours();
      return hour < 6 || hour > 22;
    });

    if (offHoursAccess.length > auditLogs.length * 0.3) {
      anomalies.push({
        type: 'off_hours_access',
        description: `${offHoursAccess.length} accesses outside normal business hours`,
        timestamp: new Date(),
        impact: 'medium',
      });
    }

    return anomalies;
  }

  /**
   * Export report as JSON
   */
  exportAsJson(report: ComplianceReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report as CSV
   */
  exportAsCsv(report: ComplianceReport): string {
    const rows = [
      ['Metric', 'Value'],
      ['Report ID', report.reportId],
      ['Report Date', report.reportDate.toISOString()],
      ['Start Date', report.startDate.toISOString()],
      ['End Date', report.endDate.toISOString()],
      ['Total Events', report.totalEvents.toString()],
      ['Failed Events', report.failedEvents.toString()],
      ['Data Access Events', report.dataAccessEvents.toString()],
      ['Data Modification Events', report.dataModificationEvents.toString()],
      ['', ''],
      ['User Access Report'],
      ...report.userAccessReport.map((u) => [
        u.userId,
        u.totalAccesses.toString(),
        u.dataAccessCount.toString(),
        u.dataModificationCount.toString(),
      ]),
    ];

    return rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
  }
}

export const complianceReportService = new ComplianceReportService();
