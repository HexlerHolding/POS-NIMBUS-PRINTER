const puppeteer = require('puppeteer');
const logger = require('./logger');

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
      logger.info(`Launching browser instance`, { browserIndex: index + 1 });
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
        logger.warn(`Browser disconnected unexpectedly`, {
          browserIndex: index + 1,
          action: 'Will be replaced on next use'
        });
        this.browsers[index] = null;
        this.browserStats[index] = null;
      });

      return browser;
    } catch (error) {
      logger.error(`Failed to launch browser`, error, { browserIndex: index + 1 });
      throw error;
    }
  }

  async initialize() {
    if (this.initialized) return;

    logger.info(`Initializing browser pool`, { poolSize: this.poolSize });

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const browser = await this.launchBrowser(i);
        this.browsers.push(browser);
        this.browserStats.push({
          operationCount: 0,
          lastRestart: Date.now()
        });
        logger.info(`Browser launched successfully`, {
          browserIndex: i + 1,
          total: this.poolSize
        });
      } catch (error) {
        logger.error(`Failed to launch browser during initialization`, error, {
          browserIndex: i + 1
        });
        this.browsers.push(null);
        this.browserStats.push(null);
      }
    }

    this.initialized = true;
    const healthyCount = this.browsers.filter(b => b).length;
    logger.info(`Browser pool initialized`, {
      healthyBrowsers: healthyCount,
      totalBrowsers: this.poolSize
    });

    // Start periodic health check
    this.startHealthCheck();
  }

  startHealthCheck() {
    // Check browser health every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      logger.debug('Running periodic browser health check');
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

    // If stats is null but we're checking, it means browser disconnected
    // We should attempt restart instead of returning early
    const shouldRestart =
      !browser ||
      !stats ||
      !(await this.isBrowserHealthy(browser)) ||
      (stats && stats.operationCount >= this.restartThreshold) ||
      (stats && (Date.now() - stats.lastRestart) >= this.restartInterval);

    if (shouldRestart) {
      logger.info(`Restarting browser`, {
        browserIndex: index + 1,
        reason,
        operationCount: stats?.operationCount || 0,
        uptimeMs: stats ? (Date.now() - stats.lastRestart) : 0
      });

      // Close old browser
      if (browser) {
        try {
          await browser.close();
        } catch (error) {
          logger.warn(`Error closing browser during restart`, {
            browserIndex: index + 1,
            error: error.message
          });
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
        logger.info(`Browser restarted successfully`, { browserIndex: index + 1 });
        logger.incrementBrowserRestart();
      } catch (error) {
        logger.critical(`Failed to restart browser - pool degraded`, error, {
          browserIndex: index + 1,
          healthyBrowsers: this.browsers.filter(b => b).length - 1
        });
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
        const currentStats = this.browserStats[index];
        if (currentStats) {
          currentStats.operationCount++;
        }
        logger.debug('Browser allocated for operation', {
          browserIndex: index + 1,
          operationCount: currentStats?.operationCount || 0
        });
        return currentBrowser;
      }

      retries++;
      logger.warn(`Browser not healthy, trying next browser`, {
        browserIndex: index + 1,
        retry: retries,
        maxRetries
      });
    }

    const healthyCount = this.browsers.filter(b => b).length;
    logger.critical('No healthy browsers available in pool', null, {
      retriesAttempted: maxRetries,
      healthyBrowsers: healthyCount,
      totalBrowsers: this.poolSize
    });
    throw new Error('No healthy browsers available in pool after retries');
  }

  async shutdown() {
    logger.info('Shutting down browser pool');

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
          logger.warn(`Error closing browser during shutdown`, {
            browserIndex: i + 1,
            error: error.message
          });
        }
      }
    }

    this.browsers = [];
    this.browserStats = [];
    this.initialized = false;
    logger.info('Browser pool shut down successfully');
  }
}

// Export singleton instance
const browserPool = new BrowserPool(2, 100);

module.exports = browserPool;
