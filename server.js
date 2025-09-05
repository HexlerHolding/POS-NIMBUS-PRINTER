const express = require('express');
const cors = require('cors');
const { generateAndSavePDF, printPDFToThermalPrinter, printOrderToThermalPrinters } = require('./services/pdfService');
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