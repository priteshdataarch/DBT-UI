// Unit tests for RAG scoring logic
// We inline the pure functions to avoid server-side fs imports in Jest

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreFile(filePath: string, content: string, queryTokens: string[]): number {
  const pathTokens = tokenize(filePath);
  const contentTokens = tokenize(content);
  let score = 0;

  for (const qt of queryTokens) {
    if (pathTokens.includes(qt)) score += 3;
    score += Math.min(contentTokens.filter((t) => t === qt).length, 5);
  }

  if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) score += 1;

  return score;
}

describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('removes short tokens (length <= 2)', () => {
    const tokens = tokenize('f_score is a model');
    expect(tokens).not.toContain('is');
    expect(tokens).not.toContain('a');
  });

  it('handles underscore-delimited words', () => {
    const tokens = tokenize('f_sessions_final');
    expect(tokens).toContain('f_sessions_final');
  });

  it('strips special characters', () => {
    const tokens = tokenize('SELECT * FROM {{ ref("sessions") }}');
    expect(tokens).toContain('select');
    expect(tokens).toContain('from');
    expect(tokens).toContain('ref');
    expect(tokens).toContain('sessions');
  });
});

describe('scoreFile', () => {
  it('returns 0 when no tokens match', () => {
    const score = scoreFile(
      'models/marts/f_score.sql',
      'select score from scores',
      ['xyz_random_unmatched']
    );
    expect(score).toBe(0);
  });

  it('gives higher score for path matches than content matches', () => {
    // tokenize('models/marts/session.sql') → ['models', 'marts', 'session', 'sql']
    // so 'session' is an exact path token → +3 pts
    const pathMatchScore = scoreFile(
      'models/marts/session.sql',
      'some unrelated content here',
      ['session']
    );
    // content has one occurrence of 'session' → +1 pt, no path match
    const contentMatchScore = scoreFile(
      'models/marts/f_other.sql',
      'session data in content',
      ['session']
    );
    expect(pathMatchScore).toBeGreaterThan(contentMatchScore);
  });

  it('boosts YAML files by 1 point', () => {
    const baseScore = scoreFile('models/marts/f_data.sql', 'session data', ['session']);
    const ymlScore = scoreFile('models/marts/schema.yml', 'session data', ['session']);
    expect(ymlScore).toBe(baseScore + 1);
  });

  it('caps content matches at 5 per token', () => {
    const repeated = 'session '.repeat(20);
    const score = scoreFile('models/test.sql', repeated, ['session']);
    // max content contribution = 5, no path match, no yml boost
    expect(score).toBeLessThanOrEqual(5);
  });

  it('accumulates score across multiple matching tokens', () => {
    // tokenize(path) → ['models', 'marts', 'f_sessions_final', 'sql'] — no exact token match
    // content matches: 'sessions'×2=2, 'final'×1=1, 'users'×1=1 → total = 4
    const score = scoreFile(
      'models/marts/f_sessions_final.sql',
      'select sessions from users join sessions final',
      ['sessions', 'final', 'users']
    );
    expect(score).toBeGreaterThan(3);
  });
});

describe('top-k selection', () => {
  it('selects top K files by score', () => {
    const files = [
      { path: 'models/a.sql', content: 'session data session' },
      { path: 'models/b.sql', content: 'something else entirely' },
      { path: 'models/c.sql', content: 'session session session session session' },
      { path: 'models/d.yml', content: 'session schema' },
    ];

    const queryTokens = tokenize('create a session model');
    const topK = 2;

    const scored = files
      .map((f) => ({ ...f, score: scoreFile(f.path, f.content, queryTokens) }))
      .filter((f) => f.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    expect(scored.length).toBeLessThanOrEqual(topK);
    expect(scored[0].score).toBeGreaterThanOrEqual(scored[scored.length - 1].score);
  });
});
