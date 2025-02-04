# WhatTheFAQ - FAQ Generator

A modern web application built with Next.js 15 (App Router) that helps generate FAQs using AI and web scraping.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS, Shadcn UI
- **Backend**: Next.js Server Actions, Trigger.dev for background jobs
- **Database**: Supabase
- **Web Scraping**: Puppeteer
- **Authentication**: Supabase Auth

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn
- A Supabase account
- A Trigger.dev account

### Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Trigger.dev
TRIGGER_API_KEY=your_trigger_dev_api_key
TRIGGER_API_URL=your_trigger_dev_api_url
```

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/whatthefaq.git
   cd whatthefaq
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Run the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Features

- Modern, responsive UI built with Tailwind CSS and Shadcn UI
- Secure authentication with Supabase
- Background job processing with Trigger.dev
- Web scraping capabilities with Puppeteer
- TypeScript for type safety

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
