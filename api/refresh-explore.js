export const maxDuration = 60;

// Curated list of real X (Twitter) posts about makeup/skincare routines that
// read as organic and non-sponsored based on manual review. X doesn't offer
// a free, keyless way to auto-discover "latest posts by hashtag" (search
// requires login), so this list has to be maintained by hand - add more
// { platform, url, creator, topic } entries here over time. Every post is
// still re-checked for sponsorship signals at fetch time below using the
// real caption pulled from its own oEmbed response, not just this list.
const CURATED_POSTS = [
  { platform: "twitter", topic: "Makeup Routine", url: "https://x.com/TheSunainaa/status/1931418426448179667", creator: "@TheSunainaa" },
  { platform: "twitter", topic: "Skincare Routine", url: "https://x.com/softparisian/status/1141796142801444867", creator: "@softparisian" },
  { platform: "twitter", topic: "Skincare Routine", url: "https://x.com/syame31/status/1158313772986933248", creator: "@syame31" },
  { platform: "twitter", topic: "Makeup Routine", url: "https://x.com/QuarterJade/status/1303441124657369090", creator: "@QuarterJade" },
  { platform: "twitter", topic: "Skincare Routine", url: "https://x.com/usamasyed/status/1485002920680738828", creator: "@usamasyed" },
  { platform: "twitter", topic: "Makeup Routine", url: "https://x.com/QuarterJade/status/1197637100453023744", creator: "@QuarterJade" },
  { platform: "twitter", topic: "Makeup Routine", url: "https://x.com/alexandracooper/status/1036772080069500928", creator: "@alexandracooper" }
];

const FETCH_TIMEOUT_MS = 7000;

function decodeEntities(s) {
  return (s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripHtml(s) {
  return decodeEntities((s || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opts, signal: controller.signal });
    return r;
  } finally {
    clearTimeout(t);
  }
}

async function fetchOembed(platform, url) {
  try {
    let oembedUrl = null;
    if (platform === "twitter") {
      oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
    } else if (platform === "tiktok") {
      oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    }
    if (!oembedUrl) return null;
    const r = await fetchWithTimeout(oembedUrl);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.html) return null;
    return data;
  } catch {
    return null;
  }
}

const SPONSORED_PATTERNS = [
  /#ad\b/i,
  /#sponsored/i,
  /#paidpartnership/i,
  /#brandpartner/i,
  /#gifted/i,
  /\bsponsored\b/i,
  /\bpaid partnership\b/i,
  /\bin partnership with\b/i,
  /\bgifted\b/i,
  /\baffiliate link\b/i,
  /\buse code\b/i,
  /\bpromo code\b/i,
  /\bbrand partner\b/i,
  /\bthanks .*(for (sponsoring|gifting))\b/i,
  /\bad\b/i
];

function isLikelySponsored(text) {
  if (!text) return false;
  return SPONSORED_PATTERNS.some((re) => re.test(text));
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : (req.query.secret || "");
    const isVercelCron = !!req.headers["x-vercel-cron"];
    if (!isVercelCron && provided !== cronSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var.",
      fix: "Vercel Project -> Settings -> Environment Variables -> add SUPABASE_SERVICE_ROLE_KEY (from Supabase Project Settings -> API -> service_role key), then Redeploy."
    });
  }

  const rows = [];
  const skipped = { sponsored: 0, unavailable: 0 };

  for (const post of CURATED_POSTS) {
    const oembed = await fetchOembed(post.platform, post.url);
    if (!oembed) {
      skipped.unavailable++;
      continue;
    }

    const captionText = stripHtml(oembed.html);
    const sponsoredSignal =
      isLikelySponsored(captionText) ||
      isLikelySponsored(oembed.title);
    if (sponsoredSignal) {
      skipped.sponsored++;
      continue;
    }

    rows.push({
      platform: post.platform,
      creator: post.creator,
      topic: post.topic,
      source_url: post.url,
      embed_url: post.url,
      embed_html: oembed.html,
      caption: captionText.slice(0, 400) || null,
      is_active: true,
      updated_at: new Date().toISOString()
    });
  }

  try {
    if (rows.length > 0) {
      const upsertRes = await fetch(`${supabaseUrl}/rest/v1/explore_embeds?on_conflict=source_url`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(rows)
      });
      if (!upsertRes.ok) {
        const t = await upsertRes.text();
        return res.status(502).json({ error: "Failed upserting explore embeds", detail: t.slice(0, 500) });
      }
    }

    return res.status(200).json({
      upserted: rows.length,
      candidatesChecked: CURATED_POSTS.length,
      skippedSponsored: skipped.sponsored,
      skippedUnavailable: skipped.unavailable
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error writing explore embeds", detail: String(e) });
  }
}
