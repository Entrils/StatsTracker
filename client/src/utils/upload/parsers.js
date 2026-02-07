export function extractMatchId(text) {
  if (!text) return null;

  const raw = text.toLowerCase();
  const lines = raw.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (
      /(match\s*id|matchid|код\s*матча|code\s*de\s*correspondance|match-?nummer)/.test(
        line
      )
    ) {
      const candidateLine =
        line + " " + (lines[i + 1] || "") + " " + (lines[i + 2] || "");
      const token = candidateLine.match(/[a-z0-9]{6,32}/i);
      if (token) return token[0];
      const compact = candidateLine.replace(/[^a-f0-9]/gi, "");
      if (compact.length >= 6) return compact;
    }
  }
  const labelHit = raw.match(
    /(?:match\s*id|matchid|код\s*матча|code\s*de\s*correspondance|match-?nummer)\s*[:#-]?\s*([a-f0-9]{6,32})/
  );
  if (labelHit) return labelHit[1];

  const hex = raw.match(/\b[a-f0-9]{12,32}\b/);
  if (hex) return hex[0];

  const normalized = raw
    .replace(/[\s:]/g, "")
    .replace(/[li]/g, "1")
    .replace(/o/g, "0")
    .replace(/[а]/g, "a")
    .replace(/[в]/g, "b")
    .replace(/[с]/g, "c")
    .replace(/[е]/g, "e")
    .replace(/[ф]/g, "f");

  const labelNormalized = normalized.match(
    /(matchid|кодматча|codedecorrespondance|matchnummer)([a-f0-9]{6,32})/
  );
  if (labelNormalized) return labelNormalized[2];

  const numeric = normalized.match(/\d{7,16}/);
  return numeric ? numeric[0] : null;
}

export function parseMatchResult(text) {
  if (!text) return null;
  const t = String(text).toUpperCase();
  const normalized = t.normalize("NFD").replace(/\p{M}/gu, "");
  const fuzzyLatin = normalized
    .replace(/[^A-Z0-9]/g, "")
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/3/g, "E")
    .replace(/4/g, "A")
    .replace(/5/g, "S")
    .replace(/7/g, "T");
  const latin = t.replace(/[^A-Z]/g, "");
  const latinConfusable = latin
    .replace(/M/g, "P")
    .replace(/N/g, "O")
    .replace(/O/g, "O")
    .replace(/B/g, "B")
    .replace(/E/g, "E")
    .replace(/A/g, "A")
    .replace(/D/g, "D")
    .replace(/P/g, "P")
    .replace(/R/g, "R")
    .replace(/T/g, "T")
    .replace(/Y/g, "Y")
    .replace(/K/g, "K")
    .replace(/X/g, "X");
  const cyrA = t
    .replace(/[A]/g, "А")
    .replace(/[B]/g, "В")
    .replace(/[C]/g, "С")
    .replace(/[E]/g, "Е")
    .replace(/[H]/g, "Н")
    .replace(/[K]/g, "К")
    .replace(/[M]/g, "М")
    .replace(/[O]/g, "О")
    .replace(/[P]/g, "Р")
    .replace(/[T]/g, "Т")
    .replace(/[X]/g, "Х")
    .replace(/[Y]/g, "У")
    .replace(/[N]/g, "И")
    .replace(/[V]/g, "В")
    .replace(/[^А-Я]/g, "");
  const cyrB = t
    .replace(/[A]/g, "А")
    .replace(/[B]/g, "В")
    .replace(/[C]/g, "С")
    .replace(/[E]/g, "Е")
    .replace(/[H]/g, "Н")
    .replace(/[K]/g, "К")
    .replace(/[M]/g, "П")
    .replace(/[O]/g, "О")
    .replace(/[P]/g, "Р")
    .replace(/[T]/g, "Т")
    .replace(/[X]/g, "Х")
    .replace(/[Y]/g, "У")
    .replace(/[N]/g, "О")
    .replace(/[V]/g, "В")
    .replace(/[^А-Я]/g, "");
  if (
    latin.includes("VICTORY") ||
    latinConfusable.includes("POBE") ||
    latinConfusable.includes("POBED") ||
    latinConfusable.includes("POB") ||
    fuzzyLatin.includes("VICTORY") ||
    fuzzyLatin.includes("VICT0RY") ||
    fuzzyLatin.includes("VICT0R") ||
    fuzzyLatin.includes("VICT0") ||
    normalized.includes("VICTOIRE") ||
    t.includes("SIEG") ||
    cyrA.includes("ПОБЕД") ||
    cyrA.includes("ПОБЕ") ||
    cyrB.includes("ПОБЕД") ||
    cyrB.includes("ПОБЕ") ||
    t.includes("ПОБЕДА")
  ) {
    return "victory";
  }
  if (
    latin.includes("DEFEAT") ||
    latinConfusable.includes("PORA") ||
    latinConfusable.includes("PORAZH") ||
    latinConfusable.includes("PORAZ") ||
    fuzzyLatin.includes("DEFEAT") ||
    fuzzyLatin.includes("DEFEA") ||
    fuzzyLatin.includes("DEFE4T") ||
    normalized.includes("DEFAITE") ||
    t.includes("VERLUST") ||
    cyrA.includes("ПОРАЖ") ||
    cyrA.includes("ПОРА") ||
    cyrB.includes("ПОРАЖ") ||
    cyrB.includes("ПОРА") ||
    t.includes("ПОРАЖЕНИЕ")
  ) {
    return "defeat";
  }

  return null;
}

export function parseFragpunkText(text, ownerUid, ownerName) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let score;
  let kda;
  let dmg;
  let share;

  for (const line of lines) {
    if (!score && /^\d{3,6}$/.test(line)) score = line;
    else if (!kda && /^\d+\s*\/\s*\d+\s*\/\s*\d+$/.test(line)) {
      kda = line.replace(/\s/g, "");
    } else if (!dmg && /^\d{2,6}$/.test(line)) {
      dmg = line;
    } else if (!share && /^\d{1,3}([.,]\d)?\s*%$/.test(line)) {
      share = line.replace(/\s+/g, "");
    }
  }

  if (!score || !kda || !dmg || !share) return null;

  const [kills, deaths, assists] = kda.split("/").map(Number);
  const parsedScore = Number(score);
  const parsedDamage = Number(dmg);
  const parsedShareRaw = parseFloat(share.replace("%", "").replace(",", "."));

  if (
    !Number.isFinite(parsedScore) ||
    !Number.isFinite(parsedDamage) ||
    !Number.isFinite(kills) ||
    !Number.isFinite(deaths) ||
    !Number.isFinite(assists)
  ) {
    return null;
  }

  let parsedShare = parsedShareRaw;
  while (
    Number.isFinite(parsedShare) &&
    parsedShare > 100 &&
    parsedShare <= 1000
  ) {
    parsedShare /= 10;
  }
  if (!Number.isFinite(parsedShare) || parsedShare < 0 || parsedShare > 100) {
    return null;
  }

  return {
    ownerUid,
    name: ownerName,
    score: parsedScore,
    kills,
    deaths,
    assists,
    damage: parsedDamage,
    damageShare: Math.round(parsedShare * 10) / 10,
    createdAt: Date.now(),
  };
}

