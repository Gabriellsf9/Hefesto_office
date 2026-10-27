import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

// Texturas geradas em canvas: pisos, carpetes, quadros e manchas de luz.
// Sem arquivos externos, e cada uma é criada uma vez só (cache).

const cache = new Map<string, CanvasTexture>();

function criar(chave: string, w: number, h: number, desenhar: (ctx: CanvasRenderingContext2D) => void, repetir = false) {
  const existente = cache.get(chave);
  if (existente) return existente;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  desenhar(canvas.getContext("2d")!);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  if (repetir) tex.wrapS = tex.wrapT = RepeatWrapping;
  cache.set(chave, tex);
  return tex;
}

/** Gerador pseudoaleatório determinístico: a decoração fica igual a cada carregamento. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Piso de tábuas de madeira. */
export function madeira(base = "#c9a37a") {
  return criar(`madeira-${base}`, 512, 512, (ctx) => {
    const r = rng(7);
    const tabua = 64;
    for (let y = 0; y < 512; y += tabua) {
      let x = -Math.floor(r() * 200);
      while (x < 512) {
        const len = 180 + r() * 200;
        const l = 0.88 + r() * 0.2;
        ctx.fillStyle = sombrear(base, l);
        ctx.fillRect(x, y, len, tabua);
        // veios
        ctx.strokeStyle = sombrear(base, l * 0.9);
        ctx.lineWidth = 1;
        for (let v = 0; v < 4; v++) {
          const vy = y + 8 + r() * (tabua - 16);
          ctx.beginPath();
          ctx.moveTo(x, vy);
          ctx.bezierCurveTo(x + len * 0.3, vy + (r() - 0.5) * 6, x + len * 0.7, vy + (r() - 0.5) * 6, x + len, vy);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(60,40,20,0.35)";
        ctx.fillRect(x + len - 1, y, 2, tabua);
        x += len;
      }
      ctx.fillStyle = "rgba(60,40,20,0.4)";
      ctx.fillRect(0, y, 512, 2);
    }
  }, true);
}

/** Carpete com trama fina e leve variação. */
export function carpete(base: string) {
  return criar(`carpete-${base}`, 256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    const r = rng(hashStr(base));
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
      ctx.fillRect(r() * 256, r() * 256, 1.5, 1.5);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.04)";
    for (let i = 0; i < 256; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
    }
  }, true);
}

/** Tapete com borda e padrão geométrico. */
export function tapete(base: string, detalhe: string, seed: number) {
  return criar(`tapete-${base}-${detalhe}-${seed}`, 512, 320, (ctx) => {
    const r = rng(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = detalhe;
    ctx.lineWidth = 10;
    ctx.strokeRect(18, 18, 476, 284);
    ctx.lineWidth = 3;
    ctx.strokeRect(38, 38, 436, 244);
    const estilo = Math.floor(r() * 3);
    ctx.fillStyle = detalhe;
    ctx.globalAlpha = 0.55;
    if (estilo === 0) {
      for (let x = 70; x < 460; x += 44)
        for (let y = 70; y < 260; y += 44) {
          ctx.beginPath();
          ctx.moveTo(x, y - 12);
          ctx.lineTo(x + 12, y);
          ctx.lineTo(x, y + 12);
          ctx.lineTo(x - 12, y);
          ctx.fill();
        }
    } else if (estilo === 1) {
      for (let x = 60; x < 470; x += 26) ctx.fillRect(x, 60, 10, 200);
    } else {
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(256, 160, 30 + i * 22, 0, Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = detalhe;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
      ctx.fillRect(r() * 512, r() * 320, 2, 2);
    }
  });
}

/** Piso de porcelanato em placas grandes. */
export function porcelanato(base = "#e9e6df") {
  return criar(`porcelanato-${base}`, 256, 256, (ctx) => {
    const r = rng(11);
    for (let x = 0; x < 256; x += 128)
      for (let y = 0; y < 256; y += 128) {
        ctx.fillStyle = sombrear(base, 0.97 + r() * 0.05);
        ctx.fillRect(x, y, 128, 128);
      }
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 128) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
  }, true);
}

/** Quadro abstrato gerado: cada seed é uma "obra" diferente. */
export function arte(seed: number) {
  return criar(`arte-${seed}`, 256, 192, (ctx) => {
    const r = rng(seed);
    const paletas = [
      ["#f4d35e", "#ee964b", "#f95738", "#0d3b66", "#faf0ca"],
      ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"],
      ["#ffcdb2", "#ffb4a2", "#e5989b", "#b5838d", "#6d6875"],
      ["#003049", "#d62828", "#f77f00", "#fcbf49", "#eae2b7"],
      ["#606c38", "#283618", "#fefae0", "#dda15e", "#bc6c25"],
      ["#8ecae6", "#219ebc", "#023047", "#ffb703", "#fb8500"],
    ];
    const p = paletas[Math.floor(r() * paletas.length)]!;
    ctx.fillStyle = p[4]!;
    ctx.fillRect(0, 0, 256, 192);
    const estilo = Math.floor(r() * 4);
    if (estilo === 0) {
      // paisagem: céu, sol, montanhas
      ctx.fillStyle = p[0]!;
      ctx.beginPath();
      ctx.arc(70 + r() * 120, 60, 26, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = p[1 + i]!;
        ctx.beginPath();
        ctx.moveTo(0, 192);
        const base = 110 + i * 25;
        for (let x = 0; x <= 256; x += 32) ctx.lineTo(x, base - r() * 40);
        ctx.lineTo(256, 192);
        ctx.fill();
      }
    } else if (estilo === 1) {
      // blocos à la Mondrian
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = p[Math.floor(r() * 4)]!;
        ctx.fillRect(r() * 200, r() * 150, 30 + r() * 90, 20 + r() * 70);
      }
      ctx.strokeStyle = "#1b1b1b";
      ctx.lineWidth = 5;
      for (let i = 0; i < 4; i++) {
        const x = r() * 256;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 192);
        ctx.stroke();
      }
    } else if (estilo === 2) {
      // círculos sobrepostos
      for (let i = 0; i < 7; i++) {
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = p[Math.floor(r() * 4)]!;
        ctx.beginPath();
        ctx.arc(r() * 256, r() * 192, 20 + r() * 60, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      // ondas
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = p[i % 4]!;
        ctx.lineWidth = 10 + r() * 8;
        ctx.beginPath();
        for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, 30 + i * 28 + Math.sin(x / 30 + i) * 14);
        ctx.stroke();
      }
    }
  });
}

/** Mancha de luz radial, para simular a luz das luminárias no chão. */
export function manchaDeLuz() {
  return criar("mancha", 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,236,190,0.9)");
    g.addColorStop(0.4, "rgba(255,226,170,0.35)");
    g.addColorStop(1, "rgba(255,220,160,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Tela de TV/painel: gráficos ou linhas de código. */
export function tela(tipo: "grafico" | "codigo" | "monitoramento", cor: string) {
  return criar(`tela-${tipo}-${cor}`, 256, 144, (ctx) => {
    const r = rng(hashStr(tipo + cor));
    ctx.fillStyle = "#0f1420";
    ctx.fillRect(0, 0, 256, 144);
    if (tipo === "codigo") {
      for (let y = 12; y < 140; y += 10) {
        let x = 10 + Math.floor(r() * 3) * 12;
        while (x < 230 && r() > 0.15) {
          const w = 10 + r() * 40;
          ctx.fillStyle = ["#7dd3fc", "#f0abfc", "#fde68a", "#86efac", "#cbd5e1"][Math.floor(r() * 5)]!;
          ctx.fillRect(x, y, w, 4);
          x += w + 6;
        }
      }
    } else if (tipo === "grafico") {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(8, 8, 240, 128);
      for (let i = 0; i < 10; i++) {
        const h = 20 + r() * 90;
        ctx.fillStyle = cor;
        ctx.fillRect(20 + i * 22, 128 - h, 14, h);
      }
      ctx.strokeStyle = "#fde68a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) ctx.lineTo(27 + i * 22, 90 - r() * 60);
      ctx.stroke();
    } else {
      for (let i = 0; i < 4; i++) {
        const x = 8 + (i % 2) * 124;
        const y = 8 + Math.floor(i / 2) * 68;
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(x, y, 116, 60);
        ctx.strokeStyle = i === 3 ? "#f87171" : cor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let px = 0; px <= 116; px += 6) ctx.lineTo(x + px, y + 40 - r() * 26);
        ctx.stroke();
      }
    }
  });
}

/** Clareia (>1) ou escurece (<1) uma cor hex. */
export function sombrear(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
