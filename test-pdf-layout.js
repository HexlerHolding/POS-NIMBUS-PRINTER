const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// NOTE: For pdf-to-printer to work, install with:
// npm install pdf-to-printer --save
//
// This is a pure JavaScript library that doesn't require build tools
// like node-printer does

let printer;
try {
  printer = require('pdf-to-printer');
} catch (error) {
  console.warn('pdf-to-printer module not found. Printing functionality will be limited.');
  printer = null;
}
// Configuration
const outputDir = path.join(__dirname, 'test-output');

// Create output directory if it doesn't exist - only need one receipt.pdf file now
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Sample receipt data - modify as needed to test different layouts
const sampleReceipt = {
  businessName: 'Pour Coffee',
  businessAddress: '123 Main Street',
  businessPhone: '(555) 123-4567',
  orderId: 'TEST-123',
  customerName: 'John Smith',
  date: new Date(),
  cashier: 'John Doe',
  items: [
    { name: 'Hamburger', quantity: 2, price: 500.99 },
    { name: 'French Fries', quantity: 1, price: 2.99 },
    { name: 'Soda (Large)', quantity: 3, price: 1.99 },
    { name: 'Apple Pie', quantity: 1, price: 3.49 },
    { name: 'Coffee with extra long name', quantity: 1, price: 233.50 }
  ],
  subtotal: 1600.45,
  tax: 1.65,
  total: 18000.10,
  paymentMethod: 'Credit Card'
};

// Function to format currency with commas
function formatCurrency(amount) {
  // Convert to number to ensure we're working with a number
  const num = parseFloat(amount);
  // Check if it's a valid number
  if (isNaN(num)) return '0.00';

  // Format with commas and 2 decimal places
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Function to generate HTML for the receipt
function generateReceiptHTML(receipt) {
  // Read the logo file and convert to base64
  let logoBase64 = '';
  try {
    const logoPath = path.join(__dirname, 'logo.png');
    if (fs.existsSync(logoPath)) {
      const logoFile = fs.readFileSync(logoPath);
      logoBase64 = `data:image/png;base64,${logoFile.toString('base64')}`;
    }
  } catch (error) {
    console.error('Error loading logo:', error);
  }

  return `
  <!DOCTYPE html>
  <html>
  <head>
      <meta charset="utf-8">
      <title>Receipt</title>
      <style>
          body {
              font-family: 'Courier New', monospace;
              font-size: 14px; /* Increased from 12px */
              width: 72mm; /* Width for 80mm thermal paper */
              margin: 0;
              padding: 10px 5px;
          }
          .logo {
              text-align: center;
              margin-bottom: 20px;
          }
          .logo img {
              max-width: 150px;
              height: auto;
          }
          .header {
              text-align: center;
              margin-bottom: 10px;
          }
          .business-name {
              font-size: 16px; /* Increased from 14px */
              font-weight: bold;
              margin-bottom: 5px;
          }
          .divider {
              border-bottom: 1px dashed #000;
              margin: 10px 0;
              width: 100%;
          }
          .item-row {
              display: flex;
              justify-content: space-between;
              margin: 5px 0; /* Increased from 3px */
              font-weight: 600; /* Make all text slightly bolder */
          }
          .left {
              text-align: left;
              flex: 1; /* Allow left side to take available space */
              letter-spacing: 0.2px; /* Slightly increased letter spacing for readability */
              line-height: 1.2; /* Slightly increased line height for better readability */
          }
          .right {
              text-align: right;
            }
          .center {
              text-align: center;
          }
          .bold {
              font-weight: bold;
          }
          .order-number {
              font-size: 16px;
              margin-bottom: 8px;
          }
          .summary-row {
              font-size: 15px; /* Slightly larger than regular text */
              margin: 6px 0; /* More spacing for summary items */
              letter-spacing: 0.5px; /* Better readability */
          }
          .total-row {
              font-size: 18px; /* Increased from 16px for better visibility */
              font-weight: bold;
              margin: 8px 0; /* More space around the total */
              letter-spacing: 0.7px; /* Even better readability for total */
          }
      </style>
  </head>
  <body>
      <!-- Logo -->
      <div class="logo">
          ${logoBase64 ? `<img src="${logoBase64}" alt="${receipt.businessName || 'NIMBUS POS'} Logo">` :
      `<div style="font-size: 20px; font-weight: bold;">LOGO</div>`}
      </div>
      
      <div class="header">
          <div class="business-name">${receipt.businessName || 'Pour Coffee'}</div>
          <div style="font-size: 15px;">${receipt.businessAddress || '123 Main Street'}</div>
          <div style="font-size: 15px;">${receipt.businessPhone || '(555) 123-4567'}</div>
      </div>
      
      <div class="divider"></div>
      
      <div class="item-row order-number">
          <span class="left bold">Order #: ${receipt.orderId || 'TEST-123'}</span>
      </div>
      
      <div class="divider"></div>
      
      <!-- Items -->
      ${receipt.items ? receipt.items.map(item => `
          <div class="item-row">
              <span class="left"><strong style="min-width: 15px; display: inline-block;">${item.quantity}</strong> ${item.name}</span>
              <span class="right">&nbsp; Rs. ${formatCurrency(item.price)}</span>
          </div>
      `).join('') : null}
      
      <div class="divider"></div>
      
      <!-- Summary -->
      <div class="item-row summary-row">
          <span class="left bold">Subtotal</span>
          <span class="right bold">Rs. ${formatCurrency(receipt.subtotal)}</span>
      </div>
      
      <div class="item-row summary-row">
          <span class="left bold">Tax</span>
          <span class="right bold">Rs. ${formatCurrency(receipt.tax)}</span>
      </div>
      
      <div class="item-row summary-row">
          <span class="left bold">Total Tax</span>
          <span class="right bold">Rs. ${formatCurrency(receipt.tax)}</span>
      </div>
            <div class="divider"></div>

      <!-- Grand Total -->
      <div class="item-row total-row">
          <span class="left">Grand Total</span>
          <span class="right">Rs. ${formatCurrency(receipt.total)}</span>
      </div>
            <div class="divider"></div>

      <!-- Date/Time -->
      <div class="item-row" style="margin-top: 12px; font-size: 15px; font-weight: bold;justify-content: space-between;">
          <span class="left">Date:</span>
          <span class="right">${receipt.date ? new Date(receipt.date).toLocaleString() : new Date().toLocaleString()}</span>
      </div>
  </body>
  </html>
  `;
}

async function generateAndSavePDF(receipt, outputPath) {
  // Generate HTML content
  const htmlContent = generateReceiptHTML(receipt);
  const htmlPath = path.join(outputDir, 'receipt.html');

  // Save HTML file for reference
  fs.writeFileSync(htmlPath, htmlContent);
  console.log(`HTML file saved to: ${htmlPath}`);

  try {
    // Launch browser and convert HTML to PDF
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    // Load HTML content directly
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // Calculate a reasonable height based on content
    // Base height for header, footer and fixed elements
    const baseHeight = 120; // in mm, includes headers, business info, totals, footers
    // Additional height per item (approximate)
    const itemHeight = 8; // in mm per item
    // Calculate total height based on number of items
    const itemCount = receipt.items ? receipt.items.length : 2; // default to 2 if no items
    const estimatedHeight = baseHeight + (itemCount * itemHeight);

    // Generate PDF with calculated height for 80mm printer
    await page.pdf({
      path: outputPath,
      width: '72mm', // 80mm thermal receipt width
      height: `${estimatedHeight}mm`, // Dynamic height based on content
      margin: {
        top: '5mm',
        right: '5mm',
        bottom: '5mm',
        left: '5mm'
      },
      printBackground: true
    });

    await browser.close();
    console.log(`PDF file saved to: ${outputPath}`);
    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    return false;
  }
}

// Function to print a PDF file to a thermal printer
async function printPDFToThermalPrinter(pdfPath, printerName = null) {
  try {
    console.log(`Attempting to print PDF to ${printerName || 'default'} printer...`);

    // First try pdf-to-printer if available (recommended approach)
    if (printer) {
      console.log('Using pdf-to-printer module for printing...');

      // Create options object if printer name is provided
      const options = printerName ? { printer: printerName, copies: 2 } : {};

      try {
        // Use the pdf-to-printer library
        await printer.print(pdfPath, options);
        console.log('Print job sent successfully using pdf-to-printer');
        return 'Print job sent successfully';
      } catch (err) {
        console.error('Error printing with pdf-to-printer:', err);
      }
    }

  } catch (error) {
    console.error('Failed to print PDF:', error);
    throw error;
  }
}


// Test kitchen printer functionality
async function testKitchenPrinter() {
  console.log('\n---- Testing Kitchen Printer ----');
  
  const { generateAndSaveKitchenPDF } = require('./services/pdfService');
  
  try {
    const kitchenPdfPath = path.join(outputDir, 'kitchen-receipt.pdf');
    const success = await generateAndSaveKitchenPDF(sampleReceipt, kitchenPdfPath);
    
    if (success) {
      console.log('Kitchen receipt PDF generated successfully');
      
      // Try printing to kitchen printer
      try {
        console.log('Printing to kitchen printer (POS-58)...');
        await printPDFToThermalPrinter(kitchenPdfPath, 'POS-58');
        console.log('Kitchen receipt printed successfully!');
      } catch (printError) {
        console.error('Kitchen printing failed:', printError);
      }
    }
  } catch (error) {
    console.error('Error testing kitchen printer:', error);
  }
}

// Test dual printer functionality
async function testDualPrinters() {
  console.log('\n---- Testing Dual Printer System ----');
  
  const { printOrderToThermalPrinters } = require('./services/pdfService');
  
  try {
    const results = await printOrderToThermalPrinters(sampleReceipt);
    console.log('Dual printer results:', JSON.stringify(results, null, 2));
    
    if (results.customer && results.customer.success) {
      console.log('✓ Customer receipt printed successfully');
    } else {
      console.log('✗ Customer receipt failed');
    }
    
    if (results.kitchen && results.kitchen.success) {
      console.log('✓ Kitchen receipt printed successfully');
    } else {
      console.log('✗ Kitchen receipt failed');
    }
    
  } catch (error) {
    console.error('Error testing dual printers:', error);
  }
}

// Main function to run tests
async function runTests() {
  console.log('---- Receipt PDF Generator Test ----');

  try {
    // Generate standard receipt PDF for 80mm printer
    console.log('\nGenerating receipt PDF for 80mm printer...');
    const receiptPdfPath = path.join(outputDir, 'receipt.pdf');
    await generateAndSavePDF(sampleReceipt, receiptPdfPath);

    // Test kitchen printer
    await testKitchenPrinter();
    
    // Test dual printer system
    await testDualPrinters();

    // Test printing the receipt PDF to the thermal printer
    console.log('\nTesting print to main thermal printer...');

    try {
      // List available printers first
      console.log('Listing available printers...');

      console.log('Found printers! Select your thermal printer from the list above.');

      // Replace with your thermal printer's exact name
      // You can leave it null to use the default printer
      const thermalPrinterName = 'BlackCop'; // Example: "EPSON TM-T20II Receipt"

      // Print the PDF to the thermal printer
      console.log(`Sending PDF to ${thermalPrinterName || 'default'} printer...`);
      await printPDFToThermalPrinter(receiptPdfPath, thermalPrinterName);

      console.log('Print job sent! Check your printer for output.');

    } catch (printError) {
      console.error('Printing failed:', printError);
      console.log('Check that your printer is connected and properly configured');
    }

  } catch (error) {
    console.error('Error running tests:', error);
  }
}

// Export functions for use in other modules
module.exports = {
  generateAndSavePDF,
  printPDFToThermalPrinter,
};

// Run the tests if this file is executed directly
if (require.main === module) {
  runTests();
}