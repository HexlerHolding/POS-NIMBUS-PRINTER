const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();


// Attempt to require pdf-to-printer, but handle if not installed

let printer;
try {
  printer = require('pdf-to-printer');
} catch (error) {
  console.warn('pdf-to-printer module not found. Printing functionality will be limited.');
  printer = null;
}

const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

function formatCurrency(amount) {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0.00';

  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function generateKitchenReceiptHTML(receipt) {

  return `
  <!DOCTYPE html>
  <html>
  <head>
      <meta charset="utf-8">
      <title>Kitchen Receipt</title>
      <style>
          body {
              font-family: 'Courier New', monospace;
              font-size: 14px;
              width: 58mm;
              margin: -5px 0 0 0;
              padding: 8px 8px 8px 6px;
          }
          .header {
              text-align: center;
              margin-bottom: 10px;
          }
          .business-name {
              font-size: 16px;
              font-weight: bold;
              margin-bottom: 4px;
          }
          .divider {
              border-bottom: 1px dashed #000;
              margin: 8px 0;
              width: 100%;
          }
          .item-row {
              display: flex;
              justify-content: space-between;
              margin: 6px 0;
              font-weight: 600;
          }
          .left {
              text-align: left;
              flex: 1;
              letter-spacing: 0.1px;
              line-height: 1.2;
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
          .kitchen-title {
              font-size: 18px;
              font-weight: bold;
              text-align: center;
              margin: 12px 0;
              text-decoration: underline;
          }
      </style>
  </head>
  <body>
      <div class="kitchen-title">KITCHEN ORDER</div>
      
      <div class="divider"></div>
      
      <div class="item-row order-number">
          <span class="left bold">Order #: ${receipt.orderId || 'TEST-123'}</span>
      </div>
      
      <div class="item-row" style="margin-bottom: 10px;">
          <span class="left bold">Customer: ${receipt.customerName || 'Walk-in'}</span>
      </div>
      
      <div class="divider"></div>
      
      ${receipt.items ? receipt.items.map(item => `
          <div class="item-row">
              <span class="left"><strong style="min-width: 16px; display: inline-block; font-size: 16px;">${item.quantity}x</strong> ${item.name}</span>
          </div>
      `).join('') : ''}
      
      <div class="divider"></div>
      
      <div class="item-row" style="margin-top: 12px; font-size: 14px; font-weight: bold;">
          <span class="left">Date:</span>
          <span class="right">${receipt.date ? new Date(receipt.date).toLocaleString() : new Date().toLocaleString()}</span>
      </div>
      
      <!-- Padding for kitchen use -->
      <div style="line-height: 1;">
          <br><br><br><br>
      </div>
      
      <!-- Three small dots at the bottom center -->
      <div style="text-align: center;">
          <span style="font-size: 15px;">• • •</span>
      </div>
  </body>
  </html>
  `;
}

function generateReceiptHTML(receipt) {
  let logoBase64 = '';
  try {
    const logoPath = process.env.LOGO_PATH || path.join(__dirname, '..', 'logo.png');
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
              font-size: 14px;
              width: 72mm;
              margin: -5px 0 0 0;
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
              font-size: 16px;
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
              margin: 5px 0;
              font-weight: 600;
          }
          .left {
              text-align: left;
              flex: 1;
              letter-spacing: 0.2px;
              line-height: 1.2;
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
              font-size: 15px;
              margin: 6px 0;
              letter-spacing: 0.5px;
          }
          .total-row {
              font-size: 18px;
              font-weight: bold;
              margin: 8px 0;
              letter-spacing: 0.7px;
          }
      </style>
  </head>
  <body>
      <div class="logo">
          ${logoBase64 ? `<img src="${logoBase64}" alt="${receipt.businessName || process.env.BUSINESS_NAME || 'NIMBUS POS'} Logo">` :
      `<div style="font-size: 20px; font-weight: bold;">LOGO</div>`}
      </div>
      
      <div class="header">
          <div class="business-name">${receipt.businessName || process.env.BUSINESS_NAME || 'Pour Coffee'}</div>
          <div style="font-size: 15px;">${receipt.businessAddress || process.env.BUSINESS_ADDRESS || '123 Main Street'}</div>
          <div style="font-size: 15px;">${receipt.businessPhone || process.env.BUSINESS_PHONE || '(555) 123-4567'}</div>
      </div>

      <div style="text-align: center; font-size: 18px; font-weight: bold; margin: 12px 0; text-decoration: underline;">INVOICE</div>

      <div class="divider"></div>
      
      <div class="item-row" style="margin-bottom: 8px;">
          <span class="left bold">Cashier: ${receipt.cashierName || 'N/A'}</span>
      </div>
      
      <div class="item-row order-number">
          <span class="left bold">Order #: ${receipt.orderId || 'TEST-123'}</span>
      </div>
      
      <div class="item-row" style="margin-bottom: 8px;">
          <span class="left bold">Order Type: ${receipt.orderType || 'Dine-in'}</span>
      </div>
      
      <div class="item-row" style="margin-bottom: 8px;">
          <span class="left bold">Customer: ${receipt.customerName || 'Walk-in'}</span>
      </div>
      
      <div class="divider"></div>
      
      ${receipt.items ? receipt.items.map(item => `
          <div class="item-row">
              <span class="left"><strong style="min-width: 15px; display: inline-block;">${item.quantity}</strong> ${item.name}</span>
              <span class="right">&nbsp; Rs. ${formatCurrency(item.price)}</span>
          </div>
      `).join('') : ''}
      
      <div class="divider"></div>
      
      <div class="item-row summary-row">
          <span class="left bold">Subtotal</span>
          <span class="right bold">Rs. ${formatCurrency(receipt.subTotal)}</span>
      </div>
      
      <div class="item-row summary-row">
          <span class="left bold">Tax</span>
          <span class="right bold">Rs. ${formatCurrency(receipt.tax)}</span>
      </div>
      
      <div class="item-row summary-row">
          <span class="left bold">Discount</span>
          <span class="right bold">Rs. ${formatCurrency(receipt.discount)}</span>
      </div>
            <div class="divider"></div>

      <div class="item-row total-row">
          <span class="left">Grand Total</span>
          <span class="right">Rs. ${formatCurrency(receipt.grandTotal)}</span>
      </div>
            <div class="divider"></div>

      <div class="item-row" style="margin-top: 12px; font-size: 15px; font-weight: bold;justify-content: space-between;">
          <span class="left">Date:</span>
          <span class="right">${receipt.date ? new Date(receipt.date).toLocaleString() : new Date().toLocaleString()}</span>
      </div>
      
      <!-- 6-7 lines of padding after date -->
      <div style="line-height: 1;">
          <br><br><br><br>
      </div>
      
      <!-- Three small dots at the bottom center -->
      <div style="text-align: center;">
          <span style="font-size: 15px;">• Happy Purchasing! •</span>
      </div>
  </body>
  </html>
  `;
}

async function generateAndSaveKitchenPDF(receipt, outputPath) {
  const htmlContent = generateKitchenReceiptHTML(receipt);
  const htmlPath = path.join(tempDir, `kitchen-receipt-${Date.now()}.html`);

  fs.writeFileSync(htmlPath, htmlContent);
  console.log(`Kitchen HTML file saved to: ${htmlPath}`);

  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const baseHeight = 90; // Base height for kitchen receipt (smaller for 58mm)
    const itemHeight = 9; // Height per item for 58mm printer
    const bottomPadding = 25; // Extra padding for kitchen use
    const itemCount = receipt.items ? receipt.items.length : 2;
    const estimatedHeight = baseHeight + (itemCount * itemHeight) + bottomPadding;

    await page.pdf({
      path: outputPath,
      width: '58mm',
      height: `${estimatedHeight}mm`,
      margin: {
        top: '3mm',
        right: '2mm',
        bottom: '3mm',
        left: '4mm'
      },
      printBackground: true
    });

    await browser.close();
    console.log(`Kitchen PDF file saved to: ${outputPath}`);
    return true;
  } catch (error) {
    console.error('Error generating kitchen PDF:', error);
    return false;
  }
}

async function generateAndSavePDF(receipt, outputPath) {
  const htmlContent = generateReceiptHTML(receipt);
  const htmlPath = path.join(tempDir, `receipt-${Date.now()}.html`);

  fs.writeFileSync(htmlPath, htmlContent);
  console.log(`HTML file saved to: ${htmlPath}`);

  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const baseHeight = 130; // Increased for customer name line
    const itemHeight = 8;
    const bottomPadding = 20; // Additional padding for 6-7 lines + dots
    const itemCount = receipt.items ? receipt.items.length : 2;
    const estimatedHeight = baseHeight + (itemCount * itemHeight) + bottomPadding;

    await page.pdf({
      path: outputPath,
      width: '72mm',
      height: `${estimatedHeight}mm`,
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

async function printPDFToThermalPrinter(pdfPath, printerName = null, paperSize = 'A7') {
  try {
    // Use printerName from parameter, or fall back to environment variable
    const finalPrinterName = printerName || null;
    console.log(`Attempting to print PDF to ${finalPrinterName || 'default'} printer...`);

    if (printer) {
      console.log('Using pdf-to-printer module for printing...');

      const options = { printer: finalPrinterName, copies: 1, scale: 'noscale', paperSize, margin: '0' };
      console.log('Print options:', options);
      try {
        await printer.print(pdfPath, options);
        console.log('Print job sent successfully using pdf-to-printer');
        return 'Print job sent successfully';
      } catch (err) {
        console.error('Error printing with pdf-to-printer:', err);
        throw err;
      }
    } else {
      throw new Error('pdf-to-printer module not available');
    }
  } catch (error) {
    console.error('Failed to print PDF:', error);
    throw error;
  }
}

async function printOrderToThermalPrinters(receiptData) {
  try {
    const timestamp = Date.now();
    const customerOutputPath = path.join(__dirname, '..', 'temp', `customer-receipt-${timestamp}.pdf`);
    const kitchenOutputPath = path.join(__dirname, '..', 'temp', `kitchen-receipt-${timestamp}.pdf`);

    // Extract printer names from receipt data, fallback to env variables if not provided
    const cashierPrinterName = receiptData.cashierPrinterName || process.env.PRINTER_NAME;
    const kitchenPrinterName = receiptData.kitchenPrinterName || process.env.PRINTER2_NAME;

    console.log(`Using cashier printer: ${cashierPrinterName}`);
    console.log(`Using kitchen printer: ${kitchenPrinterName}`);
    console.log(`Request for completion: ${receiptData.requestForCompletion}`);

    // Check if this is a completion request (only print to cashier)
    const skipKitchenPrint = receiptData.requestForCompletion === true;
    
    // Generate PDFs - customer always, kitchen only if not completion request
    const pdfGenerationTasks = [generateAndSavePDF(receiptData, customerOutputPath)];
    if (!skipKitchenPrint) {
      pdfGenerationTasks.push(generateAndSaveKitchenPDF(receiptData, kitchenOutputPath));
    }
    
    const pdfResults = await Promise.all(pdfGenerationTasks);
    const customerPdfGenerated = pdfResults[0];
    const kitchenPdfGenerated = skipKitchenPrint ? true : pdfResults[1]; // Skip kitchen PDF if completion request

    if (!customerPdfGenerated || (!skipKitchenPrint && !kitchenPdfGenerated)) {
      throw new Error('Failed to generate PDF receipts');
    }

    // Prepare print jobs - customer always, kitchen only if not completion request
    const printJobs = [
      printPDFToThermalPrinter(customerOutputPath, cashierPrinterName),
      printPDFToThermalPrinter(customerOutputPath, cashierPrinterName)
    ];
    
    if (!skipKitchenPrint) {
      printJobs.push(printPDFToThermalPrinter(kitchenOutputPath, kitchenPrinterName, 'A8'));
    }

    // Run print jobs in parallel
    const printResults = await Promise.allSettled(printJobs);
    const customerResult = printResults[0];
    const customer2Result = printResults[1];
    const kitchenResult = skipKitchenPrint ? null : printResults[2];

    const results = {};

    // Process customer printer result
    if (customerResult.status === 'fulfilled') {
      results.customer = { success: true, message: customerResult.value };
      console.log('Customer receipt printed successfully');
    } else {
      results.customer = { success: false, error: customerResult.reason.message };
      console.error('Failed to print customer receipt:', customerResult.reason);
    }

    // Process customer printer copy 2 result
    if (customer2Result.status === 'fulfilled') {
      results.customer2 = { success: true, message: customer2Result.value };
      console.log('Customer receipt 2 printed successfully');
    } else {
      results.customer2 = { success: false, error: customer2Result.reason.message };
      console.error('Failed to print customer receipt 2:', customer2Result.reason);
    }

    // Process kitchen printer result only if not skipping
    if (skipKitchenPrint) {
      results.kitchen = { success: true, message: 'Kitchen printing skipped due to completion request' };
      console.log('Kitchen printing skipped - completion request');
    } else if (kitchenResult.status === 'fulfilled') {
      results.kitchen = { success: true, message: kitchenResult.value };
      console.log('Kitchen receipt printed successfully');
    } else {
      results.kitchen = { success: false, error: kitchenResult.reason.message };
      console.error('Failed to print kitchen receipt:', kitchenResult.reason);
    }

    return results;
  } catch (error) {
    console.error('Error in printOrderToThermalPrinters:', error);
    throw error;
  }
}

module.exports = {
  generateAndSavePDF,
  generateAndSaveKitchenPDF,
  printPDFToThermalPrinter,
  printOrderToThermalPrinters,
};