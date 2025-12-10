const puppeteer = require('puppeteer');

class BrowserPool {
  constructor(poolSize = 2, restartThreshold = 100) {
    this.poolSize = poolSize;
    this.browsers = [];
    this.browserStats = []; // Track usage stats for each browser
    this.currentIndex = 0;
    this.initialized = false;
    this.restartThreshold = restartThreshold; // Restart browser after N operations
    this.restartInterval = 30 * 60 * 1000; // Restart every 30 minutes
  }

  async launchBrowser(index) {
    try {
      console.log(`Launching browser ${index + 1}...`);
      const browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // Overcome limited resource problems
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      // Handle browser disconnection
      browser.on('disconnected', () => {
        console.warn(`Browser ${index + 1} disconnected. Will be replaced on next use.`);
        this.browsers[index] = null;
        this.browserStats[index] = null;
      });

      return browser;
    } catch (error) {
      console.error(`Failed to launch browser ${index + 1}:`, error);
      throw error;
    }
  }

  async initialize() {
    if (this.initialized) return;

    console.log(`Initializing browser pool with ${this.poolSize} browsers...`);

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const browser = await this.launchBrowser(i);
        this.browsers.push(browser);
        this.browserStats.push({
          operationCount: 0,
          lastRestart: Date.now()
        });
        console.log(`Browser ${i + 1}/${this.poolSize} launched successfully`);
      } catch (error) {
        console.error(`Failed to launch browser ${i + 1}:`, error);
        this.browsers.push(null);
        this.browserStats.push(null);
      }
    }

    this.initialized = true;
    console.log(`Browser pool initialized with ${this.browsers.filter(b => b).length} browsers`);

    // Start periodic health check
    this.startHealthCheck();
  }

  startHealthCheck() {
    // Check browser health every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      console.log('Running browser health check...');
      for (let i = 0; i < this.browsers.length; i++) {
        await this.checkAndRestartBrowser(i, 'periodic-check');
      }
    }, 5 * 60 * 1000);
  }

  async isBrowserHealthy(browser) {
    if (!browser) return false;

    try {
      // Check if browser is connected
      if (!browser.isConnected()) {
        return false;
      }

      // Try to get browser version as a health check
      const version = await browser.version();
      return !!version;
    } catch (error) {
      return false;
    }
  }

  async checkAndRestartBrowser(index, reason = 'health-check') {
    const browser = this.browsers[index];
    const stats = this.browserStats[index];

    if (!stats) return;

    const shouldRestart =
      !browser ||
      !(await this.isBrowserHealthy(browser)) ||
      stats.operationCount >= this.restartThreshold ||
      (Date.now() - stats.lastRestart) >= this.restartInterval;

    if (shouldRestart) {
      console.log(`Restarting browser ${index + 1} (reason: ${reason})`);

      // Close old browser
      if (browser) {
        try {
          await browser.close();
        } catch (error) {
          console.error(`Error closing browser ${index + 1}:`, error);
        }
      }

      // Launch new browser
      try {
        const newBrowser = await this.launchBrowser(index);
        this.browsers[index] = newBrowser;
        this.browserStats[index] = {
          operationCount: 0,
          lastRestart: Date.now()
        };
        console.log(`Browser ${index + 1} restarted successfully`);
      } catch (error) {
        console.error(`Failed to restart browser ${index + 1}:`, error);
        this.browsers[index] = null;
        this.browserStats[index] = null;
      }
    }
  }

  async getBrowser() {
    if (!this.initialized) {
      await this.initialize();
    }

    // Try to get a healthy browser with retries
    const maxRetries = this.poolSize * 2;
    let retries = 0;

    while (retries < maxRetries) {
      const index = this.currentIndex;
      this.currentIndex = (this.currentIndex + 1) % this.browsers.length;

      const browser = this.browsers[index];
      const stats = this.browserStats[index];

      // Check if browser needs restart
      await this.checkAndRestartBrowser(index, 'pre-operation');

      // Get the (potentially new) browser
      const currentBrowser = this.browsers[index];

      if (currentBrowser && await this.isBrowserHealthy(currentBrowser)) {
        // Increment operation count
        if (stats) {
          stats.operationCount++;
        }
        return currentBrowser;
      }

      retries++;
      console.warn(`Browser ${index + 1} not healthy, trying next browser (retry ${retries}/${maxRetries})`);
    }

    throw new Error('No healthy browsers available in pool after retries');
  }

  async shutdown() {
    console.log('Shutting down browser pool...');

    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    for (let i = 0; i < this.browsers.length; i++) {
      const browser = this.browsers[i];
      if (browser) {
        try {
          await browser.close();
        } catch (error) {
          console.error(`Error closing browser ${i + 1}:`, error);
        }
      }
    }

    this.browsers = [];
    this.browserStats = [];
    this.initialized = false;
    console.log('Browser pool shut down');
  }
}

// Export singleton instance
const browserPool = new BrowserPool(2, 100);

module.exports = browserPool;
