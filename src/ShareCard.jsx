import { useRef, useEffect, useState, useCallback } from "react";

const CARD_W = 680;
const DPR = 2;

const MEDALS = ["🥇", "🥈", "🥉"];

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCard(canvas, items, title) {
  const hasTitle = !!title;
  const headerH = hasTitle ? 105 : 78;
  const podiumH = 170;
  const remaining = items.slice(3, 10);
  const rowH = 40;
  const listH = remaining.length > 0 ? 18 + remaining.length * rowH + 8 : 0;
  const cardH = headerH + podiumH + listH + 40;

  const ctx = canvas.getContext("2d");
  canvas.width = CARD_W * DPR;
  canvas.height = cardH * DPR;
  ctx.scale(DPR, DPR);

  // ── Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, cardH);
  bgGrad.addColorStop(0, "#f5f1e8");
  bgGrad.addColorStop(0.5, "#f0ece4");
  bgGrad.addColorStop(1, "#e8e3d9");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CARD_W, cardH);

  // Gold accent line top
  const topGrad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  topGrad.addColorStop(0, "rgba(184,134,11,0)");
  topGrad.addColorStop(0.3, "rgba(184,134,11,0.5)");
  topGrad.addColorStop(0.5, "rgba(212,160,23,0.7)");
  topGrad.addColorStop(0.7, "rgba(184,134,11,0.5)");
  topGrad.addColorStop(1, "rgba(184,134,11,0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, CARD_W, 3);

  // Border
  ctx.strokeStyle = "rgba(184,134,11,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, CARD_W - 1, cardH - 1);

  // ── Header
  let y = 30;
  ctx.textAlign = "center";
  ctx.fillStyle = "#a0936b";
  ctx.font = "600 10px 'Raleway', sans-serif";
  ctx.letterSpacing = "8px";
  ctx.fillText("CLASSEMENT FINAL", CARD_W / 2, y);
  ctx.letterSpacing = "0px";

  if (hasTitle) {
    y += 30;
    ctx.fillStyle = "#b8860b";
    ctx.font = "900 26px 'Cinzel Decorative', 'Cinzel', serif";
    ctx.fillText(truncate(ctx, title, CARD_W - 80), CARD_W / 2, y);
  }

  // Ornamental divider
  y += 16;
  const ornLen = 70;
  ctx.strokeStyle = "rgba(184,134,11,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CARD_W / 2 - ornLen, y);
  ctx.lineTo(CARD_W / 2 + ornLen, y);
  ctx.stroke();
  ctx.fillStyle = "rgba(184,134,11,0.4)";
  ctx.save();
  ctx.translate(CARD_W / 2, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();

  // ── Podium
  const podiumTop = headerH;
  const podiumBase = podiumTop + podiumH;
  const cx = CARD_W / 2;
  const platW = 175;
  const platGap = 8;

  const podiumData = [
    { rank: 0, x: cx, h: 115, textSize: 15, nameWeight: "700" },
    { rank: 1, x: cx - platW - platGap, h: 85, textSize: 13, nameWeight: "600" },
    { rank: 2, x: cx + platW + platGap, h: 65, textSize: 13, nameWeight: "600" },
  ];

  for (const pod of podiumData) {
    const item = items[pod.rank];
    if (!item) continue;

    const platX = pod.x - platW / 2;
    const platY = podiumBase - pod.h;

    // Platform gradient
    const grad = ctx.createLinearGradient(platX, platY, platX, podiumBase);
    grad.addColorStop(0, pod.rank === 0 ? "rgba(184,134,11,0.18)" : "rgba(140,130,110,0.12)");
    grad.addColorStop(1, pod.rank === 0 ? "rgba(184,134,11,0.04)" : "rgba(140,130,110,0.02)");
    ctx.fillStyle = grad;
    roundRect(ctx, platX, platY, platW, pod.h, 6);
    ctx.fill();

    ctx.strokeStyle = pod.rank === 0 ? "rgba(184,134,11,0.3)" : "rgba(160,147,107,0.15)";
    ctx.lineWidth = 1;
    roundRect(ctx, platX, platY, platW, pod.h, 6);
    ctx.stroke();

    // Medal
    ctx.font = "22px serif";
    ctx.textAlign = "center";
    ctx.fillText(MEDALS[pod.rank], pod.x, platY - 8);

    // Name inside platform (vertically centered)
    ctx.fillStyle = pod.rank === 0 ? "#3a3832" : "#5a564e";
    ctx.font = `${pod.nameWeight} ${pod.textSize}px 'Raleway', sans-serif`;
    ctx.textAlign = "center";

    const words = item.split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > platW - 24) {
        if (cur) lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);

    const lh = pod.textSize + 4;
    const totalTextH = Math.min(lines.length, 3) * lh;
    const textY = platY + (pod.h - totalTextH) / 2 + lh - 2;
    for (let l = 0; l < Math.min(lines.length, 3); l++) {
      const line = l === 2 && lines.length > 3
        ? truncate(ctx, lines[l], platW - 24) : lines[l];
      ctx.fillText(line, pod.x, textY + l * lh);
    }
  }

  // ── Remaining items
  if (remaining.length > 0) {
    const listTop = podiumBase + 18;

    // Gradient separator
    const sepGrad = ctx.createLinearGradient(60, 0, CARD_W - 60, 0);
    sepGrad.addColorStop(0, "rgba(184,134,11,0)");
    sepGrad.addColorStop(0.5, "rgba(184,134,11,0.2)");
    sepGrad.addColorStop(1, "rgba(184,134,11,0)");
    ctx.fillStyle = sepGrad;
    ctx.fillRect(60, listTop - 6, CARD_W - 120, 1);

    for (let i = 0; i < remaining.length; i++) {
      const ry = listTop + i * rowH + 14;
      const rank = i + 4;

      // Alternating background
      if (i % 2 === 0) {
        ctx.fillStyle = "rgba(184,134,11,0.035)";
        roundRect(ctx, 50, ry - 14, CARD_W - 100, rowH - 4, 4);
        ctx.fill();
      }

      // Rank circle
      const circleX = 85;
      ctx.beginPath();
      ctx.arc(circleX, ry, 11, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(184,134,11,0.08)";
      ctx.fill();
      ctx.strokeStyle = "rgba(184,134,11,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#9a9488";
      ctx.font = "700 11px 'Cinzel', serif";
      ctx.textAlign = "center";
      ctx.fillText(`${rank}`, circleX, ry + 4);

      // Item name
      ctx.fillStyle = "#5a564e";
      ctx.font = "500 14px 'Raleway', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(truncate(ctx, remaining[i], CARD_W - 170), 108, ry + 5);
    }
  }

  // Gold accent line bottom
  const botGrad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  botGrad.addColorStop(0, "rgba(184,134,11,0)");
  botGrad.addColorStop(0.3, "rgba(184,134,11,0.3)");
  botGrad.addColorStop(0.5, "rgba(212,160,23,0.5)");
  botGrad.addColorStop(0.7, "rgba(184,134,11,0.3)");
  botGrad.addColorStop(1, "rgba(184,134,11,0)");
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, cardH - 3, CARD_W, 3);
}

export default function ShareCard({ sorted, listName }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const draw = useCallback(() => {
    if (!canvasRef.current || !sorted?.length) return;
    drawCard(canvasRef.current, sorted, listName || null);
  }, [sorted, listName]);

  useEffect(() => {
    if (open) requestAnimationFrame(draw);
  }, [open, draw]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = "classement.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const handleCopy = async () => {
    if (!canvasRef.current) return;
    try {
      const blob = await new Promise((resolve) =>
        canvasRef.current.toBlob(resolve, "image/png")
      );
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      handleDownload();
    }
  };

  if (!sorted || sorted.length < 2) return null;

  return (
    <div className="share-card-section">
      {!open ? (
        <button className="btn-share-card" onClick={() => setOpen(true)}>
          🖼 Générer une carte partageable
        </button>
      ) : (
        <div className="share-card-wrap fade">
          <div className="share-card-preview">
            <canvas ref={canvasRef} />
          </div>
          <div className="share-card-actions">
            <button className="btn-gold" onClick={handleDownload}>
              ↓ Télécharger l'image
            </button>
            <button className="btn-ghost" onClick={handleCopy}>
              {copied ? "✓ Copié !" : "📋 Copier dans le presse-papier"}
            </button>
            <button
              className="btn-ghost"
              onClick={() => setOpen(false)}
              style={{ fontSize: "0.75rem" }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
