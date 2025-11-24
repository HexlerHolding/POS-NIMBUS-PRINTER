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

function generateDayReportHTML(reportData) {
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

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return `
  <!DOCTYPE html>
  <html>
  <head>
      <meta charset="utf-8">
      <title>Day Report</title>
      <style>
          body {
              font-family: 'Courier New', monospace;
              font-size: 12px;
              width: 72mm;
              margin: -5px 0 0 0;
              padding: 10px 5px;
          }
          .logo {
              text-align: center;
              margin-bottom: 10px;
          }
          .logo img {
              max-width: 100px;
              height: auto;
          }
          .header {
              text-align: center;
              margin-bottom: 10px;
          }
          .business-name {
              font-size: 14px;
              font-weight: bold;
              margin-bottom: 5px;
          }
          .report-title {
              font-size: 16px;
              font-weight: bold;
              margin: 10px 0;
              text-decoration: underline;
          }
          .divider {
              border-bottom: 1px dashed #000;
              margin: 10px 0;
              width: 100%;
          }
          .info-row {
              display: flex;
              justify-content: space-between;
              margin: 4px 0;
              font-weight: 600;
              font-size: 11px;
          }
          .section-title {
              font-size: 13px;
              font-weight: bold;
              text-align: center;
              margin: 12px 0 8px 0;
              text-transform: uppercase;
          }
          .sales-row {
              display: flex;
              justify-content: space-between;
              margin: 3px 0;
              font-size: 11px;
          }
          .sales-label {
              font-weight: 600;
          }
          .sales-amount {
              font-weight: bold;
          }
          .total-row {
              display: flex;
              justify-content: space-between;
              margin: 5px 0;
              font-size: 12px;
              font-weight: bold;
              padding-top: 3px;
          }
          .center {
              text-align: center;
          }
          .bold {
              font-weight: bold;
          }
      </style>
  </head>
  <body>
      <div class="logo">
          ${logoBase64 ? `<img src="${logoBase64}" alt="Logo">` : `<div style="font-size: 16px; font-weight: bold;">LOGO</div>`}
      </div>
      
      <div class="header">
          <div class="business-name">${reportData.branchInfo?.branch_name || process.env.BUSINESS_NAME || 'Business Name'}</div>
          <div class="report-title">DAY REPORT</div>
      </div>

      <div class="divider"></div>
      
      <!-- Basic Info -->
      <div class="info-row">
          <span>Branch:</span>
          <span>${reportData.branchInfo?.branch_name || 'N/A'}</span>
      </div>
      
      <div class="info-row">
          <span>Cashier:</span>
          <span>${reportData.userInfo?.name || 'N/A'}</span>
      </div>
      
      <div class="info-row">
          <span>Day Opened:</span>
      </div>
      <div style="text-align: center; font-size: 10px; margin-bottom: 3px;">
          ${formatDateTime(reportData.branchInfo?.day_opened_at)}
      </div>
      
      <div class="info-row">
          <span>Day Closed:</span>
      </div>
      <div style="text-align: center; font-size: 10px; margin-bottom: 5px;">
          ${formatDateTime(reportData.branchInfo?.day_closed_at)}
      </div>

      <div class="divider"></div>

      <!-- Sales Details -->
      <div class="section-title">SALES DETAILS</div>

      <div class="sales-row">
          <span class="sales-label">Gross Sales:</span>
          <span class="sales-amount">Rs. ${formatCurrency(reportData.salesDetails?.grossSales || 0)}</span>
      </div>

      <div class="sales-row">
          <span class="sales-label">Discounts:</span>
          <span class="sales-amount">-Rs. ${formatCurrency(reportData.salesDetails?.totalDiscount || 0)}</span>
      </div>

      <div class="sales-row">
          <span class="sales-label">Net Sales:</span>
          <span class="sales-amount">Rs. ${formatCurrency(reportData.salesDetails?.netSales || 0)}</span>
      </div>

      <div class="sales-row">
          <span class="sales-label">Tax Amount:</span>
          <span class="sales-amount">Rs. ${formatCurrency(reportData.salesDetails?.taxAmount || 0)}</span>
      </div>

      <div class="sales-row">
          <span class="sales-label">Net Sales (Inc. Tax):</span>
          <span class="sales-amount">Rs. ${formatCurrency(reportData.salesDetails?.netSalesIncTax || 0)}</span>
      </div>

      <div class="sales-row">
          <span class="sales-label">Delivery Charges:</span>
          <span class="sales-amount">Rs. ${formatCurrency(reportData.salesDetails?.deliveryCharges || 0)}</span>
      </div>

      <div class="total-row">
          <span>Total Revenue:</span>
          <span>Rs. ${formatCurrency(reportData.salesDetails?.netSalesIncTax || 0)}</span>
      </div>

      <div class="divider"></div>

      <!-- Insights -->
      <div class="section-title">INSIGHTS</div>

      <div class="sales-row">
          <span class="sales-label">Total Orders:</span>
          <span class="sales-amount">${reportData.insights?.totalOrders || 0}</span>
      </div>

      <div class="sales-row">
          <span class="sales-label">Total Cancelled Orders:</span>
          <span class="sales-amount">${reportData.insights?.totalCancelledOrders || 0}</span>
      </div>

      <div class="divider"></div>

      <!-- Payment Wise Sales -->
      <div class="section-title">PAYMENT WISE SALES</div>
      
      ${reportData.paymentWiseSales?.map(payment => `
          <div class="sales-row">
              <span class="sales-label" style="text-transform: capitalize;">${payment.method}:</span>
              <span class="sales-amount">Rs. ${formatCurrency(payment.amount)} (${payment.percentage.toFixed(1)}%)</span>
          </div>
      `).join('') || '<div class="center" style="font-size: 10px; color: #666;">No payment data</div>'}

      <div class="divider"></div>

      <!-- Order Type Sales -->
      <div class="section-title">ORDER TYPE SALES</div>
      
      ${reportData.orderTypeSales?.map(orderType => `
          <div class="sales-row">
              <span class="sales-label" style="text-transform: capitalize;">${orderType.type}:</span>
              <span class="sales-amount">Rs. ${formatCurrency(orderType.amount)} (${orderType.percentage.toFixed(1)}%)</span>
          </div>
      `).join('') || '<div class="center" style="font-size: 10px; color: #666;">No order type data</div>'}

      <div class="divider"></div>

      <div class="center" style="font-size: 10px; margin: 10px 0;">
          Report generated on:<br>
          ${new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })}
      </div>

      <!-- Padding for thermal printer -->
      <div style="line-height: 1;">
          <br><br><br><br>
      </div>
      
      <!-- Three dots at the bottom center -->
      <div style="text-align: center;">
          <span style="font-size: 15px;">• • •</span>
      </div>
  </body>
  </html>
  `;
}

function generateKitchenReceiptHTML(receipt, isDuplicate = false) {

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
          .variation-item {
              margin: 3px 0;
              padding-left: 15px;
              font-size: 14px;
              font-weight: 600;
              color: #000;
          }
      </style>
  </head>
  <body>
      <div class="kitchen-title">KITCHEN ORDER</div>
      ${isDuplicate ? `<div style="text-align: center; font-size: 16px; font-weight: bold; color: #000; margin: 5px 0;">DUPLICATE</div>` : ''}
      
      <div class="divider"></div>
      
      <div class="item-row order-number">
          <span class="left bold">Order #: ${receipt.orderId || 'TEST-123'}</span>
      </div>

      <div class="item-row" style="margin-bottom: 8px;">
          <span class="left bold">Order Type: ${receipt.orderType || 'Dine-in'}</span>
      </div>

      <div class="item-row" style="margin-bottom: 10px;">
          <span class="left bold">Customer: ${receipt.customerName || 'Walk-in'}</span>
      </div>
      
      <div class="divider"></div>
      
      ${receipt.items ? receipt.items.map(item => `
          <div class="item-row">
              <span class="left"><strong style="min-width: 16px; display: inline-block; font-size: 17px;">${item.quantity}x</strong> ${item.name}</span>
          </div>
          ${item.variations && item.variations.length > 0 ? item.variations.map(variation => `
              <div class="variation-item">
                  ${variation.value}
              </div>
          `).join('') : ''}
      `).join('') : ''}
      
      <div class="divider"></div>
      
      <div class="item-row" style="margin-top: 12px; font-size: 14px; font-weight: bold;">
          <span class="left">Date:</span>
          <span class="right">${receipt.date ? new Date(receipt.date).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }) : new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })}</span>
      </div>
      
      ${receipt.instruction || receipt.comment ? `
      <div class="divider"></div>
      
      <div style="margin-top: 12px; font-size: 14px; font-weight: bold;">
          <div>INSTRUCTIONS:</div>
          <div style="margin-top: 4px; font-weight: normal; font-size: 13px; word-wrap: break-word;">
              ${receipt.instruction || receipt.comment}
          </div>
      </div>
      ` : ''}
      
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

  // Determine if this is a paid receipt
  const isPaid = receipt.isPaid === true;
  const receiptTitle = isPaid ? 'PAID' : 'INVOICE';

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
          .variation-item {
              display: flex;
              justify-content: space-between;
              margin: 3px 0;
              padding-left: 20px;
              font-size: 13px;
              font-weight: 600;
              color: #000;
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

      <div style="text-align: center; font-size: 18px; font-weight: bold; margin: 12px 0; text-decoration: underline;">${receiptTitle}</div>

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
          ${item.variations && item.variations.length > 0 ? item.variations.map(variation => `
              <div class="variation-item">
                  <span class="left">${variation.name}: ${variation.value}</span>
                  <span class="right">${variation.price ? 'Rs. ' + formatCurrency(variation.price) : ''}</span>
              </div>
          `).join('') : ''}
      `).join('') : ''}
      
      <div class="divider"></div>
      
      <div class="item-row summary-row">
          <span class="left bold">Subtotal</span>
          <span class="right bold">Rs. ${formatCurrency(receipt.subTotal)}</span>
      </div>
      
      <div class="item-row summary-row">
          <span class="left bold">Tax${receipt.taxPercentage ? `(${receipt.taxPercentage}%)` : ''}</span>
          <span class="right bold">Rs. ${formatCurrency(receipt.tax)}</span>
      </div>
      
      <div class="item-row summary-row">
          <span class="left bold">Discount</span>
          <span class="right bold">Rs. ${formatCurrency(receipt.discount)}</span>
      </div>

      ${receipt.orderType === 'delivery' && receipt.deliveryCharges > 0 ? `
      <div class="item-row summary-row">
          <span class="left bold">Delivery Charges</span>
          <span class="right bold">Rs. ${formatCurrency(receipt.deliveryCharges)}</span>
      </div>` : ''}

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

async function generateAndSaveKitchenPDF(receipt, outputPath, isDuplicate = false) {
  const htmlContent = generateKitchenReceiptHTML(receipt, isDuplicate);
  const htmlPath = path.join(tempDir, `kitchen-receipt-${Date.now()}.html`);
/**
 * Convert HTML content to PDF
 * @param {string} htmlContent - The HTML content to convert
 * @param {string} outputPath - The path to save the PDF
 * @param {object} options - PDF generation options
 * @param {string} options.width - Paper width (e.g., '72mm', '58mm')
 * @param {string} options.height - Paper height (e.g., '150mm', 'auto')
 * @param {object} options.margin - Margins { top, right, bottom, left }
 * @returns {Promise<boolean>} - Returns true if successful
 */
async function generatePDFFromHTML(htmlContent, outputPath, options = {}) {
  const htmlPath = path.join(tempDir, `temp-${Date.now()}.html`);

  try {
    // Save HTML file for debugging
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`HTML file saved to: ${htmlPath}`);

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // Default options
    const pdfOptions = {
      path: outputPath,
      width: options.width || '72mm',
      height: options.height || '150mm',
      margin: options.margin || {
        top: '5mm',
        right: '5mm',
        bottom: '5mm',
        left: '5mm'
      },
      printBackground: true
    };

    await page.pdf(pdfOptions);
    await browser.close();

    console.log(`PDF file saved to: ${outputPath}`);
    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    return false;
  } finally {
    // Clean up HTML file
    try {
      if (fs.existsSync(htmlPath)) {
        fs.unlinkSync(htmlPath);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up HTML file:', cleanupError);
    }
  }
}

/**
 * Print PDF to thermal printer
 * @param {string} pdfPath - Path to the PDF file
 * @param {string} printerName - Name of the printer
 * @param {string} paperSize - Paper size (e.g., 'A7', 'A8')
 * @returns {Promise<string>} - Returns success message
 */
async function printPDFToThermalPrinter(pdfPath, printerName = null, paperSize = 'A7') {
  try {
    const finalPrinterName = printerName || process.env.PRINTER_NAME || null;
    console.log(`Attempting to print PDF to ${finalPrinterName || 'default'} printer...`);

    if (printer) {
      console.log('Using pdf-to-printer module for printing...');

      const options = {
        printer: finalPrinterName,
        copies: 1,
        scale: 'noscale',
        paperSize,
        margin: '0'
      };

      console.log('Print options:', options);

      await printer.print(pdfPath, options);
      console.log('Print job sent successfully using pdf-to-printer');
      return 'Print job sent successfully';
    } else {
      throw new Error('pdf-to-printer module not available');
    }
  } catch (error) {
    console.error('Failed to print PDF:', error);
    throw error;
  }
}

async function generateAndSaveDayReportPDF(reportData, outputPath) {
  const htmlContent = generateDayReportHTML(reportData);
  const htmlPath = path.join(tempDir, `day-report-${Date.now()}.html`);

  fs.writeFileSync(htmlPath, htmlContent);
  console.log(`Day Report HTML file saved to: ${htmlPath}`);

  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // Calculate height based on content
    const baseHeight = 180; // Base height for day report header and footer
    const sectionHeight = 25; // Height per section
    const paymentItemHeight = 4; // Height per payment item
    const orderTypeItemHeight = 4; // Height per order type item
    const bottomPadding = 25; // Extra padding

    const paymentItems = reportData.paymentWiseSales?.length || 0;
    const orderTypeItems = reportData.orderTypeSales?.length || 0;
    const estimatedHeight = baseHeight + (6 * sectionHeight) + (paymentItems * paymentItemHeight) + (orderTypeItems * orderTypeItemHeight) + bottomPadding;

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
    console.log(`Day Report PDF file saved to: ${outputPath}`);
    return true;
  } catch (error) {
    console.error('Error generating Day Report PDF:', error);
    return false;
  }
}

async function printOrderToThermalPrinters(receiptData) {
/**
 * Complete print job: Convert HTML to PDF and print
 * @param {string} htmlContent - The HTML content to print
 * @param {string} printerName - Name of the printer
 * @param {object} pdfOptions - PDF generation options
 * @param {string} printPaperSize - Paper size for printing (e.g., 'A7', 'A8')
 * @returns {Promise<object>} - Returns result object with success status
 */
async function printHTML(htmlContent, printerName, pdfOptions = {}, printPaperSize = 'A7') {
  try {
    const timestamp = Date.now();
    const pdfPath = path.join(tempDir, `print-${timestamp}.pdf`);

    console.log(`Generating PDF for printer: ${printerName}`);

    // Generate PDF
    const pdfGenerated = await generatePDFFromHTML(htmlContent, pdfPath, pdfOptions);

    if (!pdfGenerated) {
      throw new Error('Failed to generate PDF');
    }

    // Print PDF
    console.log(`Sending to printer: ${printerName}`);
    const printResult = await printPDFToThermalPrinter(pdfPath, printerName, printPaperSize);

    // Clean up PDF file
    try {
      if (fs.existsSync(pdfPath)) {
        // fs.unlinkSync(pdfPath); // COMMENTED OUT FOR DEBUGGING
      }
    } catch (cleanupError) {
      console.error('Error cleaning up PDF file:', cleanupError);
    }

    console.log('Print job completed successfully');
    return {
      success: true,
      message: printResult
    };

  } catch (error) {
    console.error('Error in printHTML:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  generatePDFFromHTML,
  printPDFToThermalPrinter,
  printHTML
};
