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
    // Try to convert and validate items
    const convertedItems = [];
    const invalidItems = [];

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const convertedItem = { ...item };

      // Check name field
      if (!item.name) {
        invalidItems.push({ index: i, error: 'Missing product name' });
        continue;
      }

      // Use product_name if available, otherwise use name
      convertedItem.name = item.product_name || item.name;

      // Try to convert quantity to number
      if (typeof item.quantity !== 'number') {
        const convertedQuantity = Number(item.quantity);
        if (isNaN(convertedQuantity) || convertedQuantity < 0) {
          invalidItems.push({ index: i, error: 'Invalid quantity - must be a positive number' });
          continue;
        }
        convertedItem.quantity = convertedQuantity;
      }

      // Try to convert price to number
      if (typeof item.price !== 'number') {
        const convertedPrice = Number(item.price);
        if (isNaN(convertedPrice) || convertedPrice < 0) {
          invalidItems.push({ index: i, error: 'Invalid price - must be a positive number' });
          continue;
        }
        convertedItem.price = convertedPrice;
      }

      convertedItems.push(convertedItem);
    }

    if (invalidItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid items format detected',
        invalidItems
      });
    }

    // Update the data with converted items
    data.items = convertedItems;
  }

  // Try to convert subtotal to number
  if (data.subtotal !== undefined && typeof data.subtotal !== 'number') {
    const convertedSubtotal = Number(data.subtotal);
    if (isNaN(convertedSubtotal) || convertedSubtotal < 0) {
      return res.status(400).json({
        success: false,
        message: 'Subtotal must be a valid positive number'
      });
    }
    data.subtotal = convertedSubtotal;
  }

  // Try to convert tax to number
  if (data.tax !== undefined && typeof data.tax !== 'number') {
    const convertedTax = Number(data.tax);
    if (isNaN(convertedTax) || convertedTax < 0) {
      return res.status(400).json({
        success: false,
        message: 'Tax must be a valid positive number'
      });
    }
    data.tax = convertedTax;
  }

  // Try to convert total to number
  if (data.total !== undefined && typeof data.total !== 'number') {
    const convertedTotal = Number(data.total);
    if (isNaN(convertedTotal) || convertedTotal < 0) {
      return res.status(400).json({
        success: false,
        message: 'Total must be a valid positive number'
      });
    }
    data.total = convertedTotal;
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