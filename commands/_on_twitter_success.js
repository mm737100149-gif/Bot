/*CMD
  command: /on_twitter_success
  help: معالج استلام تغريدات تويتر/X من Nitter RSS وصياغتها ونشرها في قناة الجامعة حصراً مع الصور
  need_reply: false
  auto_retry_time: 
  folder: 
  answer: 
  keyboard: 
  aliases: 
CMD*/

if (!content) return;

// params = univ_id|handle
var raw_params = (params || "").trim();
var p_parts = raw_params.split("|");
var univ_id = p_parts[0] ? p_parts[0].trim() : "";
var handle = p_parts[1] ? p_parts[1].trim().toLowerCase() : "";
if (!handle) return;

var univ_projects = Bot.getProperty("university_projects", []);
var target_univ = null;
for (var u = 0; u < univ_projects.length; u++) {
  if (univ_projects[u].id === univ_id) {
    target_univ = univ_projects[u];
    break;
  }
}
// البحث بربط الحساب مباشرة إن لم يطابق المعرف
if (!target_univ) {
  for (var u2 = 0; u2 < univ_projects.length; u2++) {
    var tw_list = univ_projects[u2].twitter_sources || [];
    for (var s = 0; s < tw_list.length; s++) {
      if (tw_list[s].replace(/^@/, "").toLowerCase() === handle) {
        target_univ = univ_projects[u2];
        break;
      }
    }
    if (target_univ) break;
  }
}
// 🛡️ عزل صارم: حساب تويتر غير مربوط بأي جامعة → لا نشر إطلاقاً (لا نستخدم "أول جامعة" هنا)
if (!target_univ) return;

function cleanHtml(html) {
  if (!html) return "";
  var s = html;
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/&nbsp;/g, " ");
  return s.trim();
}

function extractFirstImage(html) {
  if (!html) return "";
  var m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && m[1] && m[1].indexOf("emoji") === -1) {
    var url = m[1];
    if (url.indexOf("//") === 0) url = "https:" + url;
    return url;
  }
  return "";
}

// استخراج عناصر التغريدات من الـ RSS
var safe_content = content.length > 20000 ? content.substring(0, 20000) : content;
var item_chunks = safe_content.split("<item>");

var last_seen_key = "tw_last_" + handle;
var last_seen = Bot.getProperty(last_seen_key, "");

var found_tweet = null;
for (var idx = 1; idx < item_chunks.length && idx <= 6; idx++) {
  var item_str = item_chunks[idx].split("</item>")[0];

  function grab(tag) {
    var a = item_str.indexOf("<" + tag + ">");
    var b = item_str.indexOf("</" + tag + ">");
    if (a === -1 || b === -1) return "";
    return item_str.substring(a + tag.length + 2, b);
  }

  var raw_title = cleanHtml(grab("title"));
  var raw_desc_raw = grab("description");
  var raw_desc = cleanHtml(raw_desc_raw);
  var raw_link = cleanHtml(grab("link"));
  var raw_guid = cleanHtml(grab("guid")) || raw_link;
  var img_url = extractFirstImage(raw_desc_raw);

  // إزالة روابط الصور من النص
  raw_desc = raw_desc.replace(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)\S*/gi, "").trim();

  var full_text = (raw_title + "\n" + raw_desc).trim();
  if (!full_text || full_text.length < 15) continue;

  // 🛡️ منع التكرار ببصمة التغريدة
  var seen_key = "seen_tw_" + encodeURIComponent((raw_guid || full_text).slice(0, 40));
  if (Bot.getProperty(seen_key)) continue;

  // فحص الصلة بالجامعة (الحساب مربوط أصلاً، لكن نمنع الريتويت الدعائي الصريح)
  if (raw_title.indexOf("RT @") === 0) {
    var lower_full = full_text.toLowerCase();
    var relevant = lower_full.indexOf(target_univ.name.toLowerCase()) !== -1;
    if (!relevant) {
      for (var k = 0; k < (target_univ.keywords || []).length; k++) {
        var kw = target_univ.keywords[k].toLowerCase();
        if (kw.length >= 4 && lower_full.indexOf(kw) !== -1) { relevant = true; break; }
      }
    }
    if (!relevant) continue;
  }

  Bot.setProperty(seen_key, true, "boolean");
  found_tweet = { text: full_text, image: img_url, guid: raw_guid };
  if (!last_seen) { Bot.setProperty(last_seen_key, raw_guid, "string"); }
  break;
}

if (!found_tweet) {
  Bot.sendMessage("ℹ️ **تويتر @" + handle + "**: لا توجد تغريدات جديدة مرتبطة بـ " + target_univ.name + " حالياً.");
  return;
}

Bot.setProperty(last_seen_key, found_tweet.guid || last_seen, "string");

// 🗝️ سياق فريد للتغريدة
var ctx_id = "ctx_tw_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
Bot.setProperty(ctx_id, {
  media_type: found_tweet.image ? "photo" : "text",
  media_id: found_tweet.image || "",
  raw_text: found_tweet.text,
  targets: [target_univ.target_channel],
  target_univ: target_univ.name,
  source_origin: "x.com/" + handle,
  created_at: Date.now()
}, "json");

var base_url = Bot.getProperty("ai_base_url", "https://api.hcnsec.cn/v1");
var api_key = Bot.getProperty("ai_api_key", "");
var current_model = Bot.getProperty("ai_model", "DeepSeek-V4-Flash");

if (!api_key) {
  Bot.sendMessage("⚠️ مفتاح الذكاء الاصطناعي غير مضبوط. استخدم /set_api_key لضبطه أولاً.");
  return;
}

var system_prompt = "أنت محرر محتوى أكاديمي رسمي مخصص حصراً لطلاب: (" + target_univ.name + ").\n" +
  "هذه تغريدة من حساب تويتر/X مربوط بهذه الجامعة. صغها كمنشور إخباري أصيل:\n" +
  "1. عنوان بارز (📌) يلخص الخبر\n" +
  "2. نقاط واضحة ومباشرة دون أي ذكر لتويتر أو X أو الحسابات\n" +
  "3. احذف أي معرفات @ أو روابط ترويجية، واحتفظ بروابط البوابات الرسمية\n" +
  "4. دعوة تفاعلية قصيرة (💬) وهاشتاجات الجامعة\n" +
  "5. أكمل المنشور كاملاً دون قطع\n" +
  "قاعدة صارمة: إذا كانت التغريدة لا تخص الجامعة أو طلابها، رد بكلمة واحدة فقط: [IGNORED]";

HTTP.post({
  url: base_url.replace(/\/+$/, "") + "/chat/completions",
  headers: {
    "Authorization": "Bearer " + api_key,
    "Content-Type": "application/json"
  },
  body: {
    model: current_model,
    messages: [
      { role: "system", content: system_prompt },
      { role: "user", content: found_tweet.text }
    ],
    temperature: 0.3,
    max_tokens: 1400
  },
  success: "/on_ai_post_success " + ctx_id,
  error: "/on_ai_post_error " + ctx_id,
  background: true
});
