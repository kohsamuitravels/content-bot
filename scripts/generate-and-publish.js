import fetch from 'node-fetch';
import fs from 'fs';
import { getTopicForRun, getTotalTopics, CATEGORIES } from './topics.js';

// ---- לוגר ----
const logs = [];
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logs.push(line);
}
function saveLogs() {
  fs.writeFileSync('last-run.log', logs.join('\n'), 'utf8');
}

// ---- קביעת נושא ----
function selectTopic() {
  const override = process.env.TOPIC_OVERRIDE?.trim();
  const catOverride = process.env.CATEGORY_OVERRIDE?.trim();

  if (override && catOverride && CATEGORIES[catOverride]) {
    log(`🎯 נושא ידני: "${override}" | קטגוריה: ${catOverride}`);
    return {
      category: catOverride,
      categorySlug: CATEGORIES[catOverride].wpSlug,
      categoryHebrew: CATEGORIES[catOverride].hebrewName,
      topic: override,
      topicIndex: 0,
    };
  }

  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const hourSlot = Math.floor(now.getUTCHours() / 7);
  const runNumber = dayOfYear * 3 + hourSlot;

  const selected = getTopicForRun(runNumber);
  log(`🔄 רוטציה #${runNumber} מתוך ${getTotalTopics()} נושאים`);
  log(`📌 נושא: "${selected.topic}" | קטגוריה: ${selected.categoryHebrew}`);
  return selected;
}

// ---- בניית פרומפט ----
function buildPrompt(topicData) {
  return `אתה כותב תוכן מקצועי לאתר תיירות ישראלי בשם "Koh Samui Travels".
הקהל: ישראלים שמתכננים טיול לקוסמוי, תאילנד.
שפה: עברית תקינה, קולחת, חמה ואישית.

כתוב מאמר בלוג על הנושא:
"${topicData.topic}"
קטגוריה: ${topicData.categoryHebrew}

דרישות:
- אורך: 600-900 מילים (לא יותר!)
- כותרות משנה עם <h2> ו-<h3>
- רשימות עם <ul><li> כשרלוונטי
- טיפים פרקטיים עם מחירים בבהט ושמות מקומות
- סיום עם משפט CTA אחד

החזר JSON בדיוק בפורמט הזה (ללא backticks, ללא טקסט נוסף לפני או אחרי):
{"title":"כותרת כאן","excerpt":"תקציר 1-2 משפטים כאן","content":"HTML כאן","seoDescription":"תיאור עד 155 תווים"}

חשוב מאוד: בתוך ה-content אל תשתמש במרכאות כפולות - השתמש רק במרכאות בודדות לתוך ה-HTML.`;
}

// ---- קריאה ל-Claude API ----
async function generateArticle(prompt) {
  log('🤖 שולח בקשה ל-Claude API...');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API שגיאה ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText = data.content[0].text.trim();
  log('✅ קיבלנו תגובה מ-Claude');
  log(`📏 אורך תגובה: ${rawText.length} תווים`);

  let cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    log(`❌ שגיאת JSON: ${e.message}`);
    log(`Raw (300 תווים): ${rawText.substring(0, 300)}`);
    throw new Error('Claude לא החזיר JSON תקני');
  }
}

// ---- מציאת/יצירת Category ID ב-WP ----
async function getOrCreateCategory(slug, name, wpBase, auth) {
  const searchRes = await fetch(
    `${wpBase}/wp-json/wp/v2/categories?slug=${slug}&per_page=1`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  const existing = await searchRes.json();

  if (existing.length > 0) {
    log(`📁 קטגוריה קיימת: ${name} (ID: ${existing[0].id})`);
    return existing[0].id;
  }

  const createRes = await fetch(`${wpBase}/wp-json/wp/v2/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({ name, slug }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`שגיאה ביצירת קטגוריה: ${err}`);
  }

  const newCat = await createRes.json();
  log(`✨ קטגוריה נוצרה: ${name} (ID: ${newCat.id})`);
  return newCat.id;
}

// ---- פרסום ל-WordPress ----
async function publishToWordPress(article, topicData) {
  const wpBase = process.env.WP_SITE_URL.replace(/\/$/, '');
  const auth = Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');

  log(`📤 מפרסם ל-WordPress: ${wpBase}`);

  const categoryId = await getOrCreateCategory(
    topicData.categorySlug,
    topicData.categoryHebrew,
    wpBase,
    auth
  );

  const postData = {
    title: article.title,
    content: article.content,
    excerpt: article.excerpt,
    status: 'publish',
    categories: [categoryId],
    tags: [],
    meta: {
      _yoast_wpseo_metadesc: article.seoDescription || '',
    },
    comment_status: 'open',
    ping_status: 'closed',
  };

  const response = await fetch(`${wpBase}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(postData),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`WordPress API שגיאה ${response.status}: ${err}`);
  }

  const post = await response.json();
  log(`🎉 מאמר פורסם בהצלחה!`);
  log(`   כותרת: ${post.title.rendered}`);
  log(`   URL: ${post.link}`);
  log(`   ID: ${post.id}`);
  return post;
}

// ---- Main ----
async function main() {
  log('🌴 Koh Samui Content Bot — מתחיל...');

  const required = ['CLAUDE_API_KEY', 'WP_SITE_URL', 'WP_USER', 'WP_APP_PASSWORD'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`חסר משתנה סביבה: ${key}`);
  }

  try {
    const topicData = selectTopic();
    const prompt = buildPrompt(topicData);
    const article = await generateArticle(prompt);
    log(`📝 כותרת: "${article.title}"`);
    await publishToWordPress(article, topicData);
    log('✅ ריצה הסתיימה בהצלחה!');
  } catch (err) {
    log(`❌ שגיאה: ${err.message}`);
    saveLogs();
    process.exit(1);
  }

  saveLogs();
}

main();
