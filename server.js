const express = require('express');
const cors = require('cors');
const { generateAndSavePDF, generateAndSaveDayReportPDF, printPDFToThermalPrinter, printOrderToThermalPrinters, printDayReportToThermalPrinter } = require('./services/pdfService');
const { validateReceiptData } = require('./middleware/validation');
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


app.post('/api/print', validateReceiptData, async (req, res) => {
  try {
    const { receiptData } = req.body;
    
    const printResults = await printOrderToThermalPrinters(receiptData);
    
    const customerSuccess = printResults.customer && printResults.customer.success;
    const kitchenSuccess = printResults.kitchen && printResults.kitchen.success;
    
    res.json({
      success: customerSuccess || kitchenSuccess, // Success if at least one printer worked
      message: 'Order print job completed',
      results: {
        customer: printResults.customer,
        kitchen: printResults.kitchen
      },
      summary: {
        customerPrinted: customerSuccess,
        kitchenPrinted: kitchenSuccess,
        totalPrinted: (customerSuccess ? 1 : 0) + (kitchenSuccess ? 1 : 0)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error printing order receipts',
      error: error.message
    });
  }
});

// Print Day Report Route
app.post('/api/print-day-report', async (req, res) => {
  try {
    const { reportData, printerName } = req.body;
    
    if (!reportData) {
      return res.status(400).json({
        success: false,
        message: 'Report data is required'
      });
    }

    console.log('Printing day report to thermal printer...');
    const printResult = await printDayReportToThermalPrinter(reportData, printerName);
    
    if (printResult.success) {
      res.json({
        success: true,
        message: printResult.message,
        pdfPath: printResult.pdfPath
      });
    } else {
      res.status(500).json({
        success: false,
        message: printResult.error || 'Failed to print day report'
      });
    }
  } catch (error) {
    console.error('Error printing day report:', error);
    res.status(500).json({
      success: false,
      message: 'Error printing day report',
      error: error.message
    });
  }
});

// Download generated PDF files
app.get('/api/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'temp', filename);
    
    if (!require('fs').existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file',
      error: error.message
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});


app.listen(PORT, () => {
  console.log(`Nimbus PDF Printer Service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Status: http://localhost:${PORT}/api/status`);
});

module.exports = app;