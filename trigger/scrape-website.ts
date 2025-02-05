import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { scrapeWebsite, type ScrapedPage } from "@/scripts/test-scraper";

// Define the task input schema
const scrapeWebsiteSchema = z.object({
  url: z.string().url(),
  maxPages: z.number().min(1).max(50).default(5),
  userId: z.string().optional(),
});

type TaskPayload = z.infer<typeof scrapeWebsiteSchema>;

interface TaskResult {
  success: boolean;
  results?: ScrapedPage[];
  stats?: {
    totalPages: number;
    totalContent: number;
    averageContentLength: number;
  };
  error?: string;
}

// Create the Trigger.dev task
export const scrapeWebsiteTask = task({
  id: "scrape-website",
  run: async (payload: TaskPayload): Promise<TaskResult> => {
    const { url, maxPages, userId } = payload;

    // Log the start of the task
    logger.info("Starting website scrape", {
      url,
      maxPages,
      userId,
    });

    try {
      let pagesScraped = 0;

      // Run the scraper with progress updates
      const results = await scrapeWebsite(url, maxPages, async (currentPages: number) => {
        pagesScraped = currentPages;
        logger.info(`Scraped ${currentPages}/${maxPages} pages`);
      });

      // Log completion
      logger.info("Website scrape completed", {
        pagesScraped: results.length,
        url,
      });

      // Return the results
      return {
        success: true,
        results,
        stats: {
          totalPages: results.length,
          totalContent: results.reduce((acc, page) => acc + page.content.length, 0),
          averageContentLength: Math.round(
            results.reduce((acc, page) => acc + page.content.length, 0) / results.length
          ),
        },
      };
    } catch (error) {
      // Log any errors
      logger.error("Error scraping website", {
        error: error instanceof Error ? error.message : String(error),
        url,
      });

      // Return error state
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
}); 