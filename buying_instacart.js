// Uses puppeteer as an example
const puppeteer = require('puppeteer');
//import puppeteer, {Locator} from 'puppeteer';


function delay(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time)
    });
}

(async () => {
    getInstacartPrice('boba');
})();

function getInstacartPrice(item) 
    // This LAUNCHES a new, sandboxed browser
    // A "persistent sandbox"
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null, // <-- This is the magic line
        userDataDir: '/Users/sense/my-chrome-data' // This creates a reusable profile
    });
    const page = await browser.newPage();
    await page.goto('https://www.instacart.com/store/');

    
    const timeout = 5000;
    page.setDefaultTimeout(timeout);

    {
        const targetPage = page;
        await targetPage.setViewport({
            width: 1046,
            height: 892
        })
    }
    {
        const targetPage = page;
        await targetPage.goto('https://www.instacart.com/store/');
    }
    await delay(4000);
    {
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('::-p-aria(Search[role=\\"textbox\\"])'),
            targetPage.locator('#search-bar-input'),
            targetPage.locator('::-p-xpath(//*[@id=\\"search-bar-input\\"])'),
            targetPage.locator(':scope >>> #search-bar-input')
        ])
            .setTimeout(timeout)
            .click({
                offset: {
                    x: 203,
                    y: 23,
                },
            });
    }
    {
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('::-p-aria(Search[role=\\"textbox\\"])'),
            targetPage.locator('#search-bar-input'),
            targetPage.locator('::-p-xpath(//*[@id=\\"search-bar-input\\"])'),
            targetPage.locator(':scope >>> #search-bar-input')
        ])
            .setTimeout(timeout)
            .fill('boba');
    }
    // FINDS WHAT IT'S BUYING IN THE SEARCH BAR
    {
        const targetPage = page;
        await targetPage.keyboard.down('Enter');
    }
    {
        const targetPage = page;
        await targetPage.keyboard.up('Enter');
    }

    // Get item price and store as variable
    let itemPrice;
    {
        const targetPage = page;
        const priceXpath = '/html/body/div[2]/div[1]/div[1]/div/div/div/ul/li[1]/div[1]/div/div/div/div/div[2]/ul/li[1]/h3/div/a/div[2]/div[1]/div[1]/div[1]';

        // Wait for element and get its text content
        const element = await puppeteer.Locator.race([
            targetPage.locator(`::-p-xpath(${priceXpath})`)
        ])
            .setTimeout(timeout)
            .waitHandle();

        const textContent = await element.evaluate(el => el.textContent);

        // Parse the number from the text
        itemPrice = parseFloat(textContent.replace(/[^0-9.-]+/g, ''));

        console.log('Item price stored:', itemPrice);
    }

        // {
        //     const targetPage = page;
        //     const xpath = "/html/body/div[2]/div[1]/div[1]/div/div/div/ul/li[1]/div[1]/div/div/div/div/ul/li[1]/h3/div/div[2]/div/div/button";
        //     // 1. Wait for the element (found by XPath) to be ready
        //     await page.waitForSelector(xpath);

        //     // 2. Click the element
        //     await page.click(xpath);
        // }

    // Click on adding item to cart button (1 time)
    {
        const targetPage = page;
        const xpath = '/html/body/div[2]/div[1]/div[1]/div/div/div/ul/li[1]/div[1]/div/div/div/div/div[2]/ul/li[1]/h3/div/div/div';
        await puppeteer.Locator.race([
            targetPage.locator(`::-p-xpath(${xpath})`)
        ])
            .setTimeout(timeout)
            .click();
    }
    await delay(7000);
    // Click on "View Cart" button (handles varying item count)
    {
        const targetPage = page;
        const xpath = '/html/body/div[2]/div[1]/header/div/div/button';
        await puppeteer.Locator.race([
            targetPage.locator(`::-p-xpath(${xpath})`)
        ])
            .setTimeout(timeout)
            .click();
    }
    await delay(8000);


    //Click on "Add Count" button {X} times
    for (let i = 0; i < 3; i++) {
        {
            const targetPage = page;
            const addCountButtonXpath = '/html/body/div[5]/div[1]/div/div/div/div[3]/div/div/div/div/div[2]/div/div[2]/div/div/div/div/span/button[2]';
            await puppeteer.Locator.race([
                targetPage.locator(`::-p-xpath(${addCountButtonXpath})`)
            ])
                .setTimeout(timeout)
                .click();
        }
    }   
    await delay(6000);
    // Click on CHEKOUT BUTTON
    {
        const targetPage = page;
        const submitCheckoutButton = '/html/body/div[5]/div[1]/div/div/footer/button';
        await puppeteer.Locator.race([
            targetPage.locator(`::-p-xpath(${submitCheckoutButton})`)
        ])
            .setTimeout(timeout)
            .click();
    }
    // Get SubTotal Price
    {
        const targetPage = page;
        const priceXpath = '/html/body/div[2]/div[1]/div/div/div/div[2]/div/div[1]/div/div[2]/div[1]/div/ul/li[6]/div/div[2]/div/div[2]/span';

        // Get the element using XPath
        const element = await puppeteer.Locator.race([
            targetPage.locator(`::-p-xpath(${priceXpath})`)
        ])
            .setTimeout(timeout)
            .waitHandle();

        // Extract the text content
        const textContent = await element.evaluate(el => el.textContent);

        // Parse the number from the text (removes currency symbols, commas, etc.)
        const number = parseFloat(textContent.replace(/[^0-9.-]+/g, ''));

        console.log('Extracted number:', number);

        // Call the test function with the extracted number
        return number, targetPage.url();
        
    }