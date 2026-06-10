/**
 * test-connection.js
 * בדיקת חיבורים לפני deploy — הרץ לוקלית:
 *   CLAUDE_API_KEY=xxx WP_SITE_URL=xxx WP_USER=xxx WP_APP_PASSWORD=xxx node test-connection.js
 */

import fetch from 'node-fetch';

const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
};

async function testClaude() {
  console.log(colors.blue('\n🤖 בודק Claude API...'));
  const key = process.env.CLAUDE_API_KEY;
  if (!key) { console.log(colors.red('❌ CLAUDE_API_KEY חסר')); return false; }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'ענה רק: "חיבור תקין"' }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(colors.red(`❌ Claude: HTTP ${res.status} — ${err.substring(0, 100)}`));
      return false;
    }

    const data = await res.json();
    console.log(colors.green(`✅ Claude עובד! תגובה: ${data.content[0].text}`));
    return true;
  } catch (e) {
    console.log(colors.red(`❌ Claude שגיאת רשת: ${e.message}`));
    return false;
  }
}

async function testWordPress() {
  console.log(colors.blue('\n📝 בודק WordPress REST API...'));

  const site = process.env.WP_SITE_URL?.replace(/\/$/, '');
  const user = process.env.WP_USER;
  const pass = process.env.WP_APP_PASSWORD;

  if (!site || !user || !pass) {
    console.log(colors.red('❌ חסרים: WP_SITE_URL / WP_USER / WP_APP_PASSWORD'));
    return false;
  }

  const auth = Buffer.from(`${user}:${pass}`).toString('base64');

  try {
    // בדיקת גישה ל-REST API
    const infoRes = await fetch(`${site}/wp-json/wp/v2/`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!infoRes.ok) {
      console.log(colors.red(`❌ WordPress: HTTP ${infoRes.status}`));
      return false;
    }

    // בדיקת הרשאות כתיבה — ניסיון ליצור פוסט draft ולמחוק אותו
    const draftRes = await fetch(`${site}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        title: '🧪 TEST — נמחק אוטומטית',
        content: 'בדיקת חיבור',
        status: 'draft',
      }),
    });

    if (!draftRes.ok) {
      const err = await draftRes.text();
      console.log(colors.red(`❌ WordPress write: HTTP ${draftRes.status} — ${err.substring(0, 150)}`));
      return false;
    }

    const draft = await draftRes.json();
    console.log(colors.green(`✅ WordPress עובד! Draft נוצר (ID: ${draft.id})`));

    // מחיקת ה-draft
    await fetch(`${site}/wp-json/wp/v2/posts/${draft.id}?force=true`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` },
    });
    console.log(colors.green(`🗑️  Draft נמחק (ID: ${draft.id})`));
    return true;
  } catch (e) {
    console.log(colors.red(`❌ WordPress שגיאת רשת: ${e.message}`));
    return false;
  }
}

async function testTopics() {
  console.log(colors.blue('\n📚 בודק מערכת נושאים...'));
  try {
    const { getTotalTopics, getTopicForRun } = await import('./topics.js');
    const total = getTotalTopics();
    const sample = getTopicForRun(0);
    console.log(colors.green(`✅ ${total} נושאים זמינים`));
    console.log(`   דוגמה: "${sample.topic}" (${sample.categoryHebrew})`);
    return true;
  } catch (e) {
    console.log(colors.red(`❌ שגיאה בטעינת נושאים: ${e.message}`));
    return false;
  }
}

async function main() {
  console.log(colors.yellow('=== Koh Samui Content Bot — בדיקת חיבורים ==='));

  const results = await Promise.all([
    testClaude(),
    testWordPress(),
    testTopics(),
  ]);

  const allOk = results.every(Boolean);
  console.log('\n' + (allOk
    ? colors.green('🎉 הכל עובד! מוכן לדפלוי.')
    : colors.red('⚠️  יש בעיות — תקן לפני דפלוי.')));
}

main();
