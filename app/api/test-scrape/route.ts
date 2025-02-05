import { NextResponse } from "next/server";
import { triggerScrape } from "@/app/actions";

export async function GET(request: Request) {
  const result = await triggerScrape("https://abandonedgrove.com", 2);
  return NextResponse.json(result);
} 