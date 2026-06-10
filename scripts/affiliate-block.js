// ---- מיפוי קטגוריות לחיפושים ----
const CATEGORY_CONFIG = {
  beaches: {
    hotelKeywords: 'beachfront koh samui',
    hotelFilter: 'beach',
    viatorKeywords: 'snorkeling kayak beach koh samui',
    hebrewLabel: 'מלונות על הים בקוסמוי',
    activityLabel: 'פעילויות ימיות — הזמן מראש',
  },
  attractions: {
    hotelKeywords: 'koh samui central',
    hotelFilter: 'central',
    viatorKeywords: 'tours attractions koh samui',
    hebrewLabel: 'מלונות מומלצים בקוסמוי',
    activityLabel: 'טיולים ואטרקציות — הזמן מראש',
  },
  food: {
    hotelKeywords: 'koh samui chaweng',
    hotelFilter: 'chaweng',
    viatorKeywords: 'food tour cooking class koh samui',
    hebrewLabel: 'מלונות ליד מרכז הבילוי',
    activityLabel: 'סיורי אוכל ובישול',
  },
  transport: {
    hotelKeywords: 'koh samui airport near',
    hotelFilter: 'airport',
    viatorKeywords: 'private transfer tour koh samui',
    hebrewLabel: 'מלונות נוחים לתחבורה',
    activityLabel: 'העברות פרטיות וטיולים',
  },
  lifestyle: {
    hotelKeywords: 'koh samui long stay villa',
    hotelFilter: 'villa',
    viatorKeywords: 'lifestyle experience local koh samui',
    hebrewLabel: 'וילות ומלונות לשהות ארוכה',
    activityLabel: 'חוויות מקומיות אותנטיות',
  },
  spa: {
    hotelKeywords: 'koh samui spa wellness resort',
    hotelFilter: 'spa',
    viatorKeywords: 'spa massage wellness koh samui',
    hebrewLabel: 'ריזורטים עם ספא מובנה',
    activityLabel: 'עיסויים וטיפולי ספא',
  },
  itinerary: {
    hotelKeywords: 'koh samui best rated resort',
    hotelFilter: 'resort',
    viatorKeywords: 'full day tour koh samui',
    hebrewLabel: 'מלונות מומלצים למסלול',
    activityLabel: 'טיולים מאורגנים — יום מלא',
  },
  practical: {
    hotelKeywords: 'koh samui budget comfortable',
    hotelFilter: 'budget',
    viatorKeywords: 'airport transfer koh samui',
    hebrewLabel: 'מלונות נוחים ומשתלמים',
    activityLabel: 'העברות ושירותי הגעה',
  },
};

// ---- שליפת מלונות מ-Agoda ----
async function fetchHotels(category, siteId, apiKey, fetch) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.attractions;
  try {
    const url = `https://affiliateapi7643.agoda.com/affiliateservice/lt_v1?` +
      `site_id=${siteId}&` +
      `page_no=1&page_size=3&` +
      `city_id=17317&` + // Koh Samui city ID
      `sort_by=popularity&` +
      `currency=ILS&` +
      `language=he`;

    const res = await fetch(url, {
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    const hotels = data?.result?.properties?.slice(0, 3) || [];
    return { hotels, config };
  } catch (e) {
    return null;
  }
}

// ---- שליפת אטרקציות מ-Viator ----
async function fetchActivities(category, partnerId, apiKey, fetch) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.attractions;
  try {
    const res = await fetch('https://api.viator.com/partner/products/search', {
      method: 'POST',
      headers: {
        'Accept-Language': 'he-IL',
        'Accept': 'application/json;version=2.0',
        'exp-api-key': apiKey,
      },
      body: JSON.stringify({
        filtering: {
          destination: '5948', // Koh Samui destination ID
          tags: [],
          lowestPrice: 0,
          highestPrice: 5000,
        },
        sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
        pagination: { start: 1, count: 2 },
        currency: 'THB',
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const products = data?.products?.slice(0, 2) || [];
    return { products, config };
  } catch (e) {
    return null;
  }
}

// ---- בניית HTML של הבאנר ----
function buildAffiliateHTML(hotelsData, activitiesData, category, siteId) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.attractions;
  let html = `
<div style="margin-top:2rem; padding-top:1.5rem; border-top:2px solid #06B6D4; direction:rtl; text-align:right; font-family:Arial,sans-serif;">`;

  // --- מלונות ---
  if (hotelsData?.hotels?.length > 0) {
    html += `
  <h3 style="font-size:15px; color:#0891B2; margin:0 0 12px; font-weight:500;">
    🏨 ${config.hebrewLabel}
  </h3>
  <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:1.5rem;">`;

    for (const hotel of hotelsData.hotels) {
      const name = hotel.hotelName || hotel.name || 'מלון בקוסמוי';
      const stars = hotel.starRating || 4;
      const price = hotel.rateFrom ? `₪${Math.round(hotel.rateFrom)}` : 'בדוק מחיר';
      const link = `https://www.agoda.com/partners/partnersearch.aspx?site_id=${siteId}&hotel_id=${hotel.hotelId}&cid=1844104`;
      const starsHtml = '★'.repeat(Math.min(stars, 5)) + '☆'.repeat(Math.max(0, 5 - stars));

      html += `
    <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; font-size:13px;">
      <div style="background:linear-gradient(135deg,#0e7490,#06B6D4); height:70px; display:flex; align-items:center; justify-content:center; font-size:24px;">🏖️</div>
      <div style="padding:10px;">
        <div style="font-weight:500; line-height:1.3; margin-bottom:3px; color:#111;">${name.substring(0, 30)}</div>
        <div style="color:#f59e0b; font-size:11px; margin-bottom:4px;">${starsHtml}</div>
        <div style="color:#666; margin-bottom:8px;">מ-<strong style="color:#06B6D4;">${price}</strong>/לילה</div>
        <a href="${link}" target="_blank" rel="noopener sponsored"
           style="display:block; background:#06B6D4; color:white; text-align:center; padding:6px; border-radius:6px; text-decoration:none; font-weight:500;">
          הזמן ב-Agoda ←
        </a>
      </div>
    </div>`;
    }
    html += `</div>`;

  } else {
    // Fallback — קישור כללי לקוסמוי
    html += `
  <div style="margin-bottom:1.5rem;">
    <h3 style="font-size:15px; color:#0891B2; margin:0 0 10px; font-weight:500;">🏨 ${config.hebrewLabel}</h3>
    <a href="https://www.agoda.com/city/koh-samui-th.html?site_id=${siteId}&cid=1844104"
       target="_blank" rel="noopener sponsored"
       style="display:inline-block; background:#06B6D4; color:white; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:500;">
      🔍 חפש מלונות בקוסמוי ב-Agoda ←
    </a>
  </div>`;
  }

  // --- אטרקציות ---
  if (activitiesData?.products?.length > 0) {
    html += `
  <h3 style="font-size:15px; color:#0891B2; margin:0 0 12px; font-weight:500;">
    🎯 ${config.activityLabel}
  </h3>`;

    for (const product of activitiesData.products) {
      const name = product.title || 'טיול בקוסמוי';
      const rating = product.reviews?.combinedAverageRating?.toFixed(1) || '4.8';
      const reviewCount = product.reviews?.totalReviews || '';
      const price = product.pricing?.summary?.fromPrice
        ? `${Math.round(product.pricing.summary.fromPrice)} ฿`
        : 'בדוק מחיר';
      const link = product.productUrl || `https://www.viator.com/Koh-Samui-tours/d5948`;

      html += `
    <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:12px; display:flex; gap:12px; margin-bottom:8px; align-items:flex-start;">
      <div style="width:44px; height:44px; border-radius:8px; background:#f0fdff; border:1px solid #06B6D4; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">🗺️</div>
      <div style="flex:1;">
        <div style="font-weight:500; font-size:14px; color:#111; margin-bottom:2px;">${name.substring(0, 60)}</div>
        <div style="font-size:12px; color:#666; margin-bottom:5px;">⭐ ${rating}${reviewCount ? ` · ${reviewCount} ביקורות` : ''}</div>
        <div style="font-size:13px; color:#06B6D4; font-weight:500;">מ-${price} לאדם</div>
      </div>
      <a href="${link}" target="_blank" rel="noopener sponsored"
         style="background:#f0fdff; border:1px solid #06B6D4; color:#0891B2; padding:6px 14px; border-radius:6px; font-size:12px; font-weight:500; text-decoration:none; white-space:nowrap; flex-shrink:0; margin-top:4px;">
        הזמן ←
      </a>
    </div>`;
    }

  } else {
    // Fallback Viator
    html += `
  <div>
    <h3 style="font-size:15px; color:#0891B2; margin:0 0 10px; font-weight:500;">🎯 ${config.activityLabel}</h3>
    <a href="https://www.viator.com/Koh-Samui-tours/d5948?pid=${partnerId}&mcid=42383"
       target="_blank" rel="noopener sponsored"
       style="display:inline-block; background:#06B6D4; color:white; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:500;">
      🔍 גלה טיולים ואטרקציות בקוסמוי ←
    </a>
  </div>`;
  }

  html += `
  <p style="font-size:11px; color:#999; margin-top:12px; margin-bottom:0;">
    * המחירים משתנים לפי תאריך וזמינות. קישורים אלו הם שותפות — ללא עלות נוספת עבורך.
  </p>
</div>`;

  return html;
}

export { fetchHotels, fetchActivities, buildAffiliateHTML, CATEGORY_CONFIG };
