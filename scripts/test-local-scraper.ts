import puppeteer from 'puppeteer';
import { Browser } from 'puppeteer';
import type { ScrapedPage } from './test-scraper';

export interface LocalScrapeOptions {
  url: string;
  maxPages?: number;
  visible?: boolean;
  delayMs?: number;
  pathPrefixes?: string[]; // Only scrape URLs with these path prefixes
  excludePaths?: string[]; // Skip URLs with these paths
  onProgress?: (currentPages: number) => Promise<void>;
}

export async function scrapeWebsiteLocally(
  options: LocalScrapeOptions
): Promise<ScrapedPage[]> {
  const {
    url,
    maxPages = 5,
    visible = false,
    delayMs = 0,
    pathPrefixes = [],
    excludePaths = [],
    onProgress
  } = options;

  console.log('Starting local scrape of:', url);
  console.log(`Mode: ${visible ? 'visible browser' : 'headless'}`);
  if (pathPrefixes.length > 0) console.log('Path prefixes:', pathPrefixes);
  if (excludePaths.length > 0) console.log('Excluded paths:', excludePaths);

  const browser = await puppeteer.launch({
    headless: !visible,
    defaultViewport: { width: 1200, height: 800 }
  });

  try {
    const pages: ScrapedPage[] = [];
    const visited = new Set<string>();
    const toVisit = [url];

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    while (toVisit.length > 0 && pages.length < maxPages) {
      const currentUrl = toVisit.shift()!;
      if (visited.has(currentUrl)) continue;

      // Check if URL matches our path filters
      const urlObj = new URL(currentUrl);
      const pathname = urlObj.pathname;

      // Skip if path doesn't match prefixes (when specified)
      if (pathPrefixes.length > 0 && !pathPrefixes.some(prefix => pathname.startsWith(prefix))) {
        continue;
      }

      // Skip if path matches exclude patterns
      if (excludePaths.some(exclude => pathname.includes(exclude))) {
        continue;
      }

      console.log('Visiting:', currentUrl);
      try {
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded' }); // Changed from networkidle0 to be faster
        visited.add(currentUrl);

        // Extract page data
        const pageData = await page.evaluate(() => {
          // Get main content
          const mainContent = document.querySelector(
            'main, article, [role="main"], #main-content, #content, .content, .main-content'
          ) as HTMLElement | null;
          
          const content = mainContent ? mainContent.innerText : document.body.innerText;

          // Get headings
          const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
            .map(h => h.textContent?.trim())
            .filter(Boolean) as string[];

          // Get links that are part of the same domain
          const domain = window.location.hostname;
          const links = Array.from(document.querySelectorAll('a'))
            .map(a => a.href)
            .filter(href => 
              href.includes(domain) && 
              href.startsWith('http') &&
              !href.includes('#') && // Skip anchor links
              !href.match(/\.(pdf|jpg|jpeg|png|gif|mp4|zip|rar)$/i) // Skip files
            );

          return {
            title: document.title,
            content: content.trim(),
            headings,
            links: Array.from(new Set(links)) // Convert Set to Array before spreading
          };
        });

        pages.push({
          url: currentUrl,
          ...pageData
        });

        // Add new links to visit
        toVisit.push(...Array.from(pageData.links.filter(link => !visited.has(link))));

        if (onProgress) {
          await onProgress(pages.length);
        }

        console.log(`Scraped: ${pageData.title}`);
        console.log(`Content length: ${pageData.content.length} characters`);
        console.log(`Found ${pageData.headings.length} headings`);
        console.log(`Found ${pageData.links.length} links`);

        // Optional delay
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(`Error scraping ${currentUrl}:`, error);
      }
    }

    console.log('\nScraping completed successfully!');
    console.log(`Total pages scraped: ${pages.length}`);
    console.log(`Unique URLs visited: ${visited.size}`);

    return pages;

  } finally {
    await browser.close();
  }
} 