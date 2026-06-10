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
    log(`🎯 נושא ידני: "${override}" | ${catOverride}`);
    return {
      category: catOverride,
      categorySlug: CATEGORIES[catOverride].wpSlug,
      categoryHebrew: CATEGORIES[catOverride].hebrewName,
      topic: override,
    };
  }
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const runNumber = dayOfYear * 20 + Math.floor(now.getUTCHours() / 1.2);
  const selected = getTopicForRun(runNumber);
  log(`🔄 ריצה #${runNumber} | נושא: "${selected.topic}" | ${selected.categoryHebrew}`);
  return selected;
}

function buildPrompt(topicData) {
  return `אתה דני כהן — כתב תיירות ישראלי בכיר, 15 שנות ניסיון.
גרת בקוסמוי 3 חודשים ב-2024. מכיר כל פינה. כתבת לטיים אאוט, ynet טיול, ערוץ 12.

כתוב מאמר לאתר "Koh Samui Travels" (koh-samui-travels.com):
נושא: "${topicData.topic}"
קטגוריה: ${topicData.categoryHebrew}

כללי כתיבה:
שפה: עברית שוטפת, חמה, בגוף ראשון כשמוסיף אמינות
אורך: 900-1,100 מילים
פתיחה: סצנה ספציפית, שאלה מפתיעה, או עובדה שרוב האנשים לא יודעים

מבנה חובה:
1. פתיח מושך (2-3 משפטים) - לא "קוסמוי היא יעד פופולרי"
2. 3-4 כותרות h2 ברורות
3. כותרת h3 "הטיפ שאיש לא אומר לך" - משהו שרק מי שגר שם יודע
4. כותרת h3 "מה חדש ב-2025" - עדכון אמיתי
5. טבלה השוואתית אחת לפחות כשרלוונטי
6. CTA טבעי בסוף - לא מכירתי

פרטים חובה:
- מחירים ספציפיים: "300-450 בהט (כ-30-45 שקל)", לא "כ-X בהט"
- שמות מקומות: תעתיק עברי + אנגלית בסוגריים
- שעות פתיחה כשרלוונטי
- הימנע מ: "מומלץ מאוד", "חוויה בלתי נשכחת", "מגוון רחב"

מותאם לחיפוש AI:
- כלול שאלה ותשובה ישירה בפורמט FAQ לפחות פעם אחת
- כתוב משפט תשובה ישיר לשאלה הכי סבירה על הנושא
- השתמש ב-strong למילות מפתח עיקריות

החזר בדיוק כך, ללא טקסט נוסף:

<TITLE>כותרת SEO מושכת עד 60 תווים</TITLE>

<FOCUS_KEYWORD>מילת המפתח הראשית 3-4 מילים בעברית</FOCUS_KEYWORD>

<EXCERPT>תקציר 1-2 משפטים מושך עד 160 תווים</EXCERPT>

<CONTENT>
תוכן מלא ב-HTML עם h2 h3 p ul li strong table כשרלוונטי
</CONTENT>

<SEO_TITLE>כותרת SEO מלאה עד 60 תווים שונה מ-TITLE כולל מילת מפתח</SEO_TITLE>

<META_DESCRIPTION>תיאור מטא לגוגל 120-155 תווים כולל מילת מפתח מסתיים ב-CTA</META_DESCRIPTION>

<IMAGE_QUERY>3-4 מילים באנגלית לחיפוש תמונה מ-Unsplash</IMAGE_QUERY>`;
}

function parseResponse(text) {
  const extract = (tag) => {
    const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return m ? m[1].trim() : null;
  };

  const title = extract('TITLE');
  const content = extract('CONTENT');

  if (!title || !content) {
    log('⚠️ XML לא נמצא, מנסה JSON...');
    let cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const jm = cleaned.match(/\{[\s\S]*\}/);
    if (jm) {
      try {
        const p = JSON.parse(jm[0]);
        if (p.title && p.content) {
          log(`✅ JSON fallback — כותרת: "${p.title}"`);
          return {
            title: p.title,
            focusKeyword: p.focusKeyword || '',
            excerpt: p.excerpt || p.title,
            content: p.content,
            seoTitle: p.seoTitle || p.title,
            metaDescription: p.metaDescription || '',
            imageQuery: p.imageQuery || 'koh samui thailand beach',
          };
        }
      } catch (e) {
        log(`❌ JSON נכשל: ${e.message}`);
      }
    }
    log(`Raw (300): ${text.substring(0, 300)}`);
    throw new Error('לא הצלחנו לפרסר את תגובת Claude');
  }

  log(`✅ XML פורסר — כותרת: "${title}"`);
  return {
    title,
    focusKeyword: extract('FOCUS_KEYWORD') || '',
    excerpt: extract('EXCERPT') || title,
    content,
    seoTitle: extract('SEO_TITLE') || title,
    metaDescription: extract('META_DESCRIPTION') || '',
    imageQuery: extract('IMAGE_QUERY') || 'koh samui thailand',
  };
}

async function generateArticle(prompt) {
  log('🤖 קורא ל-Claude...');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.content[0].text.trim();
  log(`✅ תגובה: ${raw.length} תווים`);
  return parseResponse(raw);
}

async function fetchUnsplashImage(query) {
  const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
  if (!UNSPLASH_KEY) {
    log('⚠️ אין UNSPLASH_ACCESS_KEY — ממשיך בלי תמונה');
    return null;
  }
  try {
    const q = encodeURIComponent(`${query} thailand`);
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data.results?.[0];
    if (!photo) return null;
    log(`📸 תמונה נמצאה: by ${photo.user.name}`);
    return {
      url: photo.urls.regular,
      alt: photo.alt_description || query,
      credit: photo.user.name,
    };
  } catch (e) {
    log(`⚠️ Unsplash שגיאה: ${e.message}`);
    return null;
  }
}

async function uploadImageToWP(imageData, wpBase, auth) {
  if (!imageData) return null;
  try {
    const imgRes = await fetch(imageData.url);
    if (!imgRes.ok) return null;
    const buffer = await imgRes.buffer();

    const uploadRes = await fetch(`${wpBase}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="koh-samui-${Date.now()}.jpg"`,
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      log(`⚠️ WP Media upload נכשל: ${uploadRes.status}`);
      return null;
    }

    const media = await uploadRes.json();
    log(`📸 תמונה הועלתה ל-WP: ID ${media.id}`);

    await fetch(`${wpBase}/wp-json/wp/v2/media/${media.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ alt_text: imageData.alt }),
    });

    return media.id;
  } catch (e) {
    log(`⚠️ שגיאת העלאת תמונה: ${e.message}`);
    return null;
  }
}

async function getOrCreateCategory(slug, name, wpBase, auth) {
  const r = await fetch(`${wpBase}/wp-json/wp/v2/categories?slug=${slug}&per_page=1`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const existing = await r.json();
  if (existing.length > 0) {
    log(`📁 קטגוריה: ${name} (${existing[0].id})`);
    return existing[0].id;
  }
  const cr = await fetch(`${wpBase}/wp-json/wp/v2/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ name, slug }),
  });
  const cat = await cr.json();
  log(`✨ קטגוריה חדשה: ${name} (${cat.id})`);
  return cat.id;
}

function buildFAQSchema(content, pageTitle) {
  const faqMatches = [...content.matchAll(/<h3[^>]*>([^<]*\?[^<]*)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi)];
  if (faqMatches.length === 0) return null;

  const questions = faqMatches.slice(0, 5).map(m => ({
    '@type': 'Question',
    name: m[1].replace(/<[^>]*>/g, '').trim(),
    acceptedAnswer: {
      '@type': 'Answer',
      text: m[2].replace(/<[^>]*>/g, '').trim().substring(0, 300),
    },
  }));

  if (questions.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    name: pageTitle,
    mainEntity: questions,
  };
}

async function publishToWordPress(article, topicData, featuredImageId) {
  const wpBase = process.env.WP_SITE_URL.replace(/\/$/, '');
  const auth = Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');

  log('📤 מפרסם ל-WordPress...');
  const categoryId = await getOrCreateCategory(
    topicData.categorySlug, topicData.categoryHebrew, wpBase, auth
  );

  const faqSchema = buildFAQSchema(article.content, article.title);
  const contentWithSchema = article.content + (faqSchema
    ? `\n<!-- wp:html -->\n<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>\n<!-- /wp:html -->`
    : '');

  const postData = {
    title: article.title,
    content: contentWithSchema,
    excerpt: article.excerpt,
    status: 'publish',
    categories: [categoryId],
    comment_status: 'open',
    ping_status: 'closed',
    meta: {
      _yoast_wpseo_title: article.seoTitle,
      _yoast_wpseo_metadesc: article.metaDescription,
      _yoast_wpseo_focuskw: article.focusKeyword,
    },
  };

  if (featuredImageId) {
    postData.featured_media = featuredImageId;
  }

  const res = await fetch(`${wpBase}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify(postData),
  });

  if (!res.ok) throw new Error(`WP ${res.status}: ${await res.text()}`);
  const post = await res.json();

  // עדכון Yoast SEO בנפרד (פעמיים לוודא שנשמר)
  if (article.focusKeyword || article.metaDescription) {
    try {
      await fetch(`${wpBase}/wp-json/wp/v2/posts/${post.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          meta: {
            _yoast_wpseo_focuskw: article.focusKeyword,
            _yoast_wpseo_metadesc: article.metaDescription,
            _yoast_wpseo_title: article.seoTitle,
          },
        }),
      });
      log('✅ Yoast SEO עודכן');
    } catch (e) {
      log(`⚠️ Yoast עדכון נכשל: ${e.message}`);
    }
  }

  log(`🎉 פורסם!`);
  log(`   כותרת: ${post.title.rendered}`);
  log(`   URL: ${post.link}`);
  log(`   מילת מפתח: ${article.focusKeyword}`);
  log(`   תמונה: ${featuredImageId ? 'כן' : 'לא'}`);
  return post;
}

async function main() {
  log('🌴 Koh Samui Content Bot v4 — מתחיל');

  const required = ['CLAUDE_API_KEY', 'WP_SITE_URL', 'WP_USER', 'WP_APP_PASSWORD'];
  for (const k of required) {
    if (!process.env[k]) throw new Error(`חסר: ${k}`);
  }

  try {
    const topicData = selectTopic();
    const article = await generateArticle(buildPrompt(topicData));

    log(`🔍 מחפש תמונה: "${article.imageQuery}"...`);
    const imageData = await fetchUnsplashImage(article.imageQuery);

    const wpBase = process.env.WP_SITE_URL.replace(/\/$/, '');
    const auth = Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
    const featuredImageId = await uploadImageToWP(imageData, wpBase, auth);

    await publishToWordPress(article, topicData, featuredImageId);

    log('✅ הצלחה מלאה!');
    log(`   📝 כותרת: ${article.title}`);
    log(`   🔑 מילת מפתח: ${article.focusKeyword}`);
    log(`   📸 תמונה: ${featuredImageId ? `ID ${featuredImageId}` : 'לא הועלתה'}`);
    log(`   📊 SEO: ${article.metaDescription ? 'הוגדר' : 'חסר'}`);

  } catch (err) {
    log(`❌ שגיאה: ${err.message}`);
    saveLogs();
    process.exit(1);
  }

  saveLogs();
}

main();
