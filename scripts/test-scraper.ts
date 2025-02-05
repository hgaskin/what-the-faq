import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
import { URL } from 'url';

/**
 * Web Scraper for FAQ Generation
 * 
 * Current Status: Basic content extraction working well.
 * 
 * Potential Future Optimizations:
 * 1. Enhanced Content Organization:
 *    - Add structured fields for FAQ-relevant content
 *    - Extract existing FAQs, product info, problem statements
 *    - Identify benefits and pricing information
 * 
 * 2. Smarter Content Extraction:
 *    - Look for FAQ-specific sections and schema.org markup
 *    - Identify question-like content
 *    - Extract structured data
 * 
 * 3. Priority-based Crawling:
 *    - Prioritize FAQ, About, Product, and Support pages
 *    - Improve page relationship tracking
 *    - Better handling of navigation structure
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

export type ProgressCallback = (pagesScraped: number) => Promise<void>;

export async function scrapeWebsite(
  startUrl: string, 
  maxPages: number = 5,
  onProgress?: ProgressCallback
) {
  if (!process.env.BROWSERBASE_API_KEY) {
    throw new Error('BROWSERBASE_API_KEY environment variable is required');
  }

  console.log(`Starting scrape of: ${startUrl}`);
  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [];
  const results: ScrapedPage[] = [];

  const browser = await puppeteer.connect({
    browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}`,
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });

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
          
          if (mainContent) {
            return mainContent.textContent?.trim() || '';
          }

          return document.body.textContent?.trim() || '';
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
      await page.close();
    }

    console.log('\n=== Scraping Complete ===');
    console.log(`Total pages scraped: ${results.length}`);
    console.log(`Unique URLs found: ${visited.size}`);

    return results;

  } catch (error) {
    console.error('Fatal error:', error);
    throw error;
  } finally {
    await browser.close();
  }
} 