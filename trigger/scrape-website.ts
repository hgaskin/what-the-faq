import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import puppeteer from 'puppeteer-core';
import puppeteerStandalone from 'puppeteer';
import type { Browser, Page } from 'puppeteer-core';
import { createClient } from "@/utils/supabase/server";
import { generateFAQTask } from "./generate-faq";

// Define the task input schema
const scrapeWebsiteSchema = z.object({
  url: z.string().url(),
  maxPages: z.number().min(1).max(50).default(5),
  siteOwner: z.boolean().default(false), // Whether we own the site
});

type TaskPayload = z.infer<typeof scrapeWebsiteSchema>;

interface PageData {
  title: string;
  content: string;
  headings: string[];
  links: string[];
}

export interface TaskResult {
  success: boolean;
  pages?: Array<{
    url: string;
    title: string;
    content: string;
    headings: string[];
    links: string[];
  }>;
  stats?: {
    totalPages: number;
    totalContent: number;
    averageContentLength: number;
  };
  error?: string;
}

async function initializeBrowser(siteOwner: boolean): Promise<Browser> {
  if (siteOwner) {
    // For owned sites, use standalone puppeteer
    logger.info("Using standalone puppeteer for owned site");
    const browser = await puppeteerStandalone.launch({
      args: ['--no-sandbox'],
      defaultViewport: { width: 1200, height: 800 }
    });
    return browser as unknown as Browser; // Type assertion to match puppeteer-core Browser type
  } else {
    // For non-owned sites, use puppeteer-core with Browserbase proxy (required by Trigger.dev ToS)
    if (!process.env.BROWSERBASE_API_KEY) {
      throw new Error('BROWSERBASE_API_KEY environment variable is required for non-owned sites');
    }
    logger.info("Using Browserbase proxy for non-owned site");
    return await puppeteer.connect({
      browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}`,
    });
  }
}

// Create the Trigger.dev task
export const scrapeWebsiteTask = task({
  id: "scrape-website",
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: TaskPayload): Promise<TaskResult> => {
    const { url, maxPages, siteOwner } = payload;

    logger.info("Starting website scrape", {
      url,
      maxPages,
      siteOwner
    });

    let browser: Browser | undefined;
    try {
      browser = await initializeBrowser(siteOwner);
      
      const visited = new Set<string>();
      const toVisit = [url];
      const results: Array<{
        url: string;
        title: string;
        content: string;
        headings: string[];
        links: string[];
      }> = [];

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });

      while (toVisit.length > 0 && results.length < maxPages) {
        const currentUrl = toVisit.shift()!;
        if (visited.has(currentUrl)) continue;

        logger.info(`Processing page: ${currentUrl}`);
        try {
          await page.goto(currentUrl, { 
            waitUntil: siteOwner ? 'domcontentloaded' : 'networkidle0' // More reliable with proxy
          });
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
              links: Array.from(new Set(links))
            };
          }) as PageData;

          results.push({
            url: currentUrl,
            ...pageData
          });

          // Add new links to visit
          toVisit.push(...(pageData.links.filter(link => !visited.has(link))));

          logger.info(`Scraped page ${results.length}/${maxPages}`, {
            url: currentUrl,
            title: pageData.title,
            contentLength: pageData.content.length,
            headingsCount: pageData.headings.length,
            linksCount: pageData.links.length
          });

        } catch (error) {
          logger.error(`Error scraping ${currentUrl}:`, {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      return {
        success: true,
        pages: results,
        stats: {
          totalPages: results.length,
          totalContent: results.reduce((acc, page) => acc + page.content.length, 0),
          averageContentLength: Math.round(
            results.reduce((acc, page) => acc + page.content.length, 0) / results.length
          ),
        },
      };

    } catch (error) {
      logger.error("Error in scraping task", {
        error: error instanceof Error ? error.message : String(error),
        url,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  },
}); 