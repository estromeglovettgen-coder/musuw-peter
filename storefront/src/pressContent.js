export const PRESS_PATH = "/press";
export const PRESS_ARCHIVE = "/media/press/musuw-media-kit.zip";
export const PRESS_BRIEFS = [
  { language: "en", label: "English", src: "/media/press/musuw-product-brief-en.pdf" },
  { language: "zh", label: "中文", src: "/media/press/musuw-product-brief-zh.pdf" },
];

export const PRESS_VIDEOS = [
  { id: "en-16x9", language: "en", label: "English · 16:9", resolution: "1920 × 1080" },
  { id: "zh-16x9", language: "zh", label: "中文 · 16:9", resolution: "1920 × 1080" },
  { id: "en-4x5", language: "en", label: "English · 4:5", resolution: "1080 × 1350" },
  { id: "zh-4x5", language: "zh", label: "中文 · 4:5", resolution: "1080 × 1350" },
].map((video) => ({
  ...video,
  duration: 33,
  aspect: video.id.endsWith("4x5") ? "4x5" : "16x9",
  src: `/media/press/musuw-${video.id}.mp4`,
  poster: `/media/press/musuw-${video.id}-cover.png`,
  captions: `/media/press/${video.language}.vtt`,
  subtitles: `/media/press/${video.language}.srt`,
}));

export const WALKTHROUGH_VIDEOS = [
  { language: "en", label: "English · 16:9", aspect: "16x9", duration: 40, resolution: "1920 × 1080" },
  { language: "zh", label: "中文 · 16:9", aspect: "16x9", duration: 40, resolution: "1920 × 1080" },
  { language: "en", label: "English · 9:16", aspect: "9x16", duration: 30, resolution: "1080 × 1920" },
  { language: "zh", label: "中文 · 9:16", aspect: "9x16", duration: 30, resolution: "1080 × 1920" },
].map((video) => {
  const portrait = video.aspect === "9x16";
  const captionName = `cedar-${portrait ? "portrait" : "live"}-${video.language}`;
  return {
    ...video,
    id: `cedar-${video.language}-${video.aspect}`,
    src: `/media/press/musuw-cedar-live-${video.language}-${video.aspect}.mp4`,
    poster: `/media/press/musuw-cedar-${portrait ? "portrait" : "live"}-${video.language}-cover.jpg`,
    captions: `/media/press/${captionName}.vtt`,
    subtitles: `/media/press/${captionName}.srt`,
  };
});

export const PRESS_IMAGES = [
  { src: "/images/musuw-knowledge-base.jpg", en: "Knowledge base", zh: "知识库" },
  { src: "/images/musuw-query-citation.jpg", en: "Answers with source citations", zh: "带原文引用的回答" },
  { src: "/images/musuw-wiki-page.jpg", en: "AI-organized Wiki", zh: "AI 整理的 Wiki" },
  { src: "/images/musuw-wiki-graph.jpg", en: "Knowledge graph", zh: "知识图谱" },
];

const content = {
  en: {
    meta: { title: "Media kit | musuw", description: "Official Musuw logo, screenshots, and bilingual product videos. Download actual walkthroughs, portrait clips, and captions for coverage." },
    eyebrow: "Musuw media kit",
    title: "From source material to connected knowledge.",
    intro: "Turn your documents into answers with citations, connected Wiki pages, and knowledge graphs. Import webpages and video links with a paid plan.",
    demo: "Watch the walkthrough", pricing: "View plans", downloadKit: "Download media kit (ZIP)",
    kitNote: "Includes the logo, screenshots, videos, captions, product briefs, and fictional demo sources.",
    briefs: "One-page product overview (PDF)",
    walkthroughTitle: "See the product in action",
    walkthroughNote: "Actual Chinese-interface recordings with English or Chinese captions. Fictional demo sources; waiting time edited. Portrait versions use enlarged crops. No audio.",
    videoTitle: "A 33-second product overview",
    videoNote: "Edited showcases, not live recordings. English interface, bilingual captions, no audio.",
    downloadVideo: "Download MP4", captions: "Captions", screenshots: "Product screenshots", screenshotNote: "Public example workspace. Download the original images for a closer look.",
    downloadImage: "Download image", brandTitle: "Logo & contact", logo: "Musuw logo", downloadLogo: "Download logo (PNG)",
    contact: "Press enquiries:", usage: "Official assets for coverage of Musuw. Please retain the product name and attribution.",
  },
  "zh-CN": {
    meta: { title: "媒体资料 | musuw", description: "Musuw 官方标志、截图与中英文产品视频。下载实机演示、竖版短片和字幕，了解带引用的问答、Wiki 与知识图谱。" },
    eyebrow: "Musuw 媒体资料",
    title: "从原始资料，到相互关联的知识。",
    intro: "把资料变成带引用的回答、相互关联的 Wiki 和知识图谱。付费方案支持网页与视频链接导入。",
    demo: "观看实机演示", pricing: "查看方案", downloadKit: "下载媒体素材包（ZIP）",
    kitNote: "包含标志、截图、视频、字幕、产品简介及虚构演示资料。",
    briefs: "一页产品简介（PDF）",
    walkthroughTitle: "看一次实际操作",
    walkthroughNote: "中文界面实录，中英字幕。使用虚构资料，已剪去等待过程；竖版放大了关键区域。无音轨。",
    videoTitle: "33 秒了解产品",
    videoNote: "剪辑展示，并非实机录屏。英文界面，中英字幕，无音轨。",
    downloadVideo: "下载 MP4", captions: "字幕", screenshots: "产品截图", screenshotNote: "截图来自公开示例空间，可下载原图查看细节。",
    downloadImage: "下载图片", brandTitle: "标志与联系", logo: "Musuw 标志", downloadLogo: "下载标志（PNG）",
    contact: "媒体联系：", usage: "供 Musuw 产品报道使用，请保留产品名称与来源。",
  },
};

export function getPressContent(locale) {
  return content[locale === "zh-CN" ? "zh-CN" : "en"];
}

export function getPressMeta(locale, pathname) {
  return pathname.replace(/\/+$/, "") === PRESS_PATH ? getPressContent(locale).meta : null;
}
