import fs from 'fs';

/**
 * Load testing results analyzer
 * Processes k6 summary JSON and identifies bottlenecks
 */

export function analyzeResults(summaryFilePath) {
  if (!fs.existsSync(summaryFilePath)) {
    console.error(`Summary file not found: ${summaryFilePath}`);
    process.exit(1);
  }

  const summary = JSON.parse(fs.readFileSync(summaryFilePath, 'utf8'));
  const metrics = summary.metrics || {};

  const analysis = {
    timestamp: new Date().toISOString(),
    testDuration: summary.state?.testRunDurationMs || 0,
    thresholdViolations: [],
    bottlenecks: [],
    performanceSummary: {},
  };

  // Check for threshold violations
  if (summary.thresholds) {
    Object.entries(summary.thresholds).forEach(([threshold, result]) => {
      if (result.ok === false) {
        analysis.thresholdViolations.push({
          metric: threshold,
          status: result.ok ? 'PASS' : 'FAIL',
          summary: result.name,
        });
      }
    });
  }

  // Analyze key metrics for bottlenecks
  const keyMetrics = {
    http_req_duration: 'HTTP Request Duration',
    http_req_failed: 'Failed Requests',
    http_reqs: 'Total Requests',
    http_req_connecting: 'Connection Time',
    http_req_waiting: 'Waiting Time',
  };

  Object.entries(keyMetrics).forEach(([metricKey, metricName]) => {
    if (metrics[metricKey]) {
      const metric = metrics[metricKey];
      const values = metric.values || {};

      analysis.performanceSummary[metricName] = {
        min: values.min || 'N/A',
        max: values.max || 'N/A',
        avg: values.avg || 'N/A',
        p95: values['p(95)'] || 'N/A',
        p99: values['p(99)'] || 'N/A',
      };

      // Identify bottlenecks
      if (metricKey === 'http_req_duration' && values['p(99)'] > 2000) {
        analysis.bottlenecks.push({
          issue: 'High p99 response time',
          value: `${values['p(99)']}ms`,
          recommendation: 'Investigate database queries and backend optimizations',
        });
      }

      if (metricKey === 'http_req_failed' && (values.value || 0) > 0.01) {
        analysis.bottlenecks.push({
          issue: 'High failure rate',
          value: `${((values.value || 0) * 100).toFixed(2)}%`,
          recommendation: 'Review API error logs and increase error handling capacity',
        });
      }

      if (metricKey === 'http_req_connecting' && values['p(99)'] > 200) {
        analysis.bottlenecks.push({
          issue: 'Slow connection establishment',
          value: `${values['p(99)']}ms`,
          recommendation: 'Check network latency and connection pool settings',
        });
      }
    }
  });

  return analysis;
}

// CLI execution
if (process.argv[2]) {
  const analysis = analyzeResults(process.argv[2]);
  console.log(JSON.stringify(analysis, null, 2));
  fs.writeFileSync(
    process.argv[3] || 'load-test-analysis.json',
    JSON.stringify(analysis, null, 2)
  );
}

export default analyzeResults;
