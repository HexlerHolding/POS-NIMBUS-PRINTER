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
---

### ⚙️ Step-by-Step: Run `pm2 resurrect` via Task Scheduler

1. **Make sure PM2 is installed globally**

   ```powershell
   npm install pm2 -g
   pm2 start app.js --name my-service
   pm2 save
   ```

   That `pm2 save` command stores your current process list so `resurrect` knows what to bring back.

---

2. **Find your Node and PM2 paths**
   In PowerShell, run:

   ```powershell
   where node
   where pm2
   ```

   You’ll get something like:

   ```
   C:\Program Files\nodejs\node.exe
   C:\Users\YourName\AppData\Roaming\npm\pm2.ps1
   ```

   You’ll need these paths in the next step.

---

3. **Create the Task**

   * Open **Task Scheduler** → *Create Task*.
   * **General tab**:

     * Name: `PM2 Resurrect`
     * Check **“Run whether user is logged on or not”**
     * Check **“Run with highest privileges”**
   * **Triggers tab**:

     * Add → *At startup*
   * **Actions tab**:

     * Add new action:

       * **Program/script:**
         `powershell.exe`
       * **Arguments:**

         ```powershell
         -ExecutionPolicy Bypass -Command "C:\Users\YourName\AppData\Roaming\npm\pm2.ps1 resurrect"
         ```
       * *(Replace path with your actual PM2 path from step 2)*

---

4. **Optional delay (recommended)**
   Add a delay trigger (like 30 seconds) so PM2 starts after Windows finishes booting, otherwise it may run before Node’s environment variables are available.

---

5. **Test it**

   * Right-click the task → *Run*.
   * Then check:

     ```powershell
     pm2 list
     ```

     Your apps should be back up.

---

That’s it — now whenever Windows starts, Task Scheduler will quietly run `pm2 resurrect`, reviving your microservices like a necromancer with admin rights.
