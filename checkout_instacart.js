const puppeteer = require('puppeteer');

function delay(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time)
    });
}

/**
 * Opens a URL and clicks on the checkout button
 * @param {string} url - The URL to open
 * @param {object} browser - Optional existing browser instance
 * @returns {Promise<void>}
 */
export async function checkoutInstacart(url, browser = null) {
    const timeout = 5000;
    let shouldCloseBrowser = false;

    // Create browser if not provided
    if (!browser) {
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            userDataDir: '/Users/sense/my-chrome-data'
        });
        shouldCloseBrowser = true;
    }

    const page = await browser.newPage();
    page.setDefaultTimeout(timeout);

    try {
        // Navigate to the URL
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Wait a bit for page to load
        await delay(2000);

        // Click on the checkout button using XPath
        {
            const targetPage = page;
            const checkoutButtonXpath = '/html/body/div[2]/div[1]/div/div/div/div[2]/div/div[2]/div/div/button';

            await puppeteer.Locator.race([
                targetPage.locator(`::-p-xpath(${checkoutButtonXpath})`)
            ])
                .setTimeout(timeout)
                .click();
        }

        console.log('Successfully clicked checkout button');

        // Wait to see the result
        await delay(2000);

    } catch (error) {
        console.error('Error during checkout:', error);
        throw error;
    } finally {
        // Only close browser if we created it
        if (shouldCloseBrowser) {
            await browser.close();
        }
    }
}

// Export the function
module.exports = { checkoutInstacart };

// Example usage (uncomment to run standalone):
// (async () => {
//     const url = 'YOUR_INSTACART_URL_HERE';
//     await checkoutInstacart(url);
// })();
