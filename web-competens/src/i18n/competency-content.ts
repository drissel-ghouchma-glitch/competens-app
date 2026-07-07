import type { Lang } from "./translations";

// Arabic content for the 12 standard competencies, keyed by their stable code
// (C1–C12). These are DATA (not UI labels), so they don't go through t().
// Competencies added later by admins/teachers keep their original stored text.

export interface CompetencyContent {
  title: string;
  description: string;
  advice: string;
}

export const COMPETENCY_AR: Record<string, CompetencyContent> = {
  C1: {
    title: "احترام القواعد والنظام العام",
    description: "يحترم التلميذ النظام الداخلي والتعليمات الجماعية وسلطة الأستاذ.",
    advice: "وضع قواعد واضحة، توضيح التوقعات، تثمين السلوكيات الإيجابية، إرساء طقوس القسم.",
  },
  C2: {
    title: "الاستعداد والتركيز",
    description: "يحضر التلميذ إلى القسم بالأدوات اللازمة ويشرع في العمل بسرعة.",
    advice: "إرساء روتين للدخول إلى القسم، التحقق من الأدوات، اقتراح أنشطة انتقالية قصيرة.",
  },
  C3: {
    title: "الانضباط والانخراط أثناء الدرس",
    description: "يحافظ التلميذ على سلوك العمل طيلة الحصة دون تشويش القسم.",
    advice: "تنويع أنماط العمل، اقتراح فترات راحة ذهنية، تثمين الجهد والمثابرة.",
  },
  C4: {
    title: "تدبير الأدوات",
    description: "يعتني التلميذ بالأدوات الجماعية والفردية الموضوعة رهن إشارته.",
    advice: "إسناد مسؤوليات متعلقة بالأدوات، تقديم نموذج للترتيب، تخصيص وقت للترتيب.",
  },
  C5: {
    title: "الإنصات والمشاركة الفعّالة",
    description: "ينصت التلميذ للأستاذ ولزملائه، ويشارك في التفاعلات ويطرح أسئلة وجيهة.",
    advice: "استعمال عصا الكلام، تشجيع إعادة الصياغة، تثمين الأسئلة المطروحة.",
  },
  C6: {
    title: "المثابرة وإتمام المهام",
    description: "ينجز التلميذ التمارين المطلوبة إلى النهاية دون استسلام أمام الصعوبة.",
    advice: "تجزيء المهام المعقّدة، اقتراح مستويات صعوبة متدرّجة، الاحتفاء بالإنجاز.",
  },
  C7: {
    title: "الاستقلالية في العمل",
    description: "يقدر التلميذ على العمل بمفرده بعد فهم التعليمة.",
    advice: "توضيح التعليمات، اقتراح خطط عمل، تنمية التقويم الذاتي.",
  },
  C8: {
    title: "التعاون والعمل ضمن فريق",
    description: "يتعاون التلميذ مع أقرانه في الأنشطة الجماعية، ويتقاسم المهام، وينصت لأفكار الآخرين ويساهم في المجموعة.",
    advice: "تشكيل مجموعات غير متجانسة، إسناد أدوار متناوبة، تعليم المهارات الاجتماعية للتعاون.",
  },
  C9: {
    title: "التعبير الشفهي والتواصل",
    description: "يعبّر التلميذ بوضوح شفهياً بمعجم ملائم وتركيب سليم، مخاطباً أقرانه والأستاذ.",
    advice: "الإكثار من وضعيات أخذ الكلمة، تعليم المعجم الخاص، ممارسة العروض والمناظرات.",
  },
  C10: {
    title: "الفهم والاسترجاع",
    description: "يفهم التلميذ التعليمات والمضامين المدرَّسة ويقدر على استرجاعها بكلماته الخاصة.",
    advice: "ممارسة إعادة الصياغة، استعمال دعامات بصرية، اقتراح أنشطة التلخيص والتخطيط.",
  },
  C11: {
    title: "الإبداع والمبادرة",
    description: "يقترح التلميذ أفكاراً أصيلة، ويأخذ المبادرة في المهام المفتوحة، ويُظهر خيالاً.",
    advice: "اقتراح أنشطة مفتوحة، تثمين الحلول الأصيلة، تنظيم ورشات إبداعية.",
  },
  C12: {
    title: "التقدّم والتطور الشخصي",
    description: "يعي التلميذ تقدّمه وصعوباته، وينخرط بفاعلية في تطوره الشخصي.",
    advice: "ممارسة التقويم الذاتي، مسك دفتر للتقدّم، الاحتفاء بالتطورات الفردية.",
  },
};

/** Localized competency title by code — falls back to the stored text. */
export function localizeCompTitle(code: string, fallback: string, lang: Lang): string {
  if (lang === "ar") return COMPETENCY_AR[code]?.title ?? fallback;
  return fallback;
}

/** Full localized competency content (title / description / advice) with fallbacks. */
export function localizeCompetency(
  code: string,
  lang: Lang,
  fallback: { title: string; description?: string; advice?: string },
): CompetencyContent {
  const ar = lang === "ar" ? COMPETENCY_AR[code] : undefined;
  return {
    title: ar?.title ?? fallback.title,
    description: ar?.description ?? fallback.description ?? "",
    advice: ar?.advice ?? fallback.advice ?? "",
  };
}
