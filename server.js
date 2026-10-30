const express = require('express');
const cors = require('cors');
const { printHTML, printBatch } = require('./services/pdfService');
const browserPool = require('./services/browserPool');
const logger = require('./services/logger');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

// Handle preflight OPTIONS requests first
app.options('*', (req, res) => {
  // Set allowed origins
  const allowedOrigins = ['https://pos.nimbus360.org', 'http://localhost:3000', 'https://nimbus360.org'];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  res.status(204).end();
});

// Regular CORS for non-OPTIONS requests
app.use(cors({
  origin: ['https://pos.nimbus360.org', 'http://localhost:3000', 'https://nimbus360.org'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add middleware to handle private network requests from secure origins
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

app.use(express.json());

app.get('/api/health', (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  };
  logger.debug('Health check requested', healthData);
  res.json(healthData);
});

/**
 * Generic Print Endpoint
 * Accepts HTML content and printer configuration
 * POST /api/print
 * Body: {
 *   htmlContent: string,
 *   printerName: string,
 *   pdfOptions: { width, height, margin },
 *   paperSize: string (A7, A8, etc.)
 * }
 */
app.post('/api/print', async (req, res) => {
  try {
    const { htmlContent, printerName, pdfOptions, paperSize } = req.body;

    if (!htmlContent) {
      logger.warn('Print request rejected - missing HTML content');
      return res.status(400).json({
        success: false,
        message: 'HTML content is required'
      });
    }

    if (!printerName) {
      logger.warn('No printer name specified, using default system printer');
    }

    logger.info('Print request received', {
      printer: printerName || '(default)',
      paperSize: paperSize || 'A7'
    });

    const printResult = await printHTML(
      htmlContent,
      printerName,
      pdfOptions || {},
      paperSize || 'A7'
    );

    if (printResult.success) {
      res.json({
        success: true,
        message: printResult.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: printResult.error || 'Failed to print',
        errorType: printResult.errorType,
        errorDetails: printResult.errorDetails
      });
    }
  } catch (error) {
    logger.error('Unexpected error in print endpoint', error);
    res.status(500).json({
      success: false,
      message: 'Error processing print request',
      error: error.message
    });
  }
});

/**
 * Batch Print Endpoint
 * Accepts multiple print jobs and processes them in parallel
 * POST /api/print-batch
 * Body: {
 *   printJobs: [{
 *     htmlContent: string,
 *     jsonContent: string,
 *     printerName: string,
 *     pdfOptions: object,
 *     paperSize: string,
 *     type: string,
 *     useJSON: boolean
 *   }],
 *   useJSONGeneration: boolean
 * }
 */
app.post('/api/print-batch', async (req, res) => {
  try {
    const { printJobs, useJSONGeneration } = req.body;

    if (!printJobs || !Array.isArray(printJobs) || printJobs.length === 0) {
      logger.warn('Batch print request rejected - invalid printJobs array');
      return res.status(400).json({
        success: false,
        message: 'printJobs array is required'
      });
    }

    logger.info('Batch print request received', {
      jobCount: printJobs.length,
      useJSONGeneration
    });

    // Add useJSON flag to each job
    const jobsWithFlags = printJobs.map(job => ({
      ...job,
      useJSON: useJSONGeneration
    }));

    const result = await printBatch(jobsWithFlags);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error('Unexpected error in batch print endpoint', error);
    res.status(500).json({
      success: false,
      message: 'Error processing batch print request',
      error: error.message
    });
  }
});


/**
 * Test Print Endpoint
 * Prints a simple test receipt to verify printer connectivity
 * POST /api/test-print
 * Body: { printerName: string }
 */
app.post('/api/test-print', async (req, res) => {
  try {
    const { printerName } = req.body;

    const testHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: monospace; font-size: 12px; margin: 0; padding: 5mm; width: 62mm; }
  .center { text-align: center; }
  .line { border-top: 1px dashed #000; margin: 4px 0; }
  .bold { font-weight: bold; }
</style>
</head>
<body>
  <div class="center bold" style="font-size:16px;">*** TEST PRINT ***</div>
  <div class="line"></div>
  <div class="center">Nimbus Printer Service</div>
  <div class="center">Connection OK</div>
  <div class="line"></div>
  <div>Printer: ${printerName || 'Default'}</div>
  <div>Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' })} PKT</div>
  <div class="line"></div>
  <div class="center bold">*** END TEST ***</div>
</body>
</html>`;

    logger.info('Test print requested', { printer: printerName || '(default)' });

    const printResult = await printHTML(
      testHtml,
      printerName || null,
      { width: '72mm', height: '80mm', margin: { top: '3mm', right: '3mm', bottom: '3mm', left: '3mm' } },
      'A7'
    );

    if (printResult.success) {
      res.json({ success: true, message: 'Test print sent successfully' });
    } else {
      res.status(500).json({ success: false, message: printResult.error || 'Test print failed', errorType: printResult.errorType });
    }
  } catch (error) {
    logger.error('Unexpected error in test-print endpoint', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * List Printers Endpoint
 * Returns available printers on the system
 * GET /api/printers
 */
app.get('/api/printers', async (req, res) => {
  try {
    let printer;
    try {
      printer = require('pdf-to-printer');
    } catch (e) {
      return res.status(500).json({ success: false, message: 'pdf-to-printer not available' });
    }

    const printers = await printer.getPrinters();
    res.json({ success: true, printers });
  } catch (error) {
    logger.error('Error listing printers', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, async () => {
  logger.info(`====================================`);
  logger.info(`Nimbus Printer Microservice`);
  logger.info(`Running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);
  logger.info(`Metrics: http://localhost:${PORT}/api/metrics`);
  logger.info(`====================================`);

  // Initialize browser pool on startup
  logger.info('Initializing browser pool...');
  try {
    await browserPool.initialize();
    logger.info('Browser pool ready - service is operational');
  } catch (error) {
    logger.critical('Failed to initialize browser pool', error);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: gracefully shutting down');
  try {
    await browserPool.shutdown();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: gracefully shutting down');
  try {
    await browserPool.shutdown();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.critical('Uncaught exception - service may be unstable', error);
  // Don't exit immediately - let PM2 decide based on crash threshold
});

process.on('unhandledRejection', (reason, promise) => {
  logger.critical('Unhandled promise rejection', new Error(String(reason)), {
    promise: String(promise)
  });
});

module.exports = app;