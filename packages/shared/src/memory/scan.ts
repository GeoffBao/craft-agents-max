/**
 * Memory content safety scan — reject obvious secrets and prompt-injection patterns.
 */

const SECRET_PATTERNS = [
  /\b(sk-[a-zA-Z0-9]{20,})\b/,
  /\b(ghp_[a-zA-Z0-9]{20,})\b/,
  /\b(gho_[a-zA-Z0-9]{20,})\b/,
  /\b(xox[baprs]-[a-zA-Z0-9-]{10,})\b/,
  /\b(AKIA[0-9A-Z]{16})\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,})/i,
  /\b(password\s*[:=]\s*['"]?[^\s'"]{8,})/i,
];

const INJECTION_PATTERNS = [
  /ignore (?:all )?(?:previous|prior) instructions/i,
  /you are now (?:a |an )?(?:DAN|unrestricted)/i,
  /system prompt/i,
  /<\/?system>/i,
  /disregard (?:your |the )?(?:rules|guidelines)/i,
];

export interface MemoryScanResult {
  safe: boolean;
  reason?: string;
}

export function scanMemoryContent(content: string): MemoryScanResult {
  const trimmed = content.trim();
  if (!trimmed) {
    return { safe: false, reason: 'Content is empty.' };
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      return { safe: false, reason: 'Content appears to contain secrets or credentials. Store references, not values.' };
    }
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      return { safe: false, reason: 'Content resembles prompt-injection text and was rejected.' };
    }
  }

  return { safe: true };
}
