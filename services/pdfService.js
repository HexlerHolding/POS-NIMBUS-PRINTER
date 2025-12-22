const fs = require('fs');
const path = require('path');
const browserPool = require('./browserPool');
const logger = require('./logger');
require('dotenv').config();

// Attempt to require pdf-to-printer, but handle if not installed
let printer;
try {
  printer = require('pdf-to-printer');
} catch (error) {
  logger.warn('pdf-to-printer module not found. Printing functionality will be limited.');
  printer = null;
}

const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Convert HTML content to PDF with retry logic
 * @param {string} htmlContent - The HTML content to convert
 * @param {string} outputPath - The path to save the PDF
 * @param {object} options - PDF generation options
 * @param {string} options.width - Paper width (e.g., '72mm', '58mm')
 * @param {string} options.height - Paper height (e.g., '150mm', 'auto')
 * @param {object} options.margin - Margins { top, right, bottom, left }
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<object>} - Returns {success: boolean, error?: Error}
 */
async function generatePDFFromHTML(htmlContent, outputPath, options = {}, retries = 2) {
  const htmlPath = path.join(tempDir, `temp-${Date.now()}.html`);
  let page = null;
  let browser = null;
  let lastError = null;

  try {
    // Save HTML file for debugging
    fs.writeFileSync(htmlPath, htmlContent);

    // Get a healthy browser from the pool
    browser = await browserPool.getBrowser();

    // Create new page with timeout
    page = await Promise.race([
      browser.newPage(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Page creation timeout')), 30000)
      )
    ]);

    // Set page timeout
    page.setDefaultTimeout(30000);

    // Optimized: use 'load' instead of 'networkidle0' for faster processing
    await page.setContent(htmlContent, {
      waitUntil: 'load',
      timeout: 30000
    });

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
      printBackground: true,
      timeout: 30000
    };

    await page.pdf(pdfOptions);

    logger.debug('PDF generated successfully', { outputPath });
    return { success: true };

  } catch (error) {
    lastError = error;

    // Determine if error is retryable
    const isRetryable =
      error.message.includes('Target closed') ||
      error.message.includes('Session closed') ||
      error.message.includes('Protocol error') ||
      error.message.includes('timeout');

    if (retries > 0 && isRetryable) {
      logger.warn(`PDF generation failed, retrying`, {
        retriesLeft: retries,
        errorType: error.message,
        isRetryable
      });

      // Close the page if it exists
      if (page) {
        try {
          await page.close();
        } catch (e) {
          // Ignore close errors during retry
        }
      }

      // Wait a bit before retry
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Retry with one less retry count
      return generatePDFFromHTML(htmlContent, outputPath, options, retries - 1);
    }

    // All retries exhausted or non-retryable error
    logger.error('PDF generation failed after retries', error, {
      retriesLeft: retries,
      isRetryable,
      finalAttempt: true
    });

    logger.incrementPDFFailure();
    return { success: false, error: lastError };

  } finally {
    // Close the page (not the browser)
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        logger.warn('Error closing page during cleanup', { error: closeError.message });
      }
    }

    // Clean up HTML file
    try {
      if (fs.existsSync(htmlPath)) {
        fs.unlinkSync(htmlPath);
      }
    } catch (cleanupError) {
      logger.warn('Error cleaning up HTML file', { error: cleanupError.message });
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
    logger.info(`Sending print job to printer`, {
      printer: finalPrinterName || 'default',
      paperSize,
      pdfPath: path.basename(pdfPath)
    });

    if (printer) {
      const options = {
        printer: finalPrinterName,
        copies: 1,
        scale: 'noscale',
        paperSize,
        margin: '0'
      };

      await printer.print(pdfPath, options);
      logger.debug('Print job sent successfully', { printer: finalPrinterName });
      return 'Print job sent successfully';
    } else {
      logger.incrementPrinterFailure();
      throw new Error('pdf-to-printer module not available');
    }
  } catch (error) {
    logger.error('Failed to print PDF', error, {
      printer: printerName,
      pdfPath: path.basename(pdfPath)
    });
    logger.incrementPrinterFailure();
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
  const startTime = Date.now();
  try {
    const timestamp = Date.now();
    const pdfPath = path.join(tempDir, `print-${timestamp}.pdf`);

    logger.info(`Starting print job`, {
      printer: printerName,
      paperSize: printPaperSize
    });

    // Generate PDF
    const pdfResult = await generatePDFFromHTML(htmlContent, pdfPath, pdfOptions);

    if (!pdfResult.success) {
      // Error already logged in generatePDFFromHTML
      logger.incrementPrintJob(false);
      return {
        success: false,
        error: pdfResult.error.message,
        errorType: 'PDF_GENERATION_FAILED',
        errorDetails: {
          message: pdfResult.error.message,
          type: pdfResult.error.constructor.name
        }
      };
    }

    // Print PDF
    const printResult = await printPDFToThermalPrinter(pdfPath, printerName, printPaperSize);

    // Clean up PDF file
    try {
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    } catch (cleanupError) {
      logger.warn('Error cleaning up PDF file', { error: cleanupError.message });
    }

    const duration = Date.now() - startTime;
    logger.info(`Print job completed successfully`, {
      printer: printerName,
      duration: `${duration}ms`
    });
    logger.incrementPrintJob(true);

    return {
      success: true,
      message: printResult
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Print job failed', error, {
      printer: printerName,
      duration: `${duration}ms`
    });
    logger.incrementPrintJob(false);

    return {
      success: false,
      error: error.message,
      errorType: 'PRINT_FAILED',
      errorDetails: {
        message: error.message,
        type: error.constructor.name
      }
    };
  }
}

/**
 * Batch print multiple receipts in parallel
 * @param {Array} printJobs - Array of print job objects
 * @returns {Promise<object>} - Returns results for each job
 */
async function printBatch(printJobs) {
  const startTime = Date.now();
  try {
    logger.info(`Processing print batch`, {
      jobCount: printJobs.length,
      jobTypes: printJobs.map(j => j.type).join(', ')
    });

    // Process all jobs in parallel
    const results = await Promise.allSettled(
      printJobs.map(async (job, index) => {
        try {
          const { htmlContent, jsonContent, printerName, pdfOptions, paperSize, type, useJSON } = job;

          // Use JSON or HTML content based on flag
          const content = useJSON ? jsonContent : htmlContent;

          if (!content || !printerName) {
            const error = new Error(`Invalid job ${index}: missing content or printer name`);
            logger.warn('Invalid print job in batch', {
              jobIndex: index,
              type,
              hasContent: !!content,
              hasPrinter: !!printerName
            });
            throw error;
          }

          const result = await printHTML(content, printerName, pdfOptions, paperSize);

          return {
            type,
            ...result
          };
        } catch (error) {
          logger.error('Batch print job failed', error, {
            jobIndex: index,
            jobType: job.type
          });
          return {
            type: job.type,
            success: false,
            error: error.message
          };
        }
      })
    );

    // Format results and count successes/failures
    const formattedResults = {};
    let successCount = 0;
    let failureCount = 0;

    results.forEach((result, index) => {
      const jobType = printJobs[index].type;
      if (result.status === 'fulfilled') {
        formattedResults[jobType] = result.value;
        if (result.value.success) {
          successCount++;
        } else {
          failureCount++;
        }
      } else {
        formattedResults[jobType] = {
          success: false,
          error: result.reason.message
        };
        failureCount++;
      }
    });

    const duration = Date.now() - startTime;
    logger.info('Batch print completed', {
      totalJobs: printJobs.length,
      successful: successCount,
      failed: failureCount,
      duration: `${duration}ms`
    });

    return {
      success: true,
      message: 'Batch print completed',
      results: formattedResults,
      stats: {
        total: printJobs.length,
        successful: successCount,
        failed: failureCount
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Batch print operation failed', error, {
      duration: `${duration}ms`,
      jobCount: printJobs.length
    });
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