// Site-wide settings. Edit these before publishing.
export const SITE = {
  name: "Noor Al Hikma AI",
  nameAr: "نور الحكمة",
  tagline: "The business case is the program.",
  taglineAr: "دراسة الحالة هي البرنامج",
  // Shown in the founder line on the paper page. Set to "" to hide.
  founderLine: "Founded by the former Head of AI at Techcombank.",
  location: "Abu Dhabi · Dubai",
  // Where "Request a pilot" / "Book a call" buttons go. Use a mailto: or a booking URL.
  // Leave empty to point buttons at the Services page contact block instead.
  contactUrl: "",
  contactEmail: "",
  linkedin: "",
  github: "",
  // Landing-page films. Put files in public/videos/ (e.g. dawn.webm + dawn.mp4 + dawn.jpg)
  // and set the base path here, e.g. dawn: "videos/dawn". Empty = animated stand-in.
  // See VIDEO_PROMPTS.md for the shot list and generation prompts.
  videos: {
    dawn: "",
    ask: "",
    checks: "",
    answer: "",
    life: "",
  } as Record<"dawn" | "ask" | "checks" | "answer" | "life", string>,
};

export function contactHref(subject = "CaseSpine pilot"): string {
  if (SITE.contactUrl) return SITE.contactUrl;
  if (SITE.contactEmail) return `mailto:${SITE.contactEmail}?subject=${encodeURIComponent(subject)}`;
  return "#/services#contact";
}
