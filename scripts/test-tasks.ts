import { tasks } from "@trigger.dev/sdk/v3";
import { scrapeWebsiteTask } from '../trigger/scrape-website';
import { generateFAQTask } from '../trigger/generate-faq';
import type { TaskResult as ScrapeTaskResult } from '../trigger/scrape-website';
import type { TaskResult as FAQTaskResult } from '../trigger/generate-faq';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function testTasks() {
  try {
    console.log('Starting task testing...');
    
    // Generate a unique ID for this test run
    const testId = uuidv4();
    console.log('Test ID:', testId);

    // 1. Test website scraping
    console.log('\nTesting website scraping for abandonedgrove.com...');
    const scrapeResult = await tasks.triggerAndPoll<typeof scrapeWebsiteTask>(
      "scrape-website",
      {
        url: 'https://abandonedgrove.com',
        maxPages: 5, // Reduced for testing
        siteOwner: true // This is our owned site
      }
    );
    
    console.log('Scrape task completed:', scrapeResult.id);
    console.log('Task status:', scrapeResult.status);
    
    if (!scrapeResult.output?.success || !scrapeResult.output.pages) {
      throw new Error('Scrape task failed or returned no pages');
    }

    const pages = scrapeResult.output.pages;
    console.log(`\nSuccessfully scraped ${pages.length} pages`);

    // 2. Test FAQ generation
    console.log('\nGenerating FAQs from scraped content...');
    const faqResult = await tasks.triggerAndPoll<typeof generateFAQTask>(
      "generate-faq",
      {
        pages,
        scrapeId: testId,
        options: {
          maxFaqsPerPage: 3,
          minConfidence: 0.7
        }
      }
    );

    console.log('FAQ Generation task completed:', faqResult.id);
    console.log('Task status:', faqResult.status);

    // Save all results for reference
    const results = {
      testId,
      timestamp: new Date().toISOString(),
      scrape: {
        pages: scrapeResult.output.pages,
        stats: scrapeResult.output.stats
      },
      faq: faqResult.output
    };

    const resultsPath = path.join(process.cwd(), 'scripts', 'mock-data', `test-results-${testId}.json`);
    await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${resultsPath}`);
    
    console.log('\nTest completed successfully! 🎉');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testTasks(); 