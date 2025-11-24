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
