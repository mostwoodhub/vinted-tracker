import { NextResponse } from "next/server";
import { checkRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/fetch-all";
import { warsawDateString } from "@/lib/warsaw-time";

// Every table holding real business data, mirroring phi's "Pełna kopia
// zapasowa wszystkich danych (JSON)" button. Deliberately excludes
// allegro_oauth_tokens and olx_oauth_tokens — those hold live access/refresh
// tokens, not business data, and have no reason to end up in a file that
// gets downloaded and potentially emailed around or left on a laptop.
const BACKUP_TABLES = [
  "items",
  "sales",
  "batches",
  "expenses",
  "employees",
  "item_photos",
  "item_photo_sets",
  "item_status_log",
  "marketplace_listings",
  "listing_publications",
  "sales_accounts_archive",
  "sales_profiles_archive",
  "auth_login_log",
] as const;

export async function GET() {
  const access = await checkRole("admin");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  const tables: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = await fetchAllRows<unknown>((from, to) =>
      supabaseAdmin.from(table).select("*").range(from, to)
    );
  }

  const body = JSON.stringify(
    { generatedAt: new Date().toISOString(), tables },
    null,
    2
  );

  const filename = `vinted-tracker-backup-${warsawDateString(new Date())}.json`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
