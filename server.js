const express = require('express');
const cors = require('cors');
const { printHTML, printBatch } = require('./services/pdfService');
const browserPool = require('./services/browserPool');
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
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
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
      return res.status(400).json({
        success: false,
        message: 'HTML content is required'
      });
    }

    if (!printerName) {
      return res.status(400).json({
        success: false,
        message: 'Printer name is required'
      });
    }

    console.log(`Print request received for printer: ${pdfOptions}`);
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
        message: printResult.error || 'Failed to print'
      });
    }
  } catch (error) {
    console.error('Error in print endpoint:', error);
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
      return res.status(400).json({
        success: false,
        message: 'printJobs array is required'
      });
    }

    console.log(`Batch print request received with ${printJobs.length} jobs`);

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
    console.error('Error in batch print endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing batch print request',
      error: error.message
    });
  }
});


app.listen(PORT, async () => {
  console.log(`====================================`);
  console.log(`Nimbus Printer Microservice`);
  console.log(`Running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`====================================`);

  // Initialize browser pool on startup
  console.log('Initializing browser pool...');
  await browserPool.initialize();
  console.log('Browser pool ready');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await browserPool.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await browserPool.shutdown();
  process.exit(0);
});

module.exports = app;