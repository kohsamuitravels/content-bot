import fetch from 'node-fetch';
import fs from 'fs';
import { getTopicForRun, getTotalTopics, CATEGORIES } from './topics.js';

const logs = [];
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logs.push(line);
}
function saveLogs() {
  fs.writeFileSync('last-run.log', logs.join('\n'), 'utf8');
}

function selectTopic() {
  const override = process.env.TOPIC_OVERRIDE?.trim();
  const catOverride = process.env.CATEGORY_OVERRIDE?.trim();
  if (override && catOverride && CATEGORIES[catOverride]) {
    return { category: catOverride, categorySlug: CATEGORIES[catOverride].wpSlug, categoryHebrew: CATEGORIES[catOverride].hebrewName, topic: override };
  }
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const runNumber = dayOfYear * 3 + Math.floor(now.getUTCHours() / 7);
  const selected = getTopicForRun(runNumber);
  log(`🔄 רוטציה #${runNumber} | נושא: "${selected.topic}"`);
  return selected;
}

function buildPrompt(topicData) {
  return `אתה דני כהן — כתב תיירות ישראלי בכיר עם 15 שנות ניסיון.
גרת בקוסמוי 3 חודשים ב-2024. אתה מכיר כל פינה של האי.

כתוב מאמר לאתר "Koh Samui Travels" על: "${topicData.topic}"
קטגוריה: ${topicData.categoryHebrew}

כללי כתיבה:
- עברית שוטפת, חמה, בגוף ראשון
- שמות מקומות בתעתיק עברי + אנגלית בסוגריים
- מחירים ריאליים בבהט + שקלים (÷10)
- 700-900 מילים

מבנה חובה:
1. פתיח מושך (סצנה או שאלה)
2. 3-4 כותרות h2
3. קטע h3 "הטיפ שאיש לא אומר לך"
4. קטע h3 "מה חדש ב-2025"
5. CTA קצר בסוף

החזר בדיוק כך, ללא טקסט נוסף:

<TITLE>כותרת עד 60 תווים</TITLE>
<EXCERPT>תקציר 1-2 משפטים</EXCERPT>
<CONTENT>
HTML מלא כאן
</CONTENT>
<SEO>מטא תיאור עד 155 תווים</SEO>`;
}

function parseResponse(text) {
  const extract = (tag) => {
    const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return m ? m[1].trim() : null;
  };
  const title = extract('TITLE');
  const content = extract('CONTENT');
  if (!title || !content) throw new Error('חסר TITLE או CONTENT בתגובה');
  log(`✅ כותרת: "${title}"`);
  return { title, excerpt: extract('EXCERPT') || title, content, seoDescription: extract('SEO') || '' };
}

async function generateArticle(prompt) {
  log('🤖 קורא ל-Claude...');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  log(`✅ תגובה: ${data.content[0].text.length} תווים`);
  return parseResponse(data.content[0].text.trim());
}

async function getOrCreateCategory(slug, name, wpBase, auth) {
  const r = await fetch(`${wpBase}/wp-json/wp/v2/categories?slug=${slug}&per_page=1`, { headers: { Authorization: `Basic ${auth}` } });
  const existing = await r.json();
  if (existing.length > 0) { log(`📁 קטגוריה: ${name} (${existing[0].id})`); return existing[0].id; }
  const cr = await fetch(`${wpBase}/wp-json/wp/v2/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` }, body: JSON.stringify({ name, slug }) });
  const cat = await cr.json();
  log(`✨ קטגוריה חדשה: ${name} (${cat.id})`);
  return cat.id;
}

async function publishToWordPress(article, topicData) {
  const wpBase = process.env.WP_SITE_URL.replace(/\/$/, '');
  const auth = Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
  const categoryId = await getOrCreateCategory(topicData.categorySlug, topicData.categoryHebrew, wpBase, auth);
  const res = await fetch(`${wpBase}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ title: article.title, content: article.content, excerpt: article.excerpt, status: 'publish', categories: [categoryId] }),
  });
  if (!res.ok) throw new Error(`WP ${res.status}: ${await res.text()}`);
  const post = await res.json();
  log(`🎉 פורסם: ${post.link}`);
}

async function main() {
  log('🌴 Content Bot v4 — מתחיל');
  const required = ['CLAUDE_API_KEY', 'WP_SITE_URL', 'WP_USER', 'WP_APP_PASSWORD'];
  for (const k of required) if (!process.env[k]) throw new Error(`חסר: ${k}`);
  try {
    const topicData = selectTopic();
    const article = await generateArticle(buildPrompt(topicData));
    await publishToWordPress(article, topicData);
    log('✅ הצלחה!');
  } catch (err) {
    log(`❌ ${err.message}`);
    saveLogs();
    process.exit(1);
  }
  saveLogs();
}

main();
