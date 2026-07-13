export const maxDuration = 60;

const FEEDS = [
  { name: "Allure", url: "https://www.allure.com/feed/rss" },
  { name: "Byrdie", url: "https://feeds-api.dotdashmeredith.com/v1/rss/google/6772aca0-2ce6-4ccc-8a40-d5556ba3a9c7" },
  { name: "Oprah Daily", url: "https://www.oprahdaily.com/rss/beauty.xml" },
  { name: "Self", url: "https://www.self.com/feed/rss" },
  { name: "Glamour", url: "https://www.glamour.com/feed/rss" },
  { name: "Teen Vogue", url: "https://www.teenvogue.com/feed/rss" }
];

const ITEMS_PER_FEED = 4;
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

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  let val = m[1].trim();
  const cdata = val.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) val = cdata[1];
  return val;
}

function parseRssItems(xml) {
  const items = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks) {
    const title = decodeEntities(stripHtml(extractTag(block, "title")));
    const link = stripHtml(extractTag(block, "link")) || (block.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "";
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "published") || "";
    const description = extractTag(block, "description") || extractTag(block, "content:encoded") || "";
    if (title && link) {
      items.push({ title, link, pubDate, rawContent: description });
    }
  }
  return items;
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

function findSocialEmbed(html) {
  if (!html) return null;
  const twitterMatch = html.match(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]+\/status\/\d+/i);
  if (twitterMatch) return { platform: "twitter", url: twitterMatch[0] };
  const tiktokMatch = html.match(/https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/i);
  if (tiktokMatch) return { platform: "tiktok", url: tiktokMatch[0] };
  const igMatch = html.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]+/i);
  if (igMatch) return { platform: "instagram", url: igMatch[0] };
  return null;
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
    return data.html || null;
  } catch {
    return null;
  }
}

async function findEmbedForItem(item) {
  const inline = findSocialEmbed(item.rawContent);
  if (inline) return inline;
  try {
    const r = await fetchWithTimeout(item.link);
    if (!r.ok) return null;
    const html = await r.text();
    return findSocialEmbed(html);
  } catch {
    return null;
  }
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

  const feedResults = [];
  const errors = [];

  for (const feed of FEEDS) {
    try {
      const r = await fetchWithTimeout(feed.url);
      if (!r.ok) {
        errors.push({ feed: feed.name, error: `HTTP ${r.status}` });
        continue;
      }
      const xml = await r.text();
      const items = parseRssItems(xml).slice(0, ITEMS_PER_FEED);
      for (const item of items) {
        feedResults.push({ ...item, sourceName: feed.name });
      }
    } catch (e) {
      errors.push({ feed: feed.name, error: String(e) });
    }
  }

  feedResults.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  const seenTitles = new Set();
  const deduped = [];
  for (const item of feedResults) {
    const key = item.title.toLowerCase().trim();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    deduped.push(item);
  }

  const top = deduped.slice(0, 16);

  const rows = [];
  let rank = 1;
  for (const item of top) {
    let platform = "news";
    let embedUrl = null;
    let embedHtml = null;

    const found = await findEmbedForItem(item);
    if (found) {
      platform = found.platform;
      embedUrl = found.url;
      if (platform === "twitter" || platform === "tiktok") {
        embedHtml = await fetchOembed(platform, found.url);
      }
    }

    rows.push({
      trend_name: item.title.slice(0, 200),
      summary: stripHtml(item.rawContent).slice(0, 400) || null,
      platform,
      source_name: item.sourceName,
      source_url: item.link,
      embed_url: embedUrl,
      embed_html: embedHtml,
      rank: rank++,
      captured_date: new Date().toISOString().slice(0, 10)
    });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    const delRes = await fetch(
      `${supabaseUrl}/rest/v1/trends?captured_date=eq.${today}`,
      {
        method: "DELETE",
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          prefer: "return=minimal"
        }
      }
    );
    if (!delRes.ok) {
      const t = await delRes.text();
      return res.status(502).json({ error: "Failed clearing today's trends", detail: t.slice(0, 500) });
    }

    if (rows.length > 0) {
      const insRes = await fetch(`${supabaseUrl}/rest/v1/trends`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
          prefer: "return=minimal"
        },
        body: JSON.stringify(rows)
      });
      if (!insRes.ok) {
        const t = await insRes.text();
        return res.status(502).json({ error: "Failed inserting trends", detail: t.slice(0, 500) });
      }
    }

    return res.status(200).json({
      inserted: rows.length,
      feedsOk: FEEDS.length - errors.length,
      feedsFailed: errors
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error writing trends", detail: String(e) });
  }
}

