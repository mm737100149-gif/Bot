/*CMD
  command: /on_ai_post_success
  help: معالج نجاح صياغة الذكاء ونشر المنشور في قناة الجامعة المستهدفة حصراً (نسخة مصححة - سياق فريد + دعم كل الوسائط + منع تكرار)
  need_reply: false
  auto_retry_time: 
  folder: 
  answer: 
  keyboard: 
  aliases: 
CMD*/

function cleanArabicAndWebGarbage(txt) {
  if (!txt) return "";
  var s = txt;
  // تنظيف الرموز المشوهة
  s = s.replace(/ߓ堙噈اعيد/g, "مواعيد");
  s = s.replace(/ߓꠙ嘰كرات/g, "مذكرات");
  s = s.replace(/ߎ㠘㙆ظمة/g, "أنظمة");
  s = s.replace(/[̀-ͯ]/g, "");
  s = s.replace(/[ࠀ-࿿]/g, "");
  s = s.replace(/[一-鿿]/g, "");
  s = s.replace(/[-￿]/g, "");

  // تنظيف مخلفات الويب وتويتر و&nbsp; وX
  s = s.replace(/&nbsp;\s*X/gi, "");
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/\s+X\s*$/g, "");
  s = s.replace(/\s+X\n/g, "\n");
  s = s.replace(/\bX\s*$/g, "");

  // تنظيف النقاط الفارغة
  var lines = s.split("\n");
  var clean_lines = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].trim();
    if (!l) {
      clean_lines.push("");
      continue;
    }
    if (l === "•" || l === "-" || l === "*" || l === "• " || l === "- " || l === "* ") {
      continue;
    }
    clean_lines.push(l);
  }

  // دمج الأسطر الفارغة المتتالية
  var res = clean_lines.join("\n").replace(/\n{3,}/g, "\n\n");
  return res.trim();
}

function toSafeHtml(txt) {
  if (!txt) return "";
  var s = txt;
  s = s.replace(/&/g, "&amp;");
  s = s.replace(/</g, "&lt;");
  s = s.replace(/>/g, "&gt;");
  s = s.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
  return s;
}

function simpleHash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return "h" + Math.abs(h);
}

// 🗝️ استرجاع سياق المنشور الفريد (params = ctx_id) مع تراجع للنمط القديم
var ctx = null;
var ctx_id = (typeof params !== "undefined" && params) ? params.trim() : "";
if (ctx_id) {
  ctx = Bot.getProperty(ctx_id);
}
if (!ctx) {
  ctx = {
    media_type: Bot.getProperty("pending_media_type", "text"),
    media_id: Bot.getProperty("pending_media_id", ""),
    raw_text: Bot.getProperty("pending_raw_text", ""),
    targets: Bot.getProperty("pending_targets", []),
    target_univ: Bot.getProperty("pending_target_univ", "جامعة معتمدة")
  };
}

var rephrased_text = "";
try {
  var data = JSON.parse(content);
  if (data.choices && data.choices[0] && data.choices[0].message) {
    rephrased_text = data.choices[0].message.content.trim();
    // كشف القطع بسبب max_tokens والتنبيه في السجل
    if (data.choices[0].finish_reason === "length") {
      rephrased_text = cleanArabicAndWebGarbage(rephrased_text);
    }
  }
} catch (e) {}

if (!rephrased_text) {
  rephrased_text = ctx.raw_text || "";
}

// 🚨 فحص قرار الذكاء الاصطناعي: هل المنشور غير مرتبط بالجامعة؟
if (rephrased_text.indexOf("[IGNORED]") !== -1) {
  Bot.sendMessage("🛡️ **تخطي منشور غير متعلق**: استبعد الذكاء الاصطناعي هذا المنشور لعدم صلته بطلاب (" + (ctx.target_univ || "الجامعة") + ") منعاً لخلط القنوات.");
  if (ctx_id) { Bot.setProperty(ctx_id, null, "json"); }
  return;
}

rephrased_text = cleanArabicAndWebGarbage(rephrased_text);

// تنظيف الرد والتأكد من وجود عنوان أكاديمي بارز
if (rephrased_text.indexOf("📌") === -1 && rephrased_text.indexOf("📢") === -1 && rephrased_text.indexOf("🎓") === -1) {
  rephrased_text = "📌 " + rephrased_text;
}

// ضمان وجود الهاشتاجات الأكاديمية
if (rephrased_text.indexOf("#") === -1) {
  var univ_tag = "#" + (ctx.target_univ || "جامعة").replace(/\s+/g, "_");
  rephrased_text += "\n\n" + univ_tag + " #أخبار_التعليم #شؤون_الطلاب #مواعيد";
}

// كشف الردود الحوارية لمنع نشرها في القنوات كأخبار
var is_conversational_reply = (
  rephrased_text.indexOf("يرجى تزويدي") !== -1 ||
  rephrased_text.indexOf("أعد إرسال") !== -1 ||
  rephrased_text.indexOf("يسعدني إعادة صياغة") !== -1 ||
  rephrased_text.indexOf("أرسل لي نص الخبر") !== -1 ||
  rephrased_text.length < 25
);

if (is_conversational_reply) {
  Bot.sendMessage("💡 **رد الذكاء الاصطناعي (محادثة/توضيح)**:\n" + rephrased_text + "\n\n⚠️ *لم يتم نشر هذا الرد في القناة لأنه ليس خبراً مكتملاً.*");
  if (ctx_id) { Bot.setProperty(ctx_id, null, "json"); }
  return;
}

var media_type = ctx.media_type || "text";
var media_file_id = ctx.media_id || "";

if (media_file_id && (media_file_id.indexOf("http") === 0 || media_file_id.indexOf("//") === 0)) {
  if (media_file_id.indexOf("emoji") !== -1 || media_file_id.indexOf("/img/") !== -1 || media_file_id.indexOf("website_icon") !== -1) {
    media_type = "text";
    media_file_id = "";
  }
}

var target_channels = ctx.targets || [];
var current_model = Bot.getProperty("ai_model", "DeepSeek-V4-Flash");
var target_univ_name = ctx.target_univ || "جامعة معتمدة";

var valid_targets = [];
if (target_channels && Array.isArray(target_channels)) {
  for (var t = 0; t < target_channels.length; t++) {
    var c = target_channels[t];
    if (c && c !== "@StudentServicesNews" && c !== "@SecondTargetChannel") {
      valid_targets.push(c);
    }
  }
}

if (valid_targets.length === 0) {
  var custom_target = Bot.getProperty("target_channels") || "@jhdhhdcj";
  valid_targets.push(custom_target);
}

// 🛡️ منع نشر نفس المحتوى مرتين في نفس القناة (بصمة المحتوى + القناة)
var pub_fp = "pub_" + simpleHash(valid_targets.join(",") + "|" + rephrased_text.substring(0, 100) + "|" + (media_file_id || ""));
var already_published = Bot.getProperty(pub_fp, false);
if (already_published) {
  Bot.sendMessage("⏭️ **تم تجاهل نسخة مكررة**: هذا المحتوى نُشر سابقاً في (" + target_univ_name + ") ولن يتكرر.");
  if (ctx_id) { Bot.setProperty(ctx_id, null, "json"); }
  return;
}

var safe_post_text = toSafeHtml(rephrased_text);
var safe_caption = safe_post_text;
if (safe_caption && safe_caption.length > 1024) {
  safe_caption = safe_caption.substring(0, 1020) + "...";
}

var sent_count = 0;
var target_names = [];
var failed_targets = [];

for (var i = 0; i < valid_targets.length; i++) {
  var ch = valid_targets[i];
  var sent_success = false;

  var clean_cap = rephrased_text.length > 1024 ? rephrased_text.substring(0, 1020) + "..." : rephrased_text;

  if (media_file_id && (media_type === "photo" || media_type === "photo_doc" || media_type === "video" || media_type === "document" || media_type === "audio" || media_type === "voice")) {
    // إرسال الوسائط بنوعها الصحيح — كان الكود القديم يُسقط الفيديو والملفات وينشر نصاً فقط!
    try {
      if (media_type === "photo_doc" || media_type === "document") {
        Api.sendDocument({ chat_id: ch, document: media_file_id, caption: clean_cap });
      } else if (media_type === "video") {
        Api.sendVideo({ chat_id: ch, video: media_file_id, caption: clean_cap });
      } else if (media_type === "audio") {
        Api.sendAudio({ chat_id: ch, audio: media_file_id, caption: clean_cap });
      } else if (media_type === "voice") {
        Api.sendVoice({ chat_id: ch, voice: media_file_id, caption: clean_cap });
      } else {
        Api.sendPhoto({ chat_id: ch, photo: media_file_id, caption: clean_cap });
      }
      sent_success = true;
    } catch (e1) {
      try {
        if (media_type === "photo_doc" || media_type === "document") {
          Api.sendDocument({ chat_id: ch, document: media_file_id, caption: safe_caption, parse_mode: "HTML" });
        } else if (media_type === "video") {
          Api.sendVideo({ chat_id: ch, video: media_file_id, caption: safe_caption, parse_mode: "HTML" });
        } else if (media_type === "audio") {
          Api.sendAudio({ chat_id: ch, audio: media_file_id, caption: safe_caption, parse_mode: "HTML" });
        } else if (media_type === "voice") {
          Api.sendVoice({ chat_id: ch, voice: media_file_id, caption: safe_caption, parse_mode: "HTML" });
        } else {
          Api.sendPhoto({ chat_id: ch, photo: media_file_id, caption: safe_caption, parse_mode: "HTML" });
        }
        sent_success = true;
      } catch (e2) {
        try {
          Api.sendMessage({ chat_id: ch, text: safe_post_text, parse_mode: "HTML" });
          sent_success = true;
        } catch (e3) {
          try {
            Api.sendMessage({ chat_id: ch, text: clean_cap });
            sent_success = true;
          } catch (e4) {}
        }
      }
    }
  } else {
    try {
      Api.sendMessage({ chat_id: ch, text: safe_post_text, parse_mode: "HTML" });
      sent_success = true;
    } catch (e1) {
      try {
        Api.sendMessage({ chat_id: ch, text: rephrased_text });
        sent_success = true;
      } catch (e2) {}
    }
  }

  if (sent_success) {
    sent_count++;
    target_names.push(ch);
  } else {
    failed_targets.push(ch);
  }
}

// تسجيل بصمة النشر لمنع أي تكرار لاحق
if (sent_count > 0) {
  Bot.setProperty(pub_fp, true, "boolean");
}

var total = Bot.getProperty("total_processed", 0) + 1;
Bot.setProperty("total_processed", total, "integer");
Bot.setProperty("last_post_title", rephrased_text.split("\n")[0] || "تحديث أكاديمي جديد", "string");
Bot.setProperty("last_post_time", new Date().toLocaleTimeString(), "string");

var confirm_text = "✅ **تمت صياغة ونشر الخبر في قناة (" + target_univ_name + ") بنجاح!**\n\n" +
  "• **قناة النشر**: `" + target_names.join("`، `") + "`\n" +
  "• **النموذج الذكي**: `" + current_model + "`\n" +
  "• **تنقية الويب**: تم إزالة مخلفات HTML و &nbsp; و X ونقاط الفراغ تماماً.\n\n";

if (failed_targets.length > 0) {
  confirm_text += "⚠️ **تعذر الإرسال إلى (" + failed_targets.join("، ") + ")**: يرجى التأكد من رفع البوت كمشرف في القناة.\n\n";
}

confirm_text += "👁️ **معاينة المنشور المنشور للطلاب:**\n" +
  "───────────────────\n" +
  rephrased_text;

var inline_keyboard = [
  [
    { title: "🔄 فحص أخبار الجامعات مجدداً", command: "/crawl_sources" },
    { title: "🏛️ إدارة الجامعات وقنواتها", command: "/universities" }
  ],
  [
    { title: "📊 حالة النظام والتقارير", command: "/status" },
    { title: "🎛 اللوحة الرئيسية", command: "/start" }
  ]
];

Bot.sendInlineKeyboard(inline_keyboard, confirm_text);

// تنظيف سياق المنشور بعد اكتماله
if (ctx_id) { Bot.setProperty(ctx_id, null, "json"); }
