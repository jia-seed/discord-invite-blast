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
    subject: "it's jia hi we launched jam (backed by co-founder lovable and co-founder hugging face)",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; line-height: 1.7; color: #333;">
        <p>hiyo it's human jia it's actually me not ai lmfao. we just launched!</p>
        <p>the last 7 days before launch has been like a hackathon and this is the defining moment. would mean a lot if u like, comment, share with your friends, and repost this video on X/twitter (if you want lol). also, hope u enjoy the product!</p>
        <a href="https://x.com/jia_seed/status/2022761948753117393?s=20" style="display: block; position: relative; border-radius: 12px; overflow: hidden; margin: 8px 0 16px; text-decoration: none;">
          <img src="https://ubqlwxvulcdueuteajfb.supabase.co/storage/v1/object/public/assets/jam.png" alt="SpreadJam launch video" style="display: block; width: 100%; border-radius: 12px;" />
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 60px; height: 60px; background: rgba(0,0,0,0.6); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <div style="width: 0; height: 0; border-top: 12px solid transparent; border-bottom: 12px solid transparent; border-left: 20px solid white; margin-left: 4px;"></div>
          </div>
        </a>
        <p><a href="https://x.com/jia_seed/status/2022761948753117393?s=20">https://x.com/jia_seed/status/2022761948753117393</a> (link to share with your friends or date)</p>
        <p>also happy valentine's day! best of luck to fellow cs ppl today...</p>
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
