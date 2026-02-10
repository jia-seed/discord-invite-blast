import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// --- Config ---
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM_EMAIL = process.env.FROM_EMAIL!;
const BATCH_SIZE = 100;
const DELAY_BETWEEN_BATCHES_MS = 1000;
const DRY_RUN = process.argv.includes("--dry-run");

// --- Clients ---
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);

// --- Email template ---
function buildEmail(to: string) {
  return {
    from: FROM_EMAIL,
    to,
    subject: "also i can help star ur githubs or like ur projects (i will personally do it)",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; line-height: 1.7; color: #333;">
        <p>also let me know what you're working on so i can star ur github or comment and like your posts.</p>
        <p>and updates on my end i built a product with my friend mal that helps developers get users on their projects. we're starting to roll out beta users (limited time free) first come first serve. we launch in 5 days!</p>
        <a href="https://www.spreadjam.com/"
           style="display: inline-block; background: #333; color: white; padding: 14px 28px;
                  border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; margin: 8px 0 16px;">
          join the limited beta
        </a>
        <p><a href="https://www.spreadjam.com/">https://www.spreadjam.com/</a></p>
        <p>if you want to be featured in our launch video in 5 days, send a picture (or 5 sec video) of your project or you to this email as well as which country you are from</p>
        <p>p.s. say "bread" in the #bread-thread channel in discord</p>
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

    if (users.length < perPage) break;
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
    console.log("No emails found.");
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
