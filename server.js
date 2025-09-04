const express = require('express');
const cors = require('cors');
const { generateAndSavePDF, printPDFToThermalPrinter } = require('./services/pdfService');
const { validateReceiptData } = require('./middleware/validation');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

app.post('/api/print', validateReceiptData, async (req, res) => {
  try {
    const { receiptData, printerName } = req.body;
    const outputPath = path.join(__dirname, 'temp', `receipt-${Date.now()}.pdf`);
    
    const pdfGenerated = await generateAndSavePDF(receiptData, outputPath);
    
    if (!pdfGenerated) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate PDF'
      });
    }
    
    const printResult = await printPDFToThermalPrinter(outputPath, printerName);
    
    res.json({
      success: true,
      message: 'Print job sent successfully',
      result: printResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error printing receipt',
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