const puppeteer = require('puppeteer');

class BrowserPool {
  constructor(poolSize = 2) {
    this.poolSize = poolSize;
    this.browsers = [];
    this.currentIndex = 0;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    console.log(`Initializing browser pool with ${this.poolSize} browsers...`);

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const browser = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.browsers.push(browser);
        console.log(`Browser ${i + 1}/${this.poolSize} launched`);
      } catch (error) {
        console.error(`Failed to launch browser ${i + 1}:`, error);
      }
    }

    this.initialized = true;
    console.log(`Browser pool initialized with ${this.browsers.length} browsers`);
  }

  async getBrowser() {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.browsers.length === 0) {
      throw new Error('No browsers available in pool');
    }

    // Round-robin selection
    const browser = this.browsers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.browsers.length;

    return browser;
  }

  async shutdown() {
    console.log('Shutting down browser pool...');
    for (const browser of this.browsers) {
      try {
        await browser.close();
      } catch (error) {
        console.error('Error closing browser:', error);
      }
    }
    this.browsers = [];
    this.initialized = false;
    console.log('Browser pool shut down');
  }
}

// Export singleton instance
const browserPool = new BrowserPool(2);

module.exports = browserPool;
