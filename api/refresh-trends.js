export const maxDuration = 60;

// -------- Source 1: beauty publication RSS feeds (article/news cards) -----
const FEEDS = [
  { name: "Allure", url: "https://www.allure.com/feed/rss" },
  { name: "Byrdie", url: "https://feeds-api.dotdashmeredith.com/v1/rss/google/6772aca0-2ce6-4ccc-8a40-d5556ba3a9c7" },
  { name: "Oprah Daily", url: "https://www.oprahdaily.com/rss/beauty.xml" },
  { name: "Self", url: "https://www.self.com/feed/rss" },
  { name: "Glamour", url: "https://www.glamour.com/feed/rss" },
  { name: "Teen Vogue", url: "https://www.teenvogue.com/feed/rss" }
];
const ITEMS_PER_FEED = 4;
const MAX_NEWS = 10;

// -------- Source 2: curated real creator posts (TikTok/X post cards) ------
// Hand-reviewed for organic, non-sponsored captions. TikTok/X don't offer a
// free, keyless way to auto-discover "latest posts by hashtag," so this list
// has to be maintained manually - add more { platform, url, creator, topic }
// entries over time. Every post is still re-checked for sponsorship signals
// at fetch time below using the real caption pulled from its own oEmbed
// response, not just this list.
const CURATED_POSTS = [
  { platform: "tiktok", topic: "Clean Girl Makeup", url: "https://www.tiktok.com/@kiranakuhn/video/7652175235453603073", creator: "@kiranakuhn" },
  { platform: "tiktok", topic: "Clean Girl Makeup", url: "https://www.tiktok.com/@.aluthajade/video/7653488408127409430", creator: "@.aluthajade" },
  { platform: "tiktok", topic: "Clean Girl Makeup", url: "https://www.tiktok.com/@itziardeclavijo/video/7651310989270420749", creator: "@itziardeclavijo" },
  { platform: "tiktok", topic: "Clean Girl Makeup", url: "https://www.tiktok.com/@chskchii/video/7660114964182551829", creator: "@chskchii" },
  { platform: "tiktok", topic: "Clean Girl Makeup", url: "https://www.tiktok.com/@taomiekay/video/7661653262562626838", creator: "@taomiekay" },
  { platform: "tiktok", topic: "Clean Girl Makeup", url: "https://www.tiktok.com/@nath.livermorex/video/7652330699407510806", creator: "@nath.livermorex" },
  { platform: "tiktok", topic: "Clean Girl Makeup", url: "https://www.tiktok.com/@jazamaya/video/7654991837320547615", creator: "@jazamaya" },
  { platform: "tiktok", topic: "Clean Girl Makeup", url: "https://www.tiktok.com/@delylahd/video/7661394302450289951", creator: "@delylahd" },
  { platform: "tiktok", topic: "Clean Girl Makeup", url: "https://www.tiktok.com/@pinka_zefirka/video/7637101633301695766", creator: "@pinka_zefirka" },
  { platform: "tiktok", topic: "Clean Girl Makeup", url: "https://www.tiktok.com/@hrileylynn/video/7659911135742758175", creator: "@hrileylynn" },
  { platform: "tiktok", topic: "Clean Girl Makeup", url: "https://www.tiktok.com/@thebreebush/video/7639008658231201037", creator: "@thebreebush" },
  { platform: "tiktok", topic: "Clean Girl Makeup", url: "https://www.tiktok.com/@raychen.lei/video/7651863152203779360", creator: "@raychen.lei" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@jennimonrolls/video/7654110829050203423", creator: "@jennimonrolls" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@ariellelorre/video/7652957487313849631", creator: "@ariellelorre" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@milkydew/video/7659911287975054622", creator: "@milkydew" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@unfilteredkendoll/video/7661773867425254670", creator: "@unfilteredkendoll" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@theglowscout/video/7659590553377475870", creator: "@theglowscout" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@nate2trey_/video/7659961794370358542", creator: "@nate2trey_" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@debs_hy/video/7652396407944383757", creator: "@debs_hy" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@37.sena/video/7660583926750121237", creator: "@37.sena" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@with.victoria/video/7660157520924708109", creator: "@with.victoria" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@silver_sister_says/video/7650575024243445022", creator: "@silver_sister_says" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@mindaylee_/video/7651994027121741074", creator: "@mindaylee_" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@heavenmarleyy/video/7655718856220052749", creator: "@heavenmarleyy" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@kendra_beauty1/video/7657567134939090189", creator: "@kendra_beauty1" },
  { platform: "tiktok", topic: "Skincare Routine", url: "https://www.tiktok.com/@rocio.roses/video/7642879491794160926", creator: "@rocio.roses" }
];
const MAX_POSTS = 14;

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
    if (!data.html) return null;
    return data;
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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function buildNewsRows() {
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

  const rows = [];
  for (const item of deduped) {
    if (rows.length >= MAX_NEWS) break;

    let platform = "news";
    let embedUrl = null;
    let embedHtml = null;

    const found = await findEmbedForItem(item);
    if (found) {
      platform = found.platform;
      embedUrl = found.url;
      if (platform === "twitter" || platform === "tiktok") {
        const oembed = await fetchOembed(platform, found.url);
        embedHtml = oembed ? oembed.html : null;
      }
    }

    const sponsoredSignal =
      isLikelySponsored(item.title) ||
      isLikelySponsored(item.rawContent) ||
      isLikelySponsored(embedHtml);
    if (sponsoredSignal) continue;

    rows.push({
      trend_name: item.title.slice(0, 200),
      summary: stripHtml(item.rawContent).slice(0, 400) || null,
      platform,
      source_name: item.sourceName,
      source_url: item.link,
      embed_url: embedUrl,
      embed_html: embedHtml
    });
  }

  return { rows, feedsOk: FEEDS.length - errors.length, feedsFailed: errors };
}

async function buildPostRows() {
  const candidates = shuffle(CURATED_POSTS);
  const rows = [];
  const skipped = { sponsored: 0, unavailable: 0 };

  for (const post of candidates) {
    if (rows.length >= MAX_POSTS) break;

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

    const platformLabel = post.platform === "tiktok" ? "TikTok" : post.platform === "twitter" ? "X" : post.platform;

    rows.push({
      trend_name: post.topic,
      summary: captionText.slice(0, 400) || null,
      platform: post.platform,
      source_name: `${platformLabel} - ${post.creator}`,
      source_url: post.url,
      embed_url: post.url,
      embed_html: oembed.html
    });
  }

  return { rows, candidatesChecked: candidates.length, skipped };
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

  const [news, posts] = await Promise.all([buildNewsRows(), buildPostRows()]);

  // Interleave articles and posts so the feed is mixed rather than segregated.
  const combined = [];
  const maxLen = Math.max(news.rows.length, posts.rows.length);
  for (let i = 0; i < maxLen; i++) {
    if (posts.rows[i]) combined.push(posts.rows[i]);
    if (news.rows[i]) combined.push(news.rows[i]);
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = combined.map((row, i) => ({
    ...row,
    rank: i + 1,
    captured_date: today
  }));

  try {
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
      newsInserted: news.rows.length,
      postsInserted: posts.rows.length,
      feedsOk: news.feedsOk,
      feedsFailed: news.feedsFailed,
      postsCandidatesChecked: posts.candidatesChecked,
      postsSkippedSponsored: posts.skipped.sponsored,
      postsSkippedUnavailable: posts.skipped.unavailable
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error writing trends", detail: String(e) });
  }
}
