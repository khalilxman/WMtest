// This is the full content for public/generation.worker.js

const generateDigits = (length, maxAttempts = 1000) => {
  const maxCount = length < 15 ? 2 : Infinity;
  const minSeparation = 4; // for duplicates under 15

  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    const counts = {};
    const positions = {};
    const result = [];
    const candidates = Array.from({ length: 10 }, (_, i) => i);

    function backtrack(idx) {
      if (idx === length) return true;

      const order = candidates.slice().sort(() => Math.random() - 0.5);

      for (const d of order) {
        const c = counts[d] || 0;

        if (c >= maxCount) continue;
        if (idx > 0 && Math.abs(result[idx - 1] - d) <= 2) continue;

        if (c === 1 && length < 15) {
          const prevIdx = positions[d][0];
          if (idx - prevIdx < minSeparation) continue;
        }

        result[idx] = d;
        counts[d] = c + 1;
        positions[d] = positions[d] ? positions[d].concat(idx) : [idx];

        if (idx >= 2) {
          const a = result[idx - 2], b = result[idx - 1], c2 = result[idx];
          if (b - a === c2 - b) {
            counts[d]--;
            positions[d].pop();
            continue;
          }
        }

        if (backtrack(idx + 1)) return true;

        counts[d]--;
        positions[d].pop();
      }
      return false;
    }

    if (backtrack(0)) {
      return { sequence: result, isValid: true };
    }
  }

  // Fallback to less strict rules if max attempts are reached
  const fallback = Array.from({ length }, () => Math.floor(Math.random() * 10));
  return { sequence: fallback, isValid: false };
};

self.onmessage = (e) => {
  const { length } = e.data;
  const result = generateDigits(length);
  self.postMessage(result);
};
