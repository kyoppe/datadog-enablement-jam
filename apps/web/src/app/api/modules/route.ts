import { NextResponse } from "next/server";
import { listModules } from "@/lib/module";

export async function GET() {
  return NextResponse.json({ modules: listModules() });
}
