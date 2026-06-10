import fetch from 'node-fetch';
import fs from 'fs';
import { getTopicForRun, getTotalTopics, CATEGORIES } from './topics.js';
import { fetchHotels, fetchActivities, buildAffiliateHTML } from './affiliate-block.js';

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
    log(`🎯 נושא ידני: "${override}" | קטגוריה: ${catOverride}`);
    return {
      category: catOverride,
      categorySlug: CATEGORIES[catOverride].wpSlug,
      categoryHebrew: CATEGORIES[catOverride].hebrewName,
      topic: override,
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

function buildPrompt(topicData) {
  return `אתה דני כהן — כתב תיירות ישראלי בכיר עם 15 שנות ניסיון.
כתבת לטיים אאוט תל אביב, נסיעות ותיירות, וערוץ 12.
גרת בקוסמוי 3 חודשים ב-2024 וחזרת לביקורים נוספים ב-2025.
אתה מכיר כל פינה של האי — לא רק את מה שכתוב בויקיפדיה.

המשימה: כתוב מאמר לאתר "Koh Samui Travels" על הנושא:
"${topicData.topic}"
קטגוריה: ${topicData.categoryHebrew}

כללי כתיבה:
- עברית שוטפת וטבעית, לא מתורגמת
- פתח עם משפט מושך שגורם לקורא להמשיך לקרוא
- כתוב בגוף ראשון כשזה מוסיף אמינות
- השתמש בשמות מקומות אמיתיים בתעתיק עברי + באנגלית בסוגריים
- מחירים ריאליים ב-2025: בבהט ובשקלים בערך (חלק ב-10 לקירוב)

מבנה חובה (700-900 מילים):
1. פתיח מושך — סצנה, שאלה, או עובדה מפתיעה (2-3 משפטים)
2. גוף מאמר עם 3-4 כותרות h2
3. לפחות קטע אחד עם כותרת h3 "הטיפ שאיש לא אומר לך"
4. טבלה השוואתית או רשימה מובנית כשרלוונטי
5. סקשן עם כותרת h3 "מה חדש ב-2025"
6. CTA אחד בסוף — קצר, טבעי, לא מכירתי

אסור לכתוב:
- "מסעדה מומלצת" בלי שם ספציפי
- "כ-X בהט" בלי מחיר ספציפי
- יותר מ-2 סימני קריאה בכל המאמר

החזר בדיוק במבנה הבא ללא שום טקסט לפני או אחרי:

<TITLE>כותרת מושכת, ספציפית, עד 60 תווים</TITLE>

<EXCERPT>תקציר 1-2 משפטים שגורמים לרצות לקרוא עוד</EXCERPT>

<CONTENT>
תוכן מלא ב-HTML — השתמש ב-h2, h3, p, ul, li, strong, table כשרלוונטי
</CONTENT>

<SEO>תיאור מטא טבעי עד 155 תווים, כולל מילת מפתח</SEO>`;
}

function parseResponse(text) {
  const extract = (tag) => {
    const match = text.match(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`));
    if (match) return match[0].replace(`<${tag}>`, '').replace(`</${tag}>`, '').trim();
    return null;
  };
  const titleXml = extract('TITLE');
  const contentXml = extract('CONTENT');

  if (titleXml && contentXml) {
    const excerpt = extract('EXCERPT');
    const seo = extract('SEO');
    log(`✅ פורסר XML — כותרת: "${titleXml}"`);
    return { title: titleXml, excerpt: excerpt || titleXml, content: contentXml, seoDescription: seo || '' };
  }

  // JSON fallback
  log('⚠️ XML לא נמצא, מנסה JSON...');
  let cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.title && parsed.content) {
      log(`✅ פורסר JSON — כותרת: "${parsed.title}"`);
      return { title: parsed.title, excerpt: parsed.excerpt || parsed.title, content: parsed.content, seoDescription: parsed.seoDescription || '' };
    }
  } catch (e) {
    log(`❌ JSON נכשל: ${e.message}`);
  }
  log(`Raw (300): ${text.substring(0, 300)}`);
  throw new Error('לא הצלחנו לפרסר את תגובת Claude');
}

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
  if (!response.ok) throw new Error(`Claude API שגיאה ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const rawText = data.content[0].text.trim();
  log(`✅ תגובה התקבלה (${rawText.length} תווים)`);
  return parseResponse(rawText);
}

async function getOrCreateCategory(slug, name, wpBase, auth) {
  const searchRes = await fetch(`${wpBase}/wp-json/wp/v2/categories?slug=${slug}&per_page=1`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const existing = await searchRes.json();
  if (existing.length > 0) {
    log(`📁 קטגוריה קיימת: ${name} (ID: ${existing[0].id})`);
    return existing[0].id;
  }
  const createRes = await fetch(`${wpBase}/wp-json/wp/v2/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ name, slug }),
  });
  if (!createRes.ok) throw new Error(`שגיאה ביצירת קטגוריה: ${await createRes.text()}`);
  const newCat = await createRes.json();
  log(`✨ קטגוריה נוצרה: ${name} (ID: ${newCat.id})`);
  return newCat.id;
}

async function publishToWordPress(article, topicData) {
  const wpBase = process.env.WP_SITE_URL.replace(/\/$/, '');
  const auth = Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
  log(`📤 מפרסם ל-WordPress...`);
  const categoryId = await getOrCreateCategory(topicData.categorySlug, topicData.categoryHebrew, wpBase, auth);
  const response = await fetch(`${wpBase}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      status: 'publish',
      categories: [categoryId],
      meta: { _yoast_wpseo_metadesc: article.seoDescription },
      comment_status: 'open',
      ping_status: 'closed',
    }),
  });
  if (!response.ok) throw new Error(`WordPress API שגיאה ${response.status}: ${await response.text()}`);
  const post = await response.json();
  log(`🎉 פורסם! כותרת: ${post.title.rendered}`);
  log(`   URL: ${post.link}`);
  log(`   ID: ${post.id}`);
  return post;
}

async function main() {
  log('🌴 Koh Samui Content Bot v3 — מתחיל...');
  const required = ['CLAUDE_API_KEY', 'WP_SITE_URL', 'WP_USER', 'WP_APP_PASSWORD', 'AGODA_SITE_ID', 'AGODA_API_KEY', 'VIATOR_API_KEY', 'VIATOR_PARTNER_ID'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`חסר משתנה סביבה: ${key}`);
  }

  try {
    const topicData = selectTopic();

    // 1. כתיבת המאמר
    const article = await generateArticle(buildPrompt(topicData));

    // 2. שליפת מלונות ואטרקציות במקביל
    log('🏨 שולף מלונות מ-Agoda...');
    log('🎯 שולף אטרקציות מ-Viator...');
    const [hotelsData, activitiesData] = await Promise.all([
      fetchHotels(topicData.category, process.env.AGODA_SITE_ID, process.env.AGODA_API_KEY, fetch),
      fetchActivities(topicData.category, process.env.VIATOR_PARTNER_ID, process.env.VIATOR_API_KEY, fetch),
    ]);

    if (hotelsData?.hotels?.length > 0) {
      log(`✅ ${hotelsData.hotels.length} מלונות נשלפו`);
    } else {
      log('⚠️ Agoda — fallback לקישור כללי');
    }
    if (activitiesData?.products?.length > 0) {
      log(`✅ ${activitiesData.products.length} אטרקציות נשלפו`);
    } else {
      log('⚠️ Viator — fallback לקישור כללי');
    }

    // 3. הוספת בלוק אפיליאציה לסוף המאמר
    const affiliateHTML = buildAffiliateHTML(
      hotelsData,
      activitiesData,
      topicData.category,
      process.env.AGODA_SITE_ID
    );
    article.content = article.content + affiliateHTML;
    log('💰 בלוק אפיליאציה הוסף למאמר');

    // 4. פרסום
    await publishToWordPress(article, topicData);
    log('✅ הצלחה!');
  } catch (err) {
    log(`❌ שגיאה: ${err.message}`);
    saveLogs();
    process.exit(1);
  }
  saveLogs();
}

main();
