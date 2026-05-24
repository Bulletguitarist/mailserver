// Rule-based spam scoring system
// Score 0-10: 0-3 = clean, 4-6 = suspicious, 7+ = spam

const SPAM_KEYWORDS = [
  'viagra', 'casino', 'lottery', 'winner', 'prize',
  'click here', 'free money', 'make money fast', 'work from home',
  'urgent', 'act now', 'limited time', 'guaranteed', 'no risk',
  'bitcoin', 'crypto investment', 'double your money',
  'dear friend', 'dear beneficiary', 'inheritance',
  'nigerian prince', 'bank transfer', 'wire transfer',
  'unsubscribe', 'opt out', 'remove me',
];

const SPAM_PATTERNS = [
  /\b(earn|make)\s+\$[\d,]+\b/i,
  /\b100%\s*(free|guaranteed)\b/i,
  /\bfree\s*(gift|offer|trial)\b/i,
  /[A-Z]{5,}/,                          // Excessive caps
  /!{2,}/,                               // Multiple exclamation marks
  /\b(click|tap)\s+here\b/i,
  /\bwon\s+\$[\d,]+\b/i,
  /\byou\s+have\s+been\s+selected\b/i,
];

const scoreEmail = (email) => {
  let score = 0;
  const reasons = [];

  const subject = (email.subject || '').toLowerCase();
  const body    = (email.text || email.body || '').toLowerCase();
  const from    = (email.from || '').toLowerCase();
  const combined = `${subject} ${body}`;

  // Keyword matching
  for (const keyword of SPAM_KEYWORDS) {
    if (combined.includes(keyword)) {
      score += 0.8;
      reasons.push(`keyword: "${keyword}"`);
    }
  }

  // Pattern matching
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(combined)) {
      score += 1.2;
      reasons.push(`pattern: ${pattern.toString()}`);
    }
  }

  // Suspicious sender checks
  if (!from.includes('@')) {
    score += 2;
    reasons.push('invalid sender format');
  }

  if (from.includes('noreply') && !from.includes('gmail') && !from.includes('outlook')) {
    score += 0.5;
    reasons.push('noreply sender');
  }

  // Subject checks
  if (subject === subject.toUpperCase() && subject.length > 5) {
    score += 1.5;
    reasons.push('all caps subject');
  }

  if (!subject || subject.trim() === '') {
    score += 1;
    reasons.push('empty subject');
  }

  // Clamp to 0-10
  score = Math.min(10, Math.max(0, parseFloat(score.toFixed(2))));

  return {
    score,
    isSpam: score >= 7,
    isSuspicious: score >= 4 && score < 7,
    reasons,
    label: score >= 7 ? 'SPAM' : score >= 4 ? 'SUSPICIOUS' : 'CLEAN',
  };
};

module.exports = { scoreEmail };