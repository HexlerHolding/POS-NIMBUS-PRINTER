const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logLevels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      CRITICAL: 4
    };

    this.currentLevel = this.logLevels.INFO;
    this.metricsEnabled = true;

    // Metrics tracking
    this.metrics = {
      totalPrintJobs: 0,
      successfulPrints: 0,
      failedPrints: 0,
      pdfGenerationFailures: 0,
      printerFailures: 0,
      browserRestarts: 0,
      lastResetTime: Date.now(),
      errorsByType: {}
    };

    // Create logs directory if it doesn't exist
    this.logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    // Start metrics reporting
    this.startMetricsReporting();
  }

  formatTimestamp() {
    return new Date().toISOString();
  }

  formatMessage(level, message, context = {}) {
    const timestamp = this.formatTimestamp();
    const contextStr = Object.keys(context).length > 0
      ? ` | ${JSON.stringify(context)}`
      : '';
    return `[${timestamp}] [${level}] ${message}${contextStr}`;
  }

  shouldLog(level) {
    return this.logLevels[level] >= this.currentLevel;
  }

  debug(message, context = {}) {
    if (this.shouldLog('DEBUG')) {
      console.log(this.formatMessage('DEBUG', message, context));
    }
  }

  info(message, context = {}) {
    if (this.shouldLog('INFO')) {
      console.log(this.formatMessage('INFO', message, context));
    }
  }

  warn(message, context = {}) {
    if (this.shouldLog('WARN')) {
      // Use console.log for warnings to avoid stderr pollution
      console.log(this.formatMessage('WARN', message, context));
    }
  }

  error(message, error = null, context = {}) {
    if (this.shouldLog('ERROR')) {
      const errorContext = {
        ...context,
        ...(error && {
          errorMessage: error.message,
          errorStack: error.stack,
          errorType: error.constructor.name
        })
      };

      // Only use console.error for actual errors that need attention
      console.error(this.formatMessage('ERROR', message, errorContext));

      // Track error types
      if (error && this.metricsEnabled) {
        const errorType = error.message || 'Unknown';
        this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
      }
    }
  }

  critical(message, error = null, context = {}) {
    const errorContext = {
      ...context,
      ...(error && {
        errorMessage: error.message,
        errorStack: error.stack,
        errorType: error.constructor.name
      })
    };

    console.error(this.formatMessage('CRITICAL', message, errorContext));

    // Write critical errors to separate file
    this.writeCriticalError(message, error, context);
  }

  writeCriticalError(message, error, context) {
    try {
      const logFile = path.join(this.logsDir, 'critical-errors.log');
      const logEntry = {
        timestamp: this.formatTimestamp(),
        message,
        error: error ? {
          message: error.message,
          stack: error.stack,
          type: error.constructor.name
        } : null,
        context
      };

      fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    } catch (err) {
      console.error('Failed to write critical error log:', err);
    }
  }

  // Metrics methods
  incrementPrintJob(success = true) {
    if (!this.metricsEnabled) return;

    this.metrics.totalPrintJobs++;
    if (success) {
      this.metrics.successfulPrints++;
    } else {
      this.metrics.failedPrints++;
    }
  }

  incrementPDFFailure() {
    if (!this.metricsEnabled) return;
    this.metrics.pdfGenerationFailures++;
  }

  incrementPrinterFailure() {
    if (!this.metricsEnabled) return;
    this.metrics.printerFailures++;
  }

  incrementBrowserRestart() {
    if (!this.metricsEnabled) return;
    this.metrics.browserRestarts++;
  }

  getMetrics() {
    const uptime = Date.now() - this.metrics.lastResetTime;
    const uptimeHours = (uptime / (1000 * 60 * 60)).toFixed(2);
    const successRate = this.metrics.totalPrintJobs > 0
      ? ((this.metrics.successfulPrints / this.metrics.totalPrintJobs) * 100).toFixed(2)
      : 'N/A';

    return {
      uptime: `${uptimeHours} hours`,
      totalPrintJobs: this.metrics.totalPrintJobs,
      successfulPrints: this.metrics.successfulPrints,
      failedPrints: this.metrics.failedPrints,
      successRate: `${successRate}%`,
      pdfGenerationFailures: this.metrics.pdfGenerationFailures,
      printerFailures: this.metrics.printerFailures,
      browserRestarts: this.metrics.browserRestarts,
      topErrors: this.getTopErrors(5)
    };
  }

  getTopErrors(limit = 5) {
    return Object.entries(this.metrics.errorsByType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([error, count]) => ({ error, count }));
  }

  resetMetrics() {
    this.metrics = {
      totalPrintJobs: 0,
      successfulPrints: 0,
      failedPrints: 0,
      pdfGenerationFailures: 0,
      printerFailures: 0,
      browserRestarts: 0,
      lastResetTime: Date.now(),
      errorsByType: {}
    };
    this.info('Metrics reset');
  }

  startMetricsReporting() {
    // Log metrics summary every hour
    setInterval(() => {
      const metrics = this.getMetrics();
      this.info('Hourly metrics report', metrics);
    }, 60 * 60 * 1000);

    // Log metrics summary every 15 minutes for debugging
    setInterval(() => {
      const metrics = this.getMetrics();
      if (metrics.totalPrintJobs > 0) {
        this.info('Metrics checkpoint', {
          jobs: metrics.totalPrintJobs,
          successRate: metrics.successRate,
          failures: metrics.failedPrints
        });
      }
    }, 15 * 60 * 1000);
  }

  setLevel(level) {
    if (this.logLevels[level] !== undefined) {
      this.currentLevel = this.logLevels[level];
      this.info(`Log level set to ${level}`);
    }
  }
}

// Export singleton instance
const logger = new Logger();

module.exports = logger;
