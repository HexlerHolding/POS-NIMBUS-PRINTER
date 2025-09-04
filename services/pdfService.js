const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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
      
      <div class="divider"></div>
      
      <div class="item-row order-number">
          <span class="left bold">Order #: ${receipt.orderId || 'TEST-123'}</span>
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

      <div class="item-row total-row">
          <span class="left">Grand Total</span>
          <span class="right">Rs. ${formatCurrency(receipt.total)}</span>
      </div>
            <div class="divider"></div>

      <div class="item-row" style="margin-top: 12px; font-size: 15px; font-weight: bold;justify-content: space-between;">
          <span class="left">Date:</span>
          <span class="right">${receipt.date ? new Date(receipt.date).toLocaleString() : new Date().toLocaleString()}</span>
      </div>
  </body>
  </html>
  `;
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

    const baseHeight = 120;
    const itemHeight = 8;
    const itemCount = receipt.items ? receipt.items.length : 2;
    const estimatedHeight = baseHeight + (itemCount * itemHeight);

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

async function printPDFToThermalPrinter(pdfPath, printerName = null) {
  try {
    console.log(`Attempting to print PDF to ${printerName || 'default'} printer...`);

    if (printer) {
      console.log('Using pdf-to-printer module for printing...');

      const options = printerName ? { printer: printerName, copies: 2 } : {};

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

module.exports = {
  generateAndSavePDF,
  printPDFToThermalPrinter,
};