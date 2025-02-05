import { FAQ } from '@/trigger/generate-faq';

export interface Database {
  public: {
    Tables: {
      scrapes: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          url: string;
          user_id: string | null;
          status: 'pending' | 'scraping' | 'scraping_completed' | 'faq_generated' | 'error';
          pages: Array<{
            url: string;
            title: string;
            content: string;
            headings: string[];
            links: string[];
          }>;
          completed_at?: string;
          metadata?: {
            processing_time_ms: number;
            total_faqs: number;
          };
        };
        Insert: Omit<Database['public']['Tables']['scrapes']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['scrapes']['Insert']>;
      };
      faqs: {
        Row: {
          id: string;
          created_at: string;
          scrape_id: string;
          user_id: string | null;
          faqs: FAQ[];
          status: 'pending' | 'completed' | 'error';
          metadata: {
            chunks_processed: number;
            total_tokens: number;
            model: string;
            processing_time_ms: number;
            average_confidence: number;
            options: {
              maxFaqsPerPage: number;
              minConfidence: number;
              preferredCategories?: string[];
            };
          };
        };
        Insert: Omit<Database['public']['Tables']['faqs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['faqs']['Insert']>;
      };
    };
  };
} 