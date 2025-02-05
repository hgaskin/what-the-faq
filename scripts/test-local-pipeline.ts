import { scrapeWebsiteLocally, type LocalScrapeOptions } from './test-local-scraper';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function testLocalPipeline() {
  try {
    console.log('Starting local pipeline test...');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const urlIndex = args.indexOf('--url');
    const maxPagesIndex = args.indexOf('--maxPages');
    const visibleFlag = args.includes('--visible');
    
    // Get URL and maxPages from command line or use defaults
    const testUrl = urlIndex !== -1 ? args[urlIndex + 1] : 'https://abandonedgrove.com';
    const maxPages = maxPagesIndex !== -1 ? parseInt(args[maxPagesIndex + 1]) : 5;
    
    console.log(`\nScraping ${testUrl}...`);
    const pages = await scrapeWebsiteLocally({
      url: testUrl,
      maxPages,
      visible: visibleFlag,
      onProgress: async (currentPages: number) => {
        console.log(`Scraped ${currentPages}/${maxPages} pages`);
      }
    });
    
    console.log(`\nScraping completed. Found ${pages.length} pages.`);

    // Save scrape results as sample data
    const siteNameMatch = testUrl.match(/\/\/(www\.)?([^\/]+)/);
    const siteName = siteNameMatch ? siteNameMatch[2].replace(/\./g, '') : 'custom';
    const samplePath = path.join(process.cwd(), 'scripts', 'mock-data', `sample-scrape-${siteName}.json`);
    
    await fs.writeFile(samplePath, JSON.stringify({ pages }, null, 2));
    console.log(`\nSaved scrape results to ${samplePath}`);
    
    // TODO: FAQ Generation
    // This would be the next step in the pipeline, but requires an LLM
    /*
    console.log('\nGenerating FAQs...');
    const faqs = await generateFAQs({
      pages,
      options: {
        maxFaqsPerPage: 3,
        minConfidence: 0.7,
        preferredCategories: ['product', 'technical', 'support']
      }
    });

    // Save FAQs
    const faqPath = path.join(process.cwd(), 'scripts', 'mock-data', `faqs-${siteName}.json`);
    await fs.writeFile(faqPath, JSON.stringify({ faqs }, null, 2));
    console.log(`\nSaved FAQs to ${faqPath}`);
    */
    
    console.log('\nTest completed successfully! 🎉');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testLocalPipeline(); 