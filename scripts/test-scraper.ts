import puppeteer from 'puppeteer-core';
import { Browser } from 'puppeteer-core';
import dotenv from 'dotenv';
import { URL } from 'url';

/**
 * Web Scraper for FAQ Generation
 * 
 * Uses puppeteer-core for compatibility with Trigger.dev and Browserbase
 */

// Load environment variables
dotenv.config({ path: '.env.local' });

export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  headings: string[];
  links: string[];
}

export interface ScrapeOptions {
  maxPages?: number;
  siteOwner?: boolean;
  onProgress?: (pagesScraped: number) => Promise<void>;
}

async function initializeBrowser(siteOwner: boolean): Promise<Browser> {
  if (siteOwner) {
    // For owned sites, connect to local Chrome instance
    return await puppeteer.connect({
      browserURL: 'http://localhost:9222'
    });
  } else {
    // For non-owned sites, use Browserbase
    if (!process.env.BROWSERBASE_API_KEY) {
      throw new Error('BROWSERBASE_API_KEY environment variable is required for non-owned sites');
    }

    return await puppeteer.connect({
      browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}`,
    });
  }
}

export async function scrapeWebsite(
  startUrl: string,
  options: ScrapeOptions = {}
): Promise<ScrapedPage[]> {
  const {
    maxPages = 5,
    siteOwner = false,
    onProgress
  } = options;

  console.log(`Starting scrape of: ${startUrl} (${siteOwner ? 'owned site' : 'using proxy'})`);
  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [];
  const results: ScrapedPage[] = [];

  const browser = await initializeBrowser(siteOwner);

  try {
    queue.push({ url: startUrl, depth: 0 });

    while (queue.length > 0 && results.length < maxPages) {
      const { url: currentUrl, depth } = queue.shift()!;
      
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      console.log(`\nProcessing page: ${currentUrl} (Depth: ${depth})`);
      console.log(`Queue size: ${queue.length}, Pages scraped: ${results.length}`);

      const page = await browser.newPage();
      
      try {
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setDefaultNavigationTimeout(30000);

        await page.goto(currentUrl, { waitUntil: 'networkidle0' });
        await page.waitForSelector('body');

        const content = await page.evaluate(() => {
          const elementsToRemove = [
            'script',
            'style',
            'noscript',
            'iframe'
          ];
          
          elementsToRemove.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => el.remove());
          });

          const mainContent = document.querySelector(
            'main, article, [role="main"], #main-content, #content, .content, .main-content'
          );
          
          // Properly type cast to HTMLElement
          const mainContentElement = mainContent as HTMLElement | null;
          const bodyElement = document.body as HTMLElement;
          
          if (mainContentElement) {
            return mainContentElement.innerText.trim();
          }

          return bodyElement.innerText.trim();
        });

        const title = await page.title();
        
        const headings = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('h1, h2, h3'))
            .map(h => h.textContent?.trim())
            .filter(Boolean) as string[];
        });

        const links = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map(a => a.getAttribute('href'))
            .filter(Boolean) as string[];
        });

        results.push({
          url: currentUrl,
          title,
          content,
          headings,
          links: links.filter(Boolean),
        });

        if (onProgress) {
          await onProgress(results.length);
        }

        console.log(`Successfully scraped: ${title}`);
        console.log(`Content length: ${content.length} characters`);
        console.log(`Found ${headings.length} headings`);
        console.log(`Found ${links.length} links`);

        for (const link of links) {
          try {
            const absoluteUrl = new URL(link, currentUrl).href;
            const linkDomain = new URL(absoluteUrl).hostname;
            const currentDomain = new URL(currentUrl).hostname;

            if (
              linkDomain === currentDomain && 
              !visited.has(absoluteUrl) &&
              !absoluteUrl.includes('#') && 
              !absoluteUrl.match(/\.(pdf|jpg|jpeg|png|gif|mp4|zip|rar)$/i)
            ) {
              queue.push({ url: absoluteUrl, depth: depth + 1 });
            }
          } catch (error) {
            console.error(`Error processing link ${link}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error scraping ${currentUrl}:`, error);
      }
    }

    return results;

  } finally {
    await browser.close();
  }
}