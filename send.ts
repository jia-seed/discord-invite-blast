import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// --- Config ---
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM_EMAIL = process.env.FROM_EMAIL!;
const BATCH_SIZE = 100; // Resend max per batch call
const DELAY_BETWEEN_BATCHES_MS = 1000; // 1 second between batches to respect rate limits
const DRY_RUN = process.argv.includes("--dry-run");

// --- Clients ---
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);

// --- Email template ---
function buildEmail(to: string) {
  return {
    from: FROM_EMAIL,
    to,
    subject: "hi from jia :3",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; line-height: 1.7; color: #333;">
        <p>hey sup! you might remember me from sprint.dev or such. i'm emailing you with an invite to the invite-only discord for people who have gone to hackathons or shipped projects.</p>
        <p>btw if you are receiving this email, at some point i have personally reviewed your profile!</p>
        <p>this link is only for you. do not share, as we are keeping the quality of the discord members high (unless you are referring someone actively building projects)</p>
        <p>if you want to share with someone who's actively building, here's the link as text: <a href="https://discord.gg/5sdGUP4pG5">https://discord.gg/5sdGUP4pG5</a></p>
        <a href="https://discord.gg/5sdGUP4pG5"
           style="display: inline-block; background: #5865F2; color: white; padding: 14px 28px;
                  border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; margin: 8px 0 16px;">
          join the discord
        </a>
        <p>okay bai. p.s. there are founders of companies you know in the discord which you may see around</p>
      </div>
    `,
  };
}

// --- Fetch all emails from Supabase Auth ---
async function fetchAllEmails(): Promise<string[]> {
  const emails: string[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Supabase auth fetch failed at page ${page}: ${error.message}`);
    }

    if (!users || users.length === 0) break;

    for (const user of users) {
      if (user.email) emails.push(user.email);
    }

    console.log(`  Fetched ${emails.length} emails so far...`);
    page++;

    if (users.length < perPage) break; // last page
  }

  return emails;
}

// --- Send emails in batches ---
async function sendBatches(emails: string[]) {
  const total = emails.length;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Batch ${batchNum}/${totalBatches}: would send to ${batch.length} recipients`);
      sent += batch.length;
      continue;
    }

    try {
      const { data, error } = await resend.batch.send(
        batch.map((email) => buildEmail(email))
      );

      if (error) {
        console.error(`  Batch ${batchNum}/${totalBatches} FAILED: ${error.message}`);
        failed += batch.length;
      } else {
        sent += batch.length;
        console.log(`  Batch ${batchNum}/${totalBatches} sent (${sent}/${total} done)`);
      }
    } catch (err: any) {
      console.error(`  Batch ${batchNum}/${totalBatches} ERROR: ${err.message}`);
      failed += batch.length;
    }

    // Rate limit pause
    if (i + BATCH_SIZE < total) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  return { sent, failed };
}

// --- Main ---
async function main() {
  console.log(DRY_RUN ? "=== DRY RUN MODE ===" : "=== SENDING EMAILS ===");

  console.log("\n1. Fetching emails from Supabase...");
  const emails = await fetchAllEmails();
  console.log(`   Found ${emails.length} emails\n`);

  if (emails.length === 0) {
    console.log("No emails found. Check your table/column names in the script.");
    return;
  }

  console.log(`2. Sending in batches of ${BATCH_SIZE}...\n`);
  const { sent, failed } = await sendBatches(emails);

  console.log(`\n=== DONE ===`);
  console.log(`  Sent: ${sent}`);
  console.log(`  Failed: ${failed}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
