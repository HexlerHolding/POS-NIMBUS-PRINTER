function validateReceiptData(req, res, next) {
  const { receiptData } = req.body;

  const data = receiptData || req.body;

  if (!data) {
    return res.status(400).json({
      success: false,
      message: 'Receipt data is required'
    });
  }

  const requiredFields = ['orderId'];
  const missingFields = requiredFields.filter(field => !data[field]);

  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields',
      missingFields
    });
  }

  if (data.items && Array.isArray(data.items)) {
    const invalidItems = data.items.filter(item =>
      !item.name ||
      typeof item.quantity !== 'number' ||
      typeof item.price !== 'number'
    );

    if (invalidItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid items format. Each item must have name (string), quantity (number), and price (number)'
      });
    }
  }

  if (data.subtotal !== undefined && typeof data.subtotal !== 'number') {
    return res.status(400).json({
      success: false,
      message: 'Subtotal must be a number'
    });
  }

  if (data.tax !== undefined && typeof data.tax !== 'number') {
    return res.status(400).json({
      success: false,
      message: 'Tax must be a number'
    });
  }

  if (data.total !== undefined && typeof data.total !== 'number') {
    return res.status(400).json({
      success: false,
      message: 'Total must be a number'
    });
  }

  next();
}

function validatePrintRequest(req, res, next) {
  const { printerName } = req.body;

  if (printerName && typeof printerName !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Printer name must be a string'
    });
  }

  next();
}

module.exports = {
  validateReceiptData,
  validatePrintRequest
};