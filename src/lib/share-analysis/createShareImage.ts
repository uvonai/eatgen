import type { FoodAnalysis } from "@/hooks/useFoodAnalysis";
import eatgenLogo from "@/assets/eatgen-logo.jpg";

type ShareRenderOptions = {
  width?: number;
  minHeight?: number;
  maxHeight?: number;
};

const DEFAULTS: Required<ShareRenderOptions> = {
  width: 1080,
  minHeight: 1920,
  maxHeight: 6000,
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const n0 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const calculateRiskScore = (a: FoodAnalysis): number => {
  if (a.risk_score !== undefined) return a.risk_score;
  let s = 50;
  if (a.health_impact === "good") s = 25;
  if (a.health_impact === "risky") s = 75;
  if (n0(a.sugar_g) > 30) s += 10;
  if (n0(a.sodium_mg) > 1000) s += 10;
  return clamp(s, 0, 100);
};

const calculateLifespanImpact = (a: FoodAnalysis): number => {
  if (a.lifespan_impact_days !== undefined) return a.lifespan_impact_days;
  if (a.health_impact === "good") {
    return Math.round((0.5 + Math.min(n0(a.fiber_g) * 0.3, 1.5) + Math.min(n0(a.protein_g) * 0.05, 0.5)) * 10) / 10;
  }
  if (a.health_impact === "risky") {
    return -Math.round((1 + Math.min(n0(a.sugar_g) * 0.05, 1.5) + Math.min(n0(a.sodium_mg) * 0.001, 1)) * 10) / 10;
  }
  return 0;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: string, border: string, radius = 20) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = bg;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawPill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg: string): number {
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, sans-serif";
  const tw = ctx.measureText(text).width;
  const pw = tw + 24;
  const ph = 32;
  ctx.fillStyle = bg;
  ctx.beginPath();
  roundRect(ctx, x, y, pw, ph, 16);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.fillText(text, x + pw / 2, y + 21);
  return pw;
}

function drawMacroBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, value: number, unit: string, color: string, maxVal: number) {
  const h = 56;
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();

  const barY = y + h - 6;
  const barW = Math.min((value / maxVal) * w, w);
  ctx.fillStyle = color + "30";
  ctx.beginPath();
  roundRect(ctx, x, barY, w, 4, 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  roundRect(ctx, x, barY, barW, 4, 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(value)}${unit}`, x + w / 2, y + 24);

  ctx.fillStyle = "#71717a";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(label, x + w / 2, y + 42);
}

/** Draw a section with a colored header + bullet items with text wrapping */
function drawBulletSection(
  ctx: CanvasRenderingContext2D,
  y: number,
  pad: number,
  cw: number,
  icon: string,
  title: string,
  titleColor: string,
  items: string[],
  itemColor: string,
  bullet: string,
  maxItems = 5
): number {
  ctx.fillStyle = titleColor;
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${icon}  ${title}`, pad + 4, y + 18);
  y += 30;

  ctx.font = "15px -apple-system, BlinkMacSystemFont, sans-serif";
  const maxTextW = cw - 40;

  items.slice(0, maxItems).forEach((item) => {
    ctx.fillStyle = itemColor;
    const lines = wrapText(ctx, item, maxTextW);
    lines.forEach((line, li) => {
      ctx.fillText(li === 0 ? `${bullet}  ${line}` : `    ${line}`, pad + 12, y + 16);
      y += 22;
    });
    y += 4; // gap between items
  });

  return y;
}

export async function createShareAnalysisImageBlob(
  imageSrc: string | null,
  analysis: FoodAnalysis,
  options: ShareRenderOptions = {}
): Promise<Blob> {
  const { width, minHeight, maxHeight } = { ...DEFAULTS, ...options };
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const pad = 48;
  const cw = width - pad * 2;
  const gap = 16;

  // Pre-compute data
  const riskScore = calculateRiskScore(analysis);
  const riskColor = riskScore <= 33 ? "#22c55e" : riskScore <= 66 ? "#f59e0b" : "#ef4444";
  const riskLabel = riskScore <= 33 ? "Low Risk" : riskScore <= 66 ? "Moderate" : "High Risk";
  const lifespanImpact = calculateLifespanImpact(analysis);
  const lifespanPositive = lifespanImpact >= 0;
  const lifespanColor = lifespanPositive ? "#22c55e" : "#ef4444";
  const absImpact = Math.abs(lifespanImpact);
  const impactText = absImpact < 1 ? `${lifespanPositive ? "+" : "-"}${Math.round(absImpact * 24)}h` : `${lifespanPositive ? "+" : "-"}${absImpact.toFixed(1)}d`;
  const diseaseRisks = (analysis.disease_risks ?? []).slice(0, 4);
  const hiddenIngredients = (analysis.hidden_ingredients ?? []).slice(0, 4);
  const whatTheyDontTellYou = (analysis.what_they_dont_tell_you ?? []).slice(0, 3);
  const alternatives = (analysis.safer_alternatives ?? []).slice(0, 3);
  const dailyBenefits = (analysis.daily_benefits ?? []).slice(0, 3);
  const dailyRisks = (analysis.daily_risks ?? []).slice(0, 3);
  const calories = n0((analysis as any).calories);
  const verdict = analysis.final_verdict ||
    (riskScore <= 33 ? "A healthy choice for your diet." : riskScore <= 60 ? "Okay in moderation." : "Limit or avoid this food.");

  // ── Estimate height (generous to avoid clipping) ──
  let estH = 80;
  if (imageSrc) estH += 280 + 24;
  estH += 70; // name
  if (analysis.cuisine || analysis.portion) estH += 30;
  estH += gap + 110; // risk card
  estH += gap + 80; // calories + lifespan row
  estH += gap + 76; // macros
  estH += gap + 60; // sugar/sodium pills
  if (diseaseRisks.length > 0) estH += gap + 40 + diseaseRisks.length * 50;
  if (hiddenIngredients.length > 0) estH += gap + 40 + hiddenIngredients.length * 50;
  if (whatTheyDontTellYou.length > 0) estH += gap + 40 + whatTheyDontTellYou.length * 70;
  if (dailyBenefits.length > 0) estH += gap + 40 + dailyBenefits.length * 50;
  if (dailyRisks.length > 0) estH += gap + 40 + dailyRisks.length * 50;
  if (alternatives.length > 0) estH += gap + 40 + alternatives.length * 50;
  if (analysis.summary) estH += gap + 120;
  estH += gap + 100; // verdict
  estH += 160; // watermark

  const height = clamp(Math.ceil(estH), minHeight, maxHeight);
  canvas.width = width;
  canvas.height = height;

  // ── Background ──
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#050505");
  bg.addColorStop(0.4, "#0d0d0d");
  bg.addColorStop(1, "#050505");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Subtle grain overlay
  ctx.fillStyle = "rgba(255,255,255,0.01)";
  for (let i = 0; i < 3000; i++) {
    ctx.fillRect(Math.random() * width, Math.random() * height, 1, 1);
  }

  let y = 64;

  // ── Food Image ──
  if (imageSrc) {
    try {
      const img = await loadImage(imageSrc);
      const imgW = cw;
      const imgH = 280;
      const imgX = pad;

      ctx.save();
      ctx.beginPath();
      roundRect(ctx, imgX, y, imgW, imgH, 24);
      ctx.clip();

      const scale = Math.max(imgW / img.width, imgH / img.height);
      const sw = img.width * scale;
      const sh = img.height * scale;
      ctx.drawImage(img, imgX + (imgW - sw) / 2, y + (imgH - sh) / 2, sw, sh);

      const imgGrad = ctx.createLinearGradient(0, y + imgH - 100, 0, y + imgH);
      imgGrad.addColorStop(0, "rgba(5,5,5,0)");
      imgGrad.addColorStop(1, "rgba(5,5,5,0.8)");
      ctx.fillStyle = imgGrad;
      ctx.fillRect(imgX, y, imgW, imgH);
      ctx.restore();

      y += imgH + 24;
    } catch {
      y += 16;
    }
  }

  // ── Food Name ──
  const foodName = analysis.food_name || "Food Analysis";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(foodName.length > 28 ? foodName.slice(0, 28) + "…" : foodName, width / 2, y + 36);
  y += 50;

  // Subtitle
  if (analysis.cuisine || analysis.portion) {
    ctx.fillStyle = "#52525b";
    ctx.font = "20px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText([analysis.cuisine, analysis.portion].filter(Boolean).join(" · "), width / 2, y + 18);
    y += 30;
  }

  y += gap;

  // ── Risk Score Card ──
  drawCard(ctx, pad, y, cw, 100, "#111111", "#222222", 20);

  const circleX = pad + cw - 70;
  const circleY = y + 50;
  const circleR = 32;
  ctx.beginPath();
  ctx.arc(circleX, circleY, circleR, 0, Math.PI * 2);
  ctx.fillStyle = riskColor + "20";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(circleX, circleY, circleR, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * riskScore / 100));
  ctx.strokeStyle = riskColor;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.fillStyle = riskColor;
  ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${riskScore}`, circleX, circleY + 7);

  ctx.textAlign = "left";
  ctx.fillStyle = "#71717a";
  ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("FOOD RISK SCORE", pad + 28, y + 38);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(riskLabel, pad + 28, y + 72);
  y += 100 + gap;

  // ── Calories + Lifespan Row ──
  const halfW = (cw - gap) / 2;

  drawCard(ctx, pad, y, halfW, 72, "#111111", "#222222", 16);
  ctx.fillStyle = "#71717a";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("CALORIES", pad + 20, y + 28);
  ctx.fillStyle = "#f97316";
  ctx.font = "bold 30px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(`${Math.round(calories)}`, pad + 20, y + 60);
  const calNumW = ctx.measureText(`${Math.round(calories)}`).width;
  ctx.fillStyle = "#71717a";
  ctx.font = "16px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(" cal", pad + 20 + calNumW, y + 60);

  const lsX = pad + halfW + gap;
  drawCard(ctx, lsX, y, halfW, 72, lifespanPositive ? "#052e1680" : "#450a0a80", lifespanPositive ? "#16653440" : "#7f1d1d40", 16);
  ctx.fillStyle = "#71717a";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("LIFESPAN IMPACT", lsX + 20, y + 28);
  ctx.fillStyle = lifespanColor;
  ctx.font = "bold 30px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(impactText, lsX + 20, y + 60);
  y += 72 + gap;

  // ── Macro Bars Row ──
  const macroW = (cw - gap * 4) / 5;
  const macros = [
    { label: "Protein", value: n0(analysis.protein_g), unit: "g", color: "#ec4899", max: 50 },
    { label: "Carbs", value: n0(analysis.carbs_g), unit: "g", color: "#eab308", max: 100 },
    { label: "Fat", value: n0(analysis.fat_g), unit: "g", color: "#3b82f6", max: 65 },
    { label: "Fiber", value: n0(analysis.fiber_g), unit: "g", color: "#22c55e", max: 30 },
    { label: "Sugar", value: n0(analysis.sugar_g), unit: "g", color: "#f97316", max: 50 },
  ];
  macros.forEach((m, i) => {
    drawMacroBar(ctx, pad + i * (macroW + gap), y, macroW, m.label, m.value, m.unit, m.color, m.max);
  });
  y += 56 + gap;

  // ── Warning Pills Row ──
  const pills: { text: string; bg: string; fg: string }[] = [];
  if (n0(analysis.sugar_g) > 15) pills.push({ text: `Sugar ${Math.round(n0(analysis.sugar_g))}g`, bg: "#f9731630", fg: "#f97316" });
  if (n0(analysis.sodium_mg) > 500) pills.push({ text: `Sodium ${Math.round(n0(analysis.sodium_mg))}mg`, bg: "#ef444430", fg: "#ef4444" });
  if (n0(analysis.fat_g) > 20) pills.push({ text: `High Fat`, bg: "#3b82f630", fg: "#3b82f6" });
  if (pills.length === 0) pills.push({ text: "✓ Clean", bg: "#22c55e20", fg: "#22c55e" });

  let pillX = pad;
  pills.forEach(p => {
    const pw = drawPill(ctx, pillX, y, p.text, p.bg, p.fg);
    pillX += pw + 10;
  });
  y += 32 + gap + 8;

  // ── Additives / Hidden Ingredients ──
  if (hiddenIngredients.length > 0) {
    y = drawBulletSection(ctx, y, pad, cw, "⚠️", "ADDITIVES", "#fbbf24", hiddenIngredients, "#d4d4d8", "•");
    y += gap;
  } else {
    // Show "No Harmful Additives" 
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("⚠️  ADDITIVES", pad + 4, y + 18);
    y += 30;
    ctx.fillStyle = "#22c55e";
    ctx.font = "15px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("✓  No Harmful Additives Detected", pad + 12, y + 16);
    y += 30 + gap;
  }

  // ── Disease Risks ──
  if (diseaseRisks.length > 0) {
    const isLowRisk = diseaseRisks.length === 1 && diseaseRisks[0].toLowerCase().includes("low");
    y = drawBulletSection(
      ctx, y, pad, cw,
      "☠️", "DISEASE RISK FLAGS",
      "#ef4444",
      diseaseRisks,
      isLowRisk ? "#22c55e" : "#ef4444",
      "•"
    );
    y += gap;
  }

  // ── Lifespan Impact Detail ──
  const lsDetailBg = lifespanPositive ? "#052e1650" : "#450a0a50";
  const lsDetailBorder = lifespanPositive ? "#16653440" : "#7f1d1d40";
  const lsDetailH = 60;
  drawCard(ctx, pad, y, cw, lsDetailH, lsDetailBg, lsDetailBorder, 16);
  ctx.fillStyle = "#71717a";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("HEALTHY LIFESPAN IMPACT", pad + 20, y + 24);
  ctx.fillStyle = lifespanColor;
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(
    lifespanPositive
      ? "Supports your longevity goals! Keep it up."
      : "Regular consumption may reduce healthy lifespan.",
    pad + 20, y + 46
  );
  y += lsDetailH + gap;

  // ── What They Don't Tell You ──
  if (whatTheyDontTellYou.length > 0) {
    y = drawBulletSection(
      ctx, y, pad, cw,
      "👁️", "WHAT THEY DON'T TELL YOU",
      "#d946ef",
      whatTheyDontTellYou,
      "#d4d4d8",
      "!"
    );
    y += gap;
  }

  // ── Daily Benefits (for healthy foods) ──
  if (dailyBenefits.length > 0 && analysis.health_impact !== "risky") {
    y = drawBulletSection(
      ctx, y, pad, cw,
      "✅", "BENEFITS IF EATEN REGULARLY",
      "#22c55e",
      dailyBenefits,
      "#a1a1aa",
      "•"
    );
    y += gap;
  }

  // ── Daily Risks (for risky foods) ──
  if (dailyRisks.length > 0 && analysis.health_impact !== "good") {
    y = drawBulletSection(
      ctx, y, pad, cw,
      "⚡", "RISKS IF CONSUMED FREQUENTLY",
      "#ef4444",
      dailyRisks,
      "#a1a1aa",
      "•"
    );
    y += gap;
  }

  // ── Safer Alternatives ──
  if (alternatives.length > 0) {
    y = drawBulletSection(
      ctx, y, pad, cw,
      "🌿", "SAFER ALTERNATIVES",
      "#a78bfa",
      alternatives,
      "#c4b5fd",
      "→"
    );
    y += gap;
  }

  // ── AI Summary ──
  if (analysis.summary) {
    ctx.fillStyle = "#22d3ee";
    ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("✨  AI INSIGHT", pad + 4, y + 18);
    y += 30;
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "16px -apple-system, BlinkMacSystemFont, sans-serif";
    const summaryLines = wrapText(ctx, analysis.summary, cw - 16).slice(0, 5);
    summaryLines.forEach((line, i) => ctx.fillText(line, pad + 4, y + 16 + i * 22));
    y += summaryLines.length * 22 + gap;
  }

  // ── Verdict Banner ──
  const verdictBg = riskScore <= 33 ? "#052e16" : riskScore <= 60 ? "#451a03" : "#450a0a";
  const verdictBorder = riskScore <= 33 ? "#166534" : riskScore <= 60 ? "#92400e" : "#7f1d1d";
  const verdictColor = riskScore <= 33 ? "#22c55e" : riskScore <= 60 ? "#f59e0b" : "#ef4444";

  ctx.font = "17px -apple-system, BlinkMacSystemFont, sans-serif";
  const verdictLines = wrapText(ctx, verdict, cw - 56).slice(0, 4);
  const verdictH = 48 + verdictLines.length * 24;
  drawCard(ctx, pad, y, cw, verdictH, verdictBg, verdictBorder, 16);
  ctx.fillStyle = verdictColor;
  ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("VERDICT", pad + 24, y + 24);
  ctx.fillStyle = "#ffffff";
  ctx.font = "17px -apple-system, BlinkMacSystemFont, sans-serif";
  verdictLines.forEach((line, i) => ctx.fillText(line, pad + 24, y + 46 + i * 24));
  y += verdictH + 24;

  // ── Watermark ──
  const wmY = Math.max(y + 16, height - 120);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad + 40, wmY);
  ctx.lineTo(width - pad - 40, wmY);
  ctx.stroke();

  const logoSize = 48;
  try {
    const logo = await loadImage(eatgenLogo);
    const logoX = width / 2 - 110;
    const logoY = wmY + 20;

    ctx.save();
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("EatGen AI", logoX + logoSize + 14, wmY + 46);
    ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "#52525b";
    ctx.fillText("Know what you eat", logoX + logoSize + 14, wmY + 66);
  } catch {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("EatGen AI", width / 2, wmY + 50);
    ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "#52525b";
    ctx.fillText("Know what you eat", width / 2, wmY + 72);
  }

  // Trim canvas to actual content height
  const finalHeight = clamp(wmY + 100, minHeight, maxHeight);
  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = finalHeight;
  const outCtx = outCanvas.getContext("2d")!;
  outCtx.drawImage(canvas, 0, 0);

  return new Promise((resolve, reject) => {
    outCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to create image"));
    }, "image/png", 1.0);
  });
}
