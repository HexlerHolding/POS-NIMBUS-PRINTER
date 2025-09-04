# Nimbus PDF Printer Service

A microservice for generating and printing thermal receipt PDFs using Express.js and Puppeteer.

## Features

- Generate PDF receipts from JSON data
- Print to thermal printers using pdf-to-printer
- RESTful API endpoints
- Request validation and error handling
- Health monitoring endpoints
- Get available printers list

## Installation

```bash
npm install
```

## Usage

### Start the service

```bash
npm start
```

The service will run on port 3000 by default.

## API Endpoints

### POST /api/generate-pdf
Generate a PDF from receipt data.

**Request Body:**
```json
{
  "businessName": "Pour Coffee",
  "businessAddress": "123 Main Street",
  "businessPhone": "(555) 123-4567",
  "orderId": "TEST-123",
  "date": "2023-12-01T10:00:00Z",
  "cashier": "John Doe",
  "items": [
    {
      "name": "Coffee",
      "quantity": 2,
      "price": 4.50
    }
  ],
  "subtotal": 9.00,
  "tax": 0.72,
  "total": 9.72,
  "paymentMethod": "Credit Card"
}
```

### POST /api/print
Generate and print a PDF to a thermal printer.

**Request Body:**
```json
{
  "receiptData": { /* same as above */ },
  "printerName": "EPSON TM-T20II Receipt" // optional
}
```

### GET /api/printers
Get list of available printers.

### GET /api/health
Health check endpoint.

### GET /api/status
Service status and available endpoints.

## Configuration

- Set `PORT` environment variable to change the port (default: 3000)
- Place your logo as `logo.png` in the root directory

## Dependencies

- Express.js for the web server
- Puppeteer for PDF generation
- pdf-to-printer for printing functionality
- CORS for cross-origin requests