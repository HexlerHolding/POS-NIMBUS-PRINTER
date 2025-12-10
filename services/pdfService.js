const fs = require('fs');
const path = require('path');
const browserPool = require('./browserPool');
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
  let page = null;

  try {
    // Save HTML file for debugging
    fs.writeFileSync(htmlPath, htmlContent);

    const browser = await browserPool.getBrowser();
    page = await browser.newPage();

    // Optimized: use 'load' instead of 'networkidle0' for faster processing
    await page.setContent(htmlContent, { waitUntil: 'load' });

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

    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    return false;
  } finally {
    // Close the page (not the browser)
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error('Error closing page:', closeError);
      }
    }

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

      const options = {
        printer: finalPrinterName,
        copies: 1,
        scale: 'noscale',
        paperSize,
        margin: '0'
      };


      await printer.print(pdfPath, options);
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
    const printResult = await printPDFToThermalPrinter(pdfPath, printerName, printPaperSize);

    // Clean up PDF file
    try {
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath); // COMMENTED OUT FOR DEBUGGING
      }
    } catch (cleanupError) {
      console.error('Error cleaning up PDF file:', cleanupError);
    }

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

/**
 * Batch print multiple receipts in parallel
 * @param {Array} printJobs - Array of print job objects
 * @returns {Promise<object>} - Returns results for each job
 */
async function printBatch(printJobs) {
  try {
    console.log(`Processing batch of ${printJobs.length} print jobs...`);

    // Process all jobs in parallel
    const results = await Promise.allSettled(
      printJobs.map(async (job, index) => {
        try {
          const { htmlContent, jsonContent, printerName, pdfOptions, paperSize, type, useJSON } = job;

          // Use JSON or HTML content based on flag
          const content = useJSON ? jsonContent : htmlContent;

          if (!content || !printerName) {
            throw new Error(`Invalid job ${index}: missing content or printer name`);
          }

          const result = await printHTML(content, printerName, pdfOptions, paperSize);

          return {
            type,
            ...result
          };
        } catch (error) {
          return {
            type: job.type,
            success: false,
            error: error.message
          };
        }
      })
    );

    // Format results
    const formattedResults = {};
    results.forEach((result, index) => {
      const jobType = printJobs[index].type;
      if (result.status === 'fulfilled') {
        formattedResults[jobType] = result.value;
      } else {
        formattedResults[jobType] = {
          success: false,
          error: result.reason.message
        };
      }
    });

    console.log('Batch print completed');
    return {
      success: true,
      message: 'Batch print completed',
      results: formattedResults
    };

  } catch (error) {
    console.error('Error in batch print:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  generatePDFFromHTML,
  printPDFToThermalPrinter,
  printHTML,
  printBatch
};