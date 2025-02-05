import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { ScrapedPage } from "@/scripts/test-scraper";

// Error types with categories for retry decisions
enum ErrorCategory {
  TRANSIENT = 'transient', // Temporary errors that should be retried
  PERMANENT = 'permanent', // Permanent errors that shouldn't be retried
  VALIDATION = 'validation', // Data validation errors
}

class FAQGenerationError extends Error {
  constructor(
    message: string, 
    public readonly category: ErrorCategory,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'FAQGenerationError';
  }
}

class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly category: ErrorCategory,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Helper function for retrying operations with category-based decisions
async function withRetry<T>(
  operation: () => Promise<T>,
  errorCategory: ErrorCategory,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry permanent errors
      if (error instanceof FAQGenerationError || error instanceof DatabaseError) {
        if (error.category === ErrorCategory.PERMANENT) {
          throw error;
        }
      }

      if (attempt === maxAttempts) break;

      // Exponential backoff with jitter
      const jitter = Math.random() * 1000;
      const delay = delayMs * Math.pow(2, attempt - 1) + jitter;
      
      logger.info(`Retrying operation`, {
        attempt,
        maxAttempts,
        errorCategory,
        delay,
        error: lastError?.message
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Helper function to estimate tokens from text
function estimateTokens(text: string, charsPerToken: number = 4): number {
  return Math.ceil(text.length / charsPerToken);
}

// Validation schemas with more specific constraints
const FAQSchema = z.object({
  question: z.string().min(10).max(200),
  answer: z.string().min(20).max(1000),
  confidence: z.number().min(0).max(1),
  sourceUrl: z.string().url(),
  sourcePage: z.string(),
  metadata: z.object({
    relevance: z.number().min(0).max(1),
    category: z.enum(['product', 'service', 'technical', 'support', 'pricing', 'other']),
    keywords: z.array(z.string()),
  }).optional(),
});

const FAQResponseSchema = z.object({
  faqs: z.array(FAQSchema),
});

// Enhanced task input schema
const generateFAQSchema = z.object({
  pages: z.array(z.object({
    url: z.string().url(),
    title: z.string(),
    content: z.string(),
    headings: z.array(z.string()),
    links: z.array(z.string()),
    metadata: z.object({
      importance: z.number().min(0).max(1),
      lastModified: z.string().datetime().optional(),
    }).optional(),
  })),
  scrapeId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  options: z.object({
    maxFaqsPerPage: z.number().min(1).max(10).default(5),
    minConfidence: z.number().min(0).max(1).default(0.7),
    preferredCategories: z.array(z.string()).optional(),
  }).optional(),
});

type TaskPayload = z.infer<typeof generateFAQSchema>;
export type FAQ = z.infer<typeof FAQSchema>;

export interface TaskResult {
  success: boolean;
  faqs?: FAQ[];
  text?: string;
  responses?: string[];
  stats?: {
    totalFaqs: number;
    processedChunks: number;
    totalTokens: number;
    averageConfidence: number;
    processingTimeMs: number;
    model: string;
  };
  error?: string;
}

// Improved system prompt with more specific instructions
const SYSTEM_PROMPT = `You are an expert FAQ generator specialized in creating accurate, helpful, and concise FAQs from website content. Your task is to:

1. Analyze Content:
   - Identify key information and main topics
   - Focus on factual, verifiable information
   - Recognize user pain points and common questions

2. Generate Strategic FAQs:
   - Create questions that users are likely to ask
   - Ensure questions cover different aspects (features, pricing, support)
   - Maintain natural, conversational tone
   - Avoid redundancy across FAQs

3. Write Clear Answers:
   - Be concise but complete
   - Include specific details from the source
   - Use simple, direct language
   - Format for readability

4. Prioritize:
   - Product/service core features
   - Pricing and availability
   - Technical specifications
   - Usage instructions
   - Support information
   - Common concerns/objections

5. Quality Control:
   - Verify accuracy against source
   - Assign confidence scores
   - Include source references
   - Categorize FAQs`;

// Create the Trigger.dev task
export const generateFAQTask = task({
  id: "generate-faq",
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: TaskPayload): Promise<TaskResult> => {
    const { pages, scrapeId } = payload;
    const startTime = Date.now();

    try {
      logger.info("Starting FAQ generation", { 
        scrapeId, 
        pageCount: pages.length
      });

      // Combine all page content into one prompt
      const combinedContent = pages.map(page => `
Page: ${page.title}
URL: ${page.url}
Content:
${page.content}
---`).join('\n');

      const result = await generateText({
        model: openai('gpt-4o'),
        system: SYSTEM_PROMPT,
        prompt: `Generate FAQs from this content. For each FAQ:
1. Ensure it's relevant and useful
2. Verify accuracy against the source
3. Include confidence score and metadata

Content to analyze:
${combinedContent}

Return a JSON object in this format:
{
  "faqs": [{
    "question": "Clear, specific question",
    "answer": "Accurate, helpful answer",
    "confidence": 0.0-1.0,
    "sourceUrl": "URL where info was found",
    "sourcePage": "Page title",
    "metadata": {
      "relevance": 0.0-1.0,
      "category": "product|service|technical|support|pricing|other",
      "keywords": ["keyword1", "keyword2"]
    }
  }]
}`,
        temperature: 0.3,
        maxTokens: 4000
      });

      logger.info("AI response received", {
        scrapeId,
        responseLength: result.text.length
      });

      // Parse the response to get stats
      let parsedFaqs;
      try {
        parsedFaqs = FAQResponseSchema.parse(JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim()));
      } catch (error) {
        logger.error("Failed to parse FAQs", {
          error: error instanceof Error ? error.message : String(error),
          text: result.text
        });
        throw error;
      }

      const averageConfidence = parsedFaqs.faqs.reduce((acc, faq) => acc + faq.confidence, 0) / parsedFaqs.faqs.length;

      logger.info("FAQ generation completed", {
        scrapeId,
        faqCount: parsedFaqs.faqs.length,
        averageConfidence,
        processingTimeMs: Date.now() - startTime
      });

      return {
        success: true,
        text: result.text,
        stats: {
          totalFaqs: parsedFaqs.faqs.length,
          processedChunks: 1, // We're processing everything in one go
          totalTokens: estimateTokens(result.text),
          averageConfidence,
          processingTimeMs: Date.now() - startTime,
          model: 'gpt-4o'
        }
      };

    } catch (error) {
      logger.error("Error in FAQ generation task", {
        error: error instanceof Error ? error.message : String(error),
        scrapeId,
        processingTimeMs: Date.now() - startTime
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  },
}); 