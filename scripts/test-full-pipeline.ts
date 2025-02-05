import { scrapeWebsite } from './test-scraper';
import { tasks } from "@trigger.dev/sdk/v3";
import { generateFAQTask } from '../trigger/generate-faq';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Validate required environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testFullPipeline() {
  try {
    console.log('Starting full pipeline test...');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const urlIndex = args.indexOf('--url');
    const maxPagesIndex = args.indexOf('--maxPages');
    const ownerIndex = args.indexOf('--owner');
    
    // Get URL and maxPages from command line or use defaults
    const testUrl = urlIndex !== -1 ? args[urlIndex + 1] : 'https://docs.trigger.dev/';
    const maxPages = maxPagesIndex !== -1 ? parseInt(args[maxPagesIndex + 1]) : 3;
    const siteOwner = ownerIndex !== -1 ? args[ownerIndex + 1] === 'true' : false;
    
    console.log(`\nScraping ${testUrl}...`);
    const pages = await scrapeWebsite(testUrl, {
      maxPages,
      siteOwner,
      onProgress: async (currentPages) => {
        console.log(`Scraped ${currentPages}/${maxPages} pages`);
      }
    });
    
    console.log(`\nScraping completed. Found ${pages.length} pages.`);

    // Save scrape results as sample data if it's not the default URL
    if (testUrl !== 'https://docs.trigger.dev/') {
      const siteNameMatch = testUrl.match(/\/\/(www\.)?([^\/]+)/);
      const siteName = siteNameMatch ? siteNameMatch[2].replace(/\./g, '') : 'custom';
      const samplePath = path.join(process.cwd(), 'scripts', 'mock-data', `sample-scrape-${siteName}.json`);
      
      await fs.writeFile(samplePath, JSON.stringify({ pages }, null, 2));
      console.log(`\nSaved scrape results to ${samplePath}`);
    }
    
    // 2. Test FAQ generation
    const scrapeId = uuidv4();
    console.log('\nGenerating FAQs...');
    
    // Trigger the FAQ generation task
    const handle = await tasks.trigger<typeof generateFAQTask>(
      "generate-faq",
      {
        pages,
        scrapeId,
        options: {
          maxFaqsPerPage: 3,
          minConfidence: 0.7
        }
      }
    );
    
    console.log('\nFAQ Generation task triggered:', handle);
    console.log('Check the Trigger.dev dashboard to view task execution details.');
    console.log('Task ID:', handle.id);
    
    // Wait a bit for the task to start
    console.log('\nWaiting for database entries (this may take a few moments)...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 3. Verify database entries
    const { data: scrapeData, error: scrapeError } = await supabase
      .from('scrapes')
      .select('*')
      .eq('id', scrapeId)
      .single();
      
    if (scrapeError) {
      console.log('Note: Scrape entry not found yet. This is expected as the task is still running.');
      console.log('Please check the Trigger.dev dashboard for task progress.');
      process.exit(0);
    }
    
    console.log('\nScrape entry found:');
    console.log('Status:', scrapeData.status);
    
    const { data: faqData, error: faqError } = await supabase
      .from('faqs')
      .select('*')
      .eq('scrape_id', scrapeId)
      .single();
      
    if (faqError) {
      console.log('Note: FAQ entry not found yet. This is expected as the task is still running.');
      console.log('Please check the Trigger.dev dashboard for task progress.');
      process.exit(0);
    }
    
    console.log('\nFAQ entry found:');
    console.log('FAQ Count:', faqData.faqs.length);
    
    console.log('\nTest completed successfully! 🎉');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testFullPipeline(); 