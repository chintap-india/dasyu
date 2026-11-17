const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const pkg = require('../package.json');

const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'assets');
const publicDir = path.join(rootDir, 'public');
const imagesDir = path.join(publicDir, 'images');
const tmpDir = '/tmp/dasyu-brand-build';

fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME)) {
  console.error('Google Chrome not found at:', CHROME);
  process.exit(1);
}

console.log('🎨 Dasyu Automated Brand & Marketing Asset Pipeline');
console.log('   Assets Dir: ', assetsDir);
console.log('   Public Dir: ', imagesDir);
console.log('   Working Dir:', tmpDir);

// -----------------------------------------------------------------------------
// 1. Master Vector SVG Definitions
// -----------------------------------------------------------------------------

// Dark Emblem: Black body with vivid Crimson Red slash on transparent background
const EMBLEM_DARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%" fill="none">
  <!-- Dasyu Master Emblem (Dark Mode): The Outlaw of the Web -->
  <polygon points="80,80 360,80 80,220" fill="#0A0A0A" />
  <polygon points="80,220 360,80 760,80 960,280 80,520" fill="#F00000" />
  <polygon points="80,520 960,280 960,720 760,920 80,920" fill="#0A0A0A" />
</svg>`;

// Light Emblem: Crisp White body with vivid Crimson Red slash on transparent background
const EMBLEM_LIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%" fill="none">
  <!-- Dasyu Master Emblem (Light Mode for Dark Backgrounds) -->
  <polygon points="80,80 360,80 80,220" fill="#FFFFFF" />
  <polygon points="80,220 360,80 760,80 960,280 80,520" fill="#F00000" />
  <polygon points="80,520 960,280 960,720 760,920 80,920" fill="#FFFFFF" />
</svg>`;

// Adaptive Base Emblem (Dark default)
const EMBLEM_ADAPTIVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%" fill="none">
  <style>
    .emblem-body { fill: #0A0A0A; }
    .emblem-slash { fill: #F00000; }
    @media (prefers-color-scheme: dark) {
      .emblem-body { fill: #FFFFFF; }
    }
  </style>
  <polygon class="emblem-body" points="80,80 360,80 80,220" />
  <polygon class="emblem-slash" points="80,220 360,80 760,80 960,280 80,520" />
  <polygon class="emblem-body" points="80,520 960,280 960,720 760,920 80,920" />
</svg>`;

// Horizontal Brand Logo (Dark Mode background)
const LOGO_HORIZONTAL_DARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="100%" height="100%" fill="none">
  <g transform="translate(40, 40) scale(0.32)">
    <polygon points="80,80 360,80 80,220" fill="#FFFFFF" />
    <polygon points="80,220 360,80 760,80 960,280 80,520" fill="#F00000" />
    <polygon points="80,520 960,280 960,720 760,920 80,920" fill="#FFFFFF" />
  </g>
  <text x="400" y="200" font-family="'Poppins', -apple-system, sans-serif" font-size="128" font-weight="900" fill="#FFFFFF" letter-spacing="-3">dasyu</text>
  <text x="785" y="150" font-family="'Inter', -apple-system, sans-serif" font-size="34" font-weight="800" fill="#F00000" letter-spacing="1">दस्यु</text>
  <text x="405" y="260" font-family="'Space Grotesk', monospace" font-size="28" font-weight="700" fill="#9AA5B5" letter-spacing="6">THE OUTLAW OF THE WEB</text>
</svg>`;

// Horizontal Brand Logo (Light Mode background)
const LOGO_HORIZONTAL_LIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="100%" height="100%" fill="none">
  <g transform="translate(40, 40) scale(0.32)">
    <polygon points="80,80 360,80 80,220" fill="#0A0A0A" />
    <polygon points="80,220 360,80 760,80 960,280 80,520" fill="#F00000" />
    <polygon points="80,520 960,280 960,720 760,920 80,920" fill="#0A0A0A" />
  </g>
  <text x="400" y="200" font-family="'Poppins', -apple-system, sans-serif" font-size="128" font-weight="900" fill="#0A0A0A" letter-spacing="-3">dasyu</text>
  <text x="785" y="150" font-family="'Inter', -apple-system, sans-serif" font-size="34" font-weight="800" fill="#F00000" letter-spacing="1">दस्यु</text>
  <text x="405" y="260" font-family="'Space Grotesk', monospace" font-size="28" font-weight="700" fill="#4B5563" letter-spacing="6">THE OUTLAW OF THE WEB</text>
</svg>`;

// Write master SVG files
fs.writeFileSync(path.join(assetsDir, 'dasyu-emblem-dark.svg'), EMBLEM_DARK_SVG);
fs.writeFileSync(path.join(assetsDir, 'dasyu-emblem-light.svg'), EMBLEM_LIGHT_SVG);
fs.writeFileSync(path.join(assetsDir, 'dasyu-emblem.svg'), EMBLEM_ADAPTIVE_SVG);
fs.writeFileSync(path.join(assetsDir, 'dasyu-logo-dark.svg'), LOGO_HORIZONTAL_DARK_SVG);
fs.writeFileSync(path.join(assetsDir, 'dasyu-logo-light.svg'), LOGO_HORIZONTAL_LIGHT_SVG);

fs.writeFileSync(path.join(imagesDir, 'dasyu-emblem-dark.svg'), EMBLEM_DARK_SVG);
fs.writeFileSync(path.join(imagesDir, 'dasyu-emblem-light.svg'), EMBLEM_LIGHT_SVG);
fs.writeFileSync(path.join(imagesDir, 'dasyu-emblem.svg'), EMBLEM_ADAPTIVE_SVG);
fs.writeFileSync(path.join(imagesDir, 'dasyu-logo-dark.svg'), LOGO_HORIZONTAL_DARK_SVG);
fs.writeFileSync(path.join(imagesDir, 'dasyu-logo-light.svg'), LOGO_HORIZONTAL_LIGHT_SVG);

console.log('✅ Generated Master Vector SVGs');

// -----------------------------------------------------------------------------
// 2. High-Resolution Chrome Headless Render Templates
// -----------------------------------------------------------------------------

// --- Master 2048x2048 Transparent Emblems ---
const renderHtmlEmblemDark = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width: 2048px; height: 2048px; display: flex; align-items: center; justify-content: center; background: transparent; }
  svg { width: 1700px; height: 1700px; }
</style>
</head>
<body>
  ${EMLEM_DARK_SVG_INLINE = EMBLEM_DARK_SVG}
</body>
</html>`;

const renderHtmlEmblemLight = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width: 2048px; height: 2048px; display: flex; align-items: center; justify-content: center; background: transparent; }
  svg { width: 1700px; height: 1700px; }
</style>
</head>
<body>
  ${EMBLEM_LIGHT_SVG}
</body>
</html>`;

// --- Square Brand Graphic (2048x2048): Dark Slate / Studio Background ---
const renderHtmlBrandDark2048 = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@800;900&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0B0D12;
    width: 2048px;
    height: 2048px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Poppins', -apple-system, sans-serif;
    position: relative;
    overflow: hidden;
  }
  .glow-red {
    position: absolute;
    top: -200px;
    right: -200px;
    width: 1200px;
    height: 1200px;
    background: radial-gradient(circle, rgba(234, 28, 36, 0.22) 0%, rgba(11, 13, 18, 0) 70%);
  }
  .glow-bottom {
    position: absolute;
    bottom: -250px;
    left: -200px;
    width: 1100px;
    height: 1100px;
    background: radial-gradient(circle, rgba(52, 64, 82, 0.3) 0%, rgba(11, 13, 18, 0) 70%);
  }
  .grid-pattern {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(to right, rgba(52, 64, 82, 0.18) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(52, 64, 82, 0.18) 1px, transparent 1px);
    background-size: 64px 64px;
    mask-image: radial-gradient(circle at 50% 45%, black 45%, transparent 85%);
  }
  .container {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .emblem-wrapper {
    width: 780px;
    height: 740px;
    margin-bottom: 72px;
    filter: drop-shadow(0 28px 60px rgba(234, 28, 36, 0.35));
  }
  .title {
    font-size: 260px;
    font-weight: 900;
    color: #FFFFFF;
    line-height: 0.95;
    letter-spacing: -8px;
    margin-bottom: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }
  .title .devanagari {
    font-size: 72px;
    color: #EA1C24;
    font-weight: 800;
    letter-spacing: 0;
    transform: translateY(-40px);
  }
  .sub {
    font-family: 'Space Grotesk', monospace;
    font-size: 50px;
    font-weight: 700;
    color: #9AA5B5;
    letter-spacing: 0.32em;
    text-indent: 0.32em;
    line-height: 1;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="glow-red"></div>
  <div class="glow-bottom"></div>
  <div class="grid-pattern"></div>
  <div class="container">
    <div class="emblem-wrapper">
      ${EMBLEM_LIGHT_SVG}
    </div>
    <div class="title">dasyu <span class="devanagari">दस्यु</span></div>
    <div class="sub">THE OUTLAW OF THE WEB</div>
  </div>
</body>
</html>`;

// --- Square Brand Graphic (2048x2048): Clean White Background ---
const renderHtmlBrandWhite2048 = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@800;900&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #FFFFFF;
    width: 2048px;
    height: 2048px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Poppins', -apple-system, sans-serif;
  }
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .emblem-wrapper {
    width: 780px;
    height: 740px;
    margin-bottom: 72px;
    filter: drop-shadow(0 20px 45px rgba(0, 0, 0, 0.12));
  }
  .title {
    font-size: 260px;
    font-weight: 900;
    color: #0A0A0A;
    line-height: 0.95;
    letter-spacing: -8px;
    margin-bottom: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }
  .title .devanagari {
    font-size: 72px;
    color: #EA1C24;
    font-weight: 800;
    letter-spacing: 0;
    transform: translateY(-40px);
  }
  .sub {
    font-family: 'Space Grotesk', monospace;
    font-size: 50px;
    font-weight: 700;
    color: #374151;
    letter-spacing: 0.32em;
    text-indent: 0.32em;
    line-height: 1;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="container">
    <div class="emblem-wrapper">
      ${EMBLEM_DARK_SVG}
    </div>
    <div class="title">dasyu <span class="devanagari">दस्यु</span></div>
    <div class="sub">THE OUTLAW OF THE WEB</div>
  </div>
</body>
</html>`;

// --- Horizontal Brand Banner (2400x800): Dark BG ---
const renderHtmlHorizontalDark2400 = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@800;900&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0B0D12;
    width: 2400px;
    height: 800px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 120px;
    position: relative;
    overflow: hidden;
    font-family: 'Poppins', -apple-system, sans-serif;
  }
  .top-accent {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 8px;
    background: linear-gradient(90deg, #E62938 0%, #EA1C24 60%, #ff4d5a 100%);
  }
  .glow-red {
    position: absolute;
    top: -150px;
    right: 100px;
    width: 800px;
    height: 800px;
    background: radial-gradient(circle, rgba(234, 28, 36, 0.22) 0%, rgba(11, 13, 18, 0) 70%);
  }
  .grid-pattern {
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(to right, rgba(52, 64, 82, 0.15) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(52, 64, 82, 0.15) 1px, transparent 1px);
    background-size: 50px 50px;
  }
  .lockup {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 90px;
  }
  .emblem {
    width: 440px;
    height: 420px;
    flex-shrink: 0;
    filter: drop-shadow(0 20px 45px rgba(234, 28, 36, 0.35));
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .title-row {
    display: flex;
    align-items: baseline;
    gap: 28px;
  }
  .brand-name {
    font-size: 210px;
    font-weight: 900;
    color: #FFFFFF;
    line-height: 0.9;
    letter-spacing: -7px;
  }
  .devanagari {
    font-size: 58px;
    color: #EA1C24;
    font-weight: 800;
    letter-spacing: 0;
  }
  .sub {
    font-family: 'Space Grotesk', monospace;
    font-size: 42px;
    font-weight: 700;
    color: #9AA5B5;
    letter-spacing: 0.26em;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="top-accent"></div>
  <div class="glow-red"></div>
  <div class="grid-pattern"></div>
  <div class="lockup">
    <div class="emblem">${EMBLEM_LIGHT_SVG}</div>
    <div class="info">
      <div class="title-row">
        <div class="brand-name">dasyu</div>
        <div class="devanagari">दस्यु</div>
      </div>
      <div class="sub">THE OUTLAW OF THE WEB</div>
    </div>
  </div>
</body>
</html>`;

// --- Horizontal Brand Banner (2400x800): Light BG ---
const renderHtmlHorizontalLight2400 = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@800;900&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #FFFFFF;
    width: 2400px;
    height: 800px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 120px;
    font-family: 'Poppins', -apple-system, sans-serif;
  }
  .lockup {
    display: flex;
    align-items: center;
    gap: 90px;
  }
  .emblem {
    width: 440px;
    height: 420px;
    flex-shrink: 0;
    filter: drop-shadow(0 16px 36px rgba(0, 0, 0, 0.12));
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .title-row {
    display: flex;
    align-items: baseline;
    gap: 28px;
  }
  .brand-name {
    font-size: 210px;
    font-weight: 900;
    color: #0A0A0A;
    line-height: 0.9;
    letter-spacing: -7px;
  }
  .devanagari {
    font-size: 58px;
    color: #EA1C24;
    font-weight: 800;
    letter-spacing: 0;
  }
  .sub {
    font-family: 'Space Grotesk', monospace;
    font-size: 42px;
    font-weight: 700;
    color: #374151;
    letter-spacing: 0.26em;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="lockup">
    <div class="emblem">${EMBLEM_DARK_SVG}</div>
    <div class="info">
      <div class="title-row">
        <div class="brand-name">dasyu</div>
        <div class="devanagari">दस्यु</div>
      </div>
      <div class="sub">THE OUTLAW OF THE WEB</div>
    </div>
  </div>
</body>
</html>`;

// --- OpenGraph Card (1200x630): Dark Mode following Today & Chintap Studio specs ---
const renderHtmlOgCard = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Poppins:wght@700;800;900&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1200px;
      height: 630px;
      background: #0B0D12;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 44px 56px 40px 56px;
      position: relative;
      overflow: hidden;
      color: #F3F4F6;
    }

    /* Ambient background lighting */
    .glow-red {
      position: absolute;
      top: -120px;
      right: -80px;
      width: 550px;
      height: 550px;
      background: radial-gradient(circle, rgba(234, 28, 36, 0.22) 0%, rgba(11, 13, 18, 0) 70%);
      pointer-events: none;
    }
    .glow-slate {
      position: absolute;
      bottom: -140px;
      left: 100px;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(52, 64, 82, 0.3) 0%, rgba(11, 13, 18, 0) 70%);
      pointer-events: none;
    }

    /* Top red accent line */
    .top-accent {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 5px;
      background: linear-gradient(90deg, #E62938 0%, #EA1C24 60%, #ff4d5a 100%);
    }

    /* Subtle grid overlay */
    .grid-pattern {
      position: absolute;
      inset: 0;
      background-image: 
        linear-gradient(to right, rgba(52, 64, 82, 0.16) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(52, 64, 82, 0.16) 1px, transparent 1px);
      background-size: 40px 40px;
      mask-image: radial-gradient(circle at 50% 40%, black 50%, transparent 95%);
      pointer-events: none;
    }

    /* Main Container Card */
    .main-card {
      position: relative;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 36px;
      background: rgba(23, 27, 37, 0.88);
      border: 1px solid #344052;
      border-radius: 28px;
      padding: 36px 44px;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(14px);
    }

    .icon-box {
      width: 136px;
      height: 136px;
      flex-shrink: 0;
      border-radius: 28px;
      background: #12151D;
      border: 1px solid #344052;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      box-shadow: 0 16px 36px rgba(234, 28, 36, 0.32);
    }
    .icon-box svg {
      width: 100%;
      height: 100%;
    }

    .info {
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex: 1;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .app-title {
      font-size: 64px;
      font-weight: 900;
      letter-spacing: -0.035em;
      line-height: 1;
      color: #FFFFFF;
      font-family: 'Poppins', sans-serif;
    }

    .title-indic {
      font-size: 26px;
      color: #EA1C24;
      font-weight: 800;
      margin-left: -6px;
    }

    .tag-badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 14px;
      border-radius: 9999px;
      background: rgba(234, 28, 36, 0.16);
      border: 1px solid rgba(234, 28, 36, 0.45);
      color: #EA1C24;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      line-height: 1;
    }

    .pill-invite {
      display: inline-flex;
      align-items: center;
      padding: 6px 12px;
      border-radius: 9999px;
      background: #222938;
      border: 1px solid #344052;
      color: #9AA5B5;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
    }

    .tagline {
      font-size: 21px;
      font-weight: 500;
      color: #9AA5B5;
      line-height: 1.35;
    }

    .features-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 6px;
    }

    .feature-chip {
      padding: 6px 12px;
      border-radius: 8px;
      background: rgba(34, 41, 56, 0.85);
      border: 1px solid rgba(52, 64, 82, 0.85);
      color: #F3F4F6;
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .feature-chip .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #EA1C24;
    }

    /* Footer Lockup per Chintap specification */
    .footer {
      position: relative;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid #344052;
      padding-top: 22px;
    }

    .brand-lockup {
      font-family: 'Poppins', sans-serif;
      font-weight: 900;
      font-size: 32px;
      letter-spacing: -0.04em;
      line-height: 1;
      display: flex;
      align-items: center;
    }
    .brand-lockup .prefix { color: #ffffff; }
    .brand-lockup .suffix { color: #EA1C24; }

    .brand-tagline {
      font-family: 'Space Grotesk', monospace;
      font-weight: 700;
      letter-spacing: 0.22em;
      font-size: 14px;
      color: #9AA5B5;
      text-transform: uppercase;
    }

    .url-badge {
      font-family: 'Space Grotesk', monospace;
      font-size: 14px;
      font-weight: 700;
      color: #F3F4F6;
      display: flex;
      align-items: center;
      gap: 8px;
      background: #171B25;
      padding: 6px 14px;
      border-radius: 9999px;
      border: 1px solid #344052;
    }
    .url-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #EA1C24;
    }
  </style>
</head>
<body>
  <div class="top-accent"></div>
  <div class="glow-red"></div>
  <div class="glow-slate"></div>
  <div class="grid-pattern"></div>

  <!-- Main Showcase Card -->
  <div class="main-card">
    <div class="icon-box">
      ${EMBLEM_LIGHT_SVG}
    </div>

    <div class="info">
      <div class="title-row">
        <h1 class="app-title">Dasyu</h1>
        <span class="title-indic">दस्यु</span>
        <span class="tag-badge">Headless Engine</span>
        <span class="pill-invite">v\${pkg.version} • MCP Native</span>
      </div>

      <p class="tagline">The Outlaw of the Web. Roam links, capture snapshots, extract treasure.</p>

      <div class="features-row">
        <div class="feature-chip"><span class="dot"></span>Playwright Chromium</div>
        <div class="feature-chip"><span class="dot"></span>Interactive Auth Bridge</div>
        <div class="feature-chip"><span class="dot"></span>Axe-core WCAG 2.1</div>
        <div class="feature-chip"><span class="dot"></span>RAG Chunks &amp; Site Graph</div>
        <div class="feature-chip"><span class="dot"></span>Stdio MCP Server</div>
      </div>
    </div>
  </div>

  <!-- Footer Lockup -->
  <footer class="footer">
    <div class="brand-lockup">
      <span class="prefix">chin</span><span class="suffix">tap</span>
    </div>

    <div class="brand-tagline">
      THINGS. APPS. POSSIBILITIES.
    </div>

    <div class="url-badge">
      <span class="url-dot"></span>
      <span>chintap.com/dasyu</span>
    </div>
  </footer>
</body>
</html>`;

// Write HTML templates for Chrome headless
fs.writeFileSync(path.join(tmpDir, 'emblem-dark-2048.html'), renderHtmlEmblemDark);
fs.writeFileSync(path.join(tmpDir, 'emblem-light-2048.html'), renderHtmlEmblemLight);
fs.writeFileSync(path.join(tmpDir, 'brand-dark-2048.html'), renderHtmlBrandDark2048);
fs.writeFileSync(path.join(tmpDir, 'brand-white-2048.html'), renderHtmlBrandWhite2048);
fs.writeFileSync(path.join(tmpDir, 'horizontal-dark-2400.html'), renderHtmlHorizontalDark2400);
fs.writeFileSync(path.join(tmpDir, 'horizontal-light-2400.html'), renderHtmlHorizontalLight2400);
fs.writeFileSync(path.join(tmpDir, 'og-card-1200.html'), renderHtmlOgCard);

console.log('✅ Generated HTML render templates in', tmpDir);

// -----------------------------------------------------------------------------
// 3. Render High-Resolution Raster Assets with Google Chrome Headless
// -----------------------------------------------------------------------------

function renderScreenshot(htmlFile, outFile, width, height) {
  const fileUrl = `file://${htmlFile}`;
  console.log(`📸 Rendering ${width}x${height} -> ${path.basename(outFile)}`);
  execSync(
    `"${CHROME}" --headless --disable-gpu --hide-scrollbars --window-size=${width},${height} --screenshot="${outFile}" "${fileUrl}"`,
    { stdio: 'pipe' }
  );
}

// 1. 2048x2048 Master Transparent Emblems
renderScreenshot(path.join(tmpDir, 'emblem-dark-2048.html'), path.join(assetsDir, 'dasyu-emblem-dark-mode.png'), 2048, 2048);
renderScreenshot(path.join(tmpDir, 'emblem-light-2048.html'), path.join(assetsDir, 'dasyu-emblem-light-mode.png'), 2048, 2048);

// 2. 2048x2048 Square Brand Cards
renderScreenshot(path.join(tmpDir, 'brand-dark-2048.html'), path.join(assetsDir, 'dasyu-brand-dark-2048.png'), 2048, 2048);
renderScreenshot(path.join(tmpDir, 'brand-white-2048.html'), path.join(assetsDir, 'dasyu-brand-white-bg-2048.png'), 2048, 2048);

// 3. 2400x800 Horizontal Brand Banners
renderScreenshot(path.join(tmpDir, 'horizontal-dark-2400.html'), path.join(assetsDir, 'dasyu-brand-horizontal-dark-2400.png'), 2400, 800);
renderScreenshot(path.join(tmpDir, 'horizontal-light-2400.html'), path.join(assetsDir, 'dasyu-brand-horizontal-2400.png'), 2400, 800);

// 4. 1200x630 OpenGraph / Social Cards
renderScreenshot(path.join(tmpDir, 'og-card-1200.html'), path.join(assetsDir, 'dasyu-og.png'), 1200, 630);

// Also copy primary brand images to standard names
fs.copyFileSync(path.join(assetsDir, 'dasyu-emblem-dark-mode.png'), path.join(assetsDir, 'dasyu-logo-dark.png'));
fs.copyFileSync(path.join(assetsDir, 'dasyu-emblem-light-mode.png'), path.join(assetsDir, 'dasyu-logo-light.png'));
fs.copyFileSync(path.join(assetsDir, 'dasyu-og.png'), path.join(assetsDir, 'dasyu-og-dark.png'));
fs.copyFileSync(path.join(assetsDir, 'dasyu-og.png'), path.join(assetsDir, 'dasyu-og-preview.png'));

// -----------------------------------------------------------------------------
// 4. Convert High-Quality JPEGs via sips (95% quality)
// -----------------------------------------------------------------------------
console.log('⚙️  Generating high-quality JPEG social previews via sips...');
execSync(`sips -s format jpeg -s formatOptions 95 "${path.join(assetsDir, 'dasyu-og.png')}" --out "${path.join(assetsDir, 'dasyu-og.jpg')}"`, { stdio: 'pipe' });
execSync(`sips -s format jpeg -s formatOptions 95 "${path.join(assetsDir, 'dasyu-og.png')}" --out "${path.join(assetsDir, 'dasyu-og-dark.jpg')}"`, { stdio: 'pipe' });
execSync(`sips -s format jpeg -s formatOptions 95 "${path.join(assetsDir, 'dasyu-og.png')}" --out "${path.join(assetsDir, 'dasyu-og-preview.jpg')}"`, { stdio: 'pipe' });

// -----------------------------------------------------------------------------
// 5. Downsample Web Favicons & App Icons via sips
// -----------------------------------------------------------------------------
console.log('📦 Generating standard web downsamples & favicons via sips...');
execSync(`sips -z 512 512 "${path.join(assetsDir, 'dasyu-emblem-dark-mode.png')}" --out "${path.join(assetsDir, 'dasyu-icon-dark.png')}"`, { stdio: 'pipe' });
execSync(`sips -z 512 512 "${path.join(assetsDir, 'dasyu-emblem-light-mode.png')}" --out "${path.join(assetsDir, 'dasyu-icon-light.png')}"`, { stdio: 'pipe' });
execSync(`sips -z 512 512 "${path.join(assetsDir, 'dasyu-emblem-dark-mode.png')}" --out "${path.join(assetsDir, 'pwa-icon-512.png')}"`, { stdio: 'pipe' });
execSync(`sips -z 192 192 "${path.join(assetsDir, 'dasyu-emblem-dark-mode.png')}" --out "${path.join(assetsDir, 'pwa-icon-192.png')}"`, { stdio: 'pipe' });
execSync(`sips -z 180 180 "${path.join(assetsDir, 'dasyu-emblem-dark-mode.png')}" --out "${path.join(assetsDir, 'apple-touch-icon-dark.png')}"`, { stdio: 'pipe' });
execSync(`sips -z 64 64 "${path.join(assetsDir, 'dasyu-emblem-dark-mode.png')}" --out "${path.join(assetsDir, 'favicon.png')}"`, { stdio: 'pipe' });

// -----------------------------------------------------------------------------
// 6. Mirror all assets into public/images/ for Upcoming Dasyu Home Page
// -----------------------------------------------------------------------------
console.log('🚀 Mirroring assets to public/images/ for home page...');
const generatedFiles = fs.readdirSync(assetsDir);
for (const file of generatedFiles) {
  if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.svg')) {
    fs.copyFileSync(path.join(assetsDir, file), path.join(imagesDir, file));
  }
}

console.log('✨ All Dasyu brand, marketing, vector, and OG assets generated successfully!');
