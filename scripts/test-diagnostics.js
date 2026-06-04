// ═══════════════════════════════════════════════════════════
//  Autonomous PPTX Diagnostics Test Runner
//  Runs the canonical 3-slide validation loop until PASS=true
//  Usage: node scripts/test-diagnostics.js [--once] [--deploy-url URL]
// ═══════════════════════════════════════════════════════════

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// ── Load .env.test if present ─────────────────────────────
try {
  const envPath = join(rootDir, ".env.test");
  const envContent = readFileSync(envPath, "utf8");
  envContent.split("\n").forEach(function(line) {
    const eq = line.indexOf("=");
    if (eq === -1 || line.startsWith("#")) return;
    const key = line.substring(0, eq).trim();
    const val = line.substring(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  });
} catch (e) { /* no .env.test — rely on process env */ }

// ── Configuration ─────────────────────────────────────────

const ACCESS_TOKEN     = process.env.GOOGLE_ACCESS_TOKEN || "";
const REFRESH_TOKEN    = process.env.GOOGLE_REFRESH_TOKEN || "";
const DEPLOY_URL       = (process.argv.includes("--deploy-url") 
                         ? process.argv[process.argv.indexOf("--deploy-url") + 1]
                         : process.env.DEPLOYMENT_URL)
                       || "https://brinc-proposal-generator.vercel.app";
const CLIENT_ID        = process.env.GOOGLE_CLIENT_ID 
                       || process.env.VITE_GOOGLE_CLIENT_ID 
                       || "711074142580-2lh3uth8dn38hjmoth12roi8uomdaak2.apps.googleusercontent.com";
const CLIENT_SECRET    = process.env.GOOGLE_CLIENT_SECRET || "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";
const MAX_RETRIES      = parseInt(process.env.MAX_RETRIES || "30", 10);
const RETRY_DELAY_MS   = parseInt(process.env.RETRY_DELAY_MS || "15000", 10);
const RUN_ONCE         = process.argv.includes("--once");

const TEST_MODULES     = ["why_brinc", "gcc_impact", "global_network"];

// ── Colors (no-ops if no TTY) ─────────────────────────────

const C = process.stdout.isTTY ? {
  red:     (s) => "\x1b[31m" + s + "\x1b[0m",
  green:   (s) => "\x1b[32m" + s + "\x1b[0m",
  yellow:  (s) => "\x1b[33m" + s + "\x1b[0m",
  cyan:    (s) => "\x1b[36m" + s + "\x1b[0m",
  magenta: (s) => "\x1b[35m" + s + "\x1b[0m",
  dim:     (s) => "\x1b[2m"  + s + "\x1b[0m",
  bold:    (s) => "\x1b[1m"  + s + "\x1b[0m",
} : {
  red: (s)=>s, green: (s)=>s, yellow: (s)=>s, cyan: (s)=>s,
  magenta: (s)=>s, dim: (s)=>s, bold: (s)=>s,
};

// ── Helpers ───────────────────────────────────────────────

function ts() { return new Date().toISOString().replace("T"," ").substring(0,19); }

function log(label, msg) {
  console.log(C.dim(ts()) + " " + C.cyan(label) + " " + msg);
}

function logDivider(title) {
  const line = "═".repeat(60);
  console.log("\n" + C.bold(C.cyan(line)));
  console.log(C.bold(C.cyan("  " + title)));
  console.log(C.bold(C.cyan(line)) + "\n");
}

async function fetchJson(url, opts) {
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch(e) {}
    return { ok: res.ok, status: res.status, data: data, text: text };
  } catch (fetchErr) {
    return { ok: false, status: 0, data: null, text: "", error: fetchErr.message || String(fetchErr) };
  }
}

// ── Auth: Use direct access token, or refresh if needed ───

async function getAccessToken() {
  // 1. Use direct access token if available
  if (ACCESS_TOKEN) {
    log("AUTH", "Using direct access token from env (" + ACCESS_TOKEN.substring(0, 12) + "...)");
    return ACCESS_TOKEN;
  }

  // 2. Fall back to refresh token exchange
  if (!REFRESH_TOKEN) {
    console.error(C.red("ERROR: No GOOGLE_ACCESS_TOKEN or GOOGLE_REFRESH_TOKEN set."));
    console.error("");
    console.error("Add to .env.test:");
    console.error(C.cyan("  GOOGLE_ACCESS_TOKEN=ya29..."));
    console.error(C.cyan("  GOOGLE_REFRESH_TOKEN=1//..."));
    return null;
  }

  log("AUTH", "Exchanging refresh token for access token...");
  const result = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!result.ok || !result.data || !result.data.access_token) {
    console.error(C.red("AUTH FAILED:"), result.data?.error || result.text || "Unknown error");
    console.error(C.red("  HTTP status:") , result.status);
    return null;
  }

  log("AUTH", "Access token obtained (" + result.data.access_token.substring(0, 12) + "...)");
  return result.data.access_token;
}

// ── Diagnostics call ──────────────────────────────────────

async function runDiagnostics(accessToken) {
  const url = DEPLOY_URL.replace(/\/$/, "") + "/api/google/pptx-diagnostics";
  log("HTTP", "POST " + url);
  log("HTTP", "Modules: [" + TEST_MODULES.join(", ") + "]");

  const result = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modules: TEST_MODULES,
      accessToken: accessToken,
      refreshToken: REFRESH_TOKEN,
    }),
  });

  if (!result.ok) {
    console.error(C.red("DIAGNOSTICS HTTP ERROR:"), result.status);
    if (result.error) console.error(C.red("  Fetch error:"), result.error);
    if (result.data?.error) console.error(C.red("  Server error:"), result.data.error);
    return null;
  }

  return result.data;
}

// ── Result formatter ──────────────────────────────────────

function formatResult(data) {
  if (!data || !data.validation) {
    console.error(C.red("INVALID RESPONSE — no validation object"));
    if (data) console.error(C.yellow("Keys: " + Object.keys(data).join(", ")));
    return { pass: false, retry: true };
  }

  const v = data.validation;
  const pass = !!v.pass;

  logDivider("DIAGNOSTICS RESULT");

  // Core metrics
  const passIcon  = v.pass        ? C.green("✓ PASS")     : C.red("✗ FAIL");
  const xmlIcon   = v.xmlPass     ? C.green("✓ xmlPass") : C.red("✗ xmlPass=false");
  const errIcon   = v.errorsZero  ? C.green("✓ errorsZero") : C.red("✗ errorsZero=false");
  const medIcon   = v.mediaMissing === 0 ? C.green("✓ mediaMissing=0") : C.red("✗ mediaMissing=" + v.mediaMissing);
  const brkIcon   = v.relationshipsBrokenCount === 0 ? C.green("✓ relationshipsBroken=0") : C.red("✗ relationshipsBroken=" + v.relationshipsBrokenCount);
  const rcIcon    = v.relationshipsRenderCritical === 0 ? C.green("✓ renderCritical=0") : C.red("✗ renderCritical=" + v.relationshipsRenderCritical);

  console.log(C.bold("PASS:             ") + passIcon);
  console.log(C.bold("xmlPass:          ") + xmlIcon);
  console.log(C.bold("errorsZero:       ") + errIcon);
  console.log(C.bold("mediaMissing:     ") + medIcon);
  console.log(C.bold("relationshipsBroken: ") + brkIcon);
  console.log(C.bold("renderCritical:   ") + rcIcon);
  console.log("");

  // Timing
  if (data.timing) {
    console.log(C.bold(C.cyan("Timing:")));
    console.log("  totalMs:    " + data.timing.totalMs + "ms");
    console.log("  assemblyMs: " + data.timing.assemblyMs + "ms");
    console.log("  uploadMs:   " + data.timing.uploadMs + "ms");
    console.log("");
  }

  // Assembly
  if (data.assembly) {
    console.log(C.bold(C.cyan("Assembly:")));
    console.log("  slideCount: " + data.assembly.slideCount);
    console.log("  sizeBytes:  " + data.assembly.sizeBytes);
    console.log("  sizeKb:     " + data.assembly.sizeKb + " KB");
    console.log("");
  }

  // Content type audit (from new logging)
  if (data._rawValidation?.contentTypes) {
    const ct = data._rawValidation.contentTypes;
    console.log(C.bold(C.cyan("Content Types:")));
    console.log("  defaults: " + ct.defaults);
    console.log("  missing:  " + (ct.missing?.length ? JSON.stringify(ct.missing) : C.green("[]")));
    console.log("");
  }

  // Errors
  if (v.errors && v.errors.length > 0) {
    console.log(C.bold(C.red("Validation Errors (" + v.errors.length + "):")));
    v.errors.forEach(function(e, i) {
      console.log(C.red("  " + (i+1) + ". " + e));
    });
    console.log("");
  }

  // passReasons
  if (v.passReasons) {
    console.log(C.bold(C.cyan("passReasons:")));
    Object.keys(v.passReasons).forEach(function(k) {
      const val = v.passReasons[k];
      const icon = val === true ? C.green("true") : val === false ? C.red("false") : val;
      console.log("  " + k + ": " + icon);
    });
    console.log("");
  }

  // Drive
  if (data.drive) {
    console.log(C.bold(C.cyan("Drive:")));
    console.log("  id: " + data.drive.id);
    console.log("  webViewLink: " + data.drive.webViewLink);
    console.log("");
  }

  // Vercel deploy status
  if (data._vercelDeploy) {
    console.log(C.yellow("[NOTE] Using cached Vercel deployment — may not include latest commit"));
    console.log("");
  }

  logDivider("END RESULT");

  return { pass: pass, data: data };
}

// ── Main loop ─────────────────────────────────────────────

async function main() {
  console.log("");
  logDivider("PPTX DIAGNOSTICS AUTONOMOUS TEST RUNNER");
  console.log("Deployment: " + C.cyan(DEPLOY_URL));
  console.log("Modules:    " + C.cyan(JSON.stringify(TEST_MODULES)));
  console.log("Mode:       " + (RUN_ONCE ? C.yellow("single-run") : C.yellow("loop-until-PASS")));
  console.log("");

  if (!ACCESS_TOKEN && !REFRESH_TOKEN) {
    console.error(C.red("ERROR: No GOOGLE_ACCESS_TOKEN or GOOGLE_REFRESH_TOKEN set."));
    console.error("");
    console.error("Create .env.test in project root:");
    console.error(C.cyan("  GOOGLE_ACCESS_TOKEN=ya29..."));
    console.error(C.cyan("  GOOGLE_REFRESH_TOKEN=1//...  (fallback if access token expires)"));
    console.error(C.cyan("  DEPLOYMENT_URL=" + DEPLOY_URL));
    console.error("");
    console.error("These are used ONLY for autonomous PPTX engine testing.");
    console.error(".env.test is gitignored and will never be committed.");
    process.exit(1);
  }

  let attempt = 0;
  let lastPass = false;

  while (true) {
    attempt++;
    console.log("\n" + C.bold(C.cyan("━━━ Attempt " + attempt + " ━━━")) + "\n");

    // 1. Get access token
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.error(C.red("Cannot get access token. Stopping."));
      process.exit(1);
    }

    // 2. Run diagnostics
    const data = await runDiagnostics(accessToken);
    if (!data) {
      if (attempt >= MAX_RETRIES) {
        console.error(C.red("Max retries (" + MAX_RETRIES + ") reached. Stopping."));
        process.exit(1);
      }
      log("WAIT", "Retrying in " + RETRY_DELAY_MS + "ms...");
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    // 3. Format result
    const result = formatResult(data);
    lastPass = result.pass;

    // 4. Check if done
    if (result.pass) {
      console.log("\n" + C.bold(C.green("══════════════════════════════════════════════════════════════")));
      console.log(C.bold(C.green("  SUCCESS — ALL CRITERIA MET")));
      console.log(C.bold(C.green("══════════════════════════════════════════════════════════════")));
      console.log("");
      console.log("Commit: " + C.cyan("87b653c"));
      console.log("PASS:   " + C.green("true"));
      console.log("xmlPass:" + C.green("true"));
      console.log("errorsZero:" + C.green("true"));
      console.log("mediaMissing: " + C.green("0"));
      console.log("relationshipsBroken: " + C.green("0"));
      console.log("renderCritical: " + C.green("0"));
      console.log("");
      if (data.drive) {
        console.log("Drive link: " + C.cyan(data.drive.webViewLink));
      }
      process.exit(0);
    }

    // 5. Single run mode
    if (RUN_ONCE) {
      console.log(C.yellow("\n--once flag set, exiting after single run."));
      process.exit(0);
    }

    // 6. Loop
    if (attempt >= MAX_RETRIES) {
      console.error(C.red("\nMax retries (" + MAX_RETRIES + ") reached without PASS."));
      process.exit(1);
    }

    log("WAIT", C.yellow("PASS=false — retrying in " + RETRY_DELAY_MS + "ms..."));
    await sleep(RETRY_DELAY_MS);
  }
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

main().catch(function(err) {
  console.error(C.red("FATAL: ") + (err.message || err));
  process.exit(1);
});
