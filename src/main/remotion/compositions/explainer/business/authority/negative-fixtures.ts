import { isRec, type Rec } from '../../../../../ai/explainer/kind-spec';
import type { BusinessWordSpan } from '../types';
import { AUTHORITY_RAW_FIXTURES, type AuthorityRawFixture } from './fixtures';

/** Test inputs stay RAW: no typed scene, weakened parser or invented layout payload. */
export function authorityFixture(recipeId: string): AuthorityRawFixture {
  const fixture = AUTHORITY_RAW_FIXTURES.find((entry) => entry.recipeId === recipeId);
  if (!fixture) throw new Error(`Missing authority RAW fixture ${recipeId}`);
  return structuredClone(fixture);
}
export function authorityRawAt(fixture: AuthorityRawFixture, ...path: (string | number)[]): Rec {
  let value: unknown = fixture.raw;
  for (const key of path) {
    if (Array.isArray(value) && typeof key === 'number') value = value[key];
    else if (isRec(value) && typeof key === 'string') value = value[key];
    else throw new Error(`Invalid RAW fixture path ${path.join('.')}`);
  }
  if (!isRec(value)) throw new Error(`Not a RAW record: ${path.join('.')}`);
  return value;
}
export function authoritySource(
  fixture: AuthorityRawFixture,
  ...path: (string | number)[]
): BusinessWordSpan {
  const source = authorityRawAt(fixture, ...path);
  if (typeof source.fromWord !== 'number' || typeof source.toWord !== 'number')
    throw new Error('Not a word-indexed source span');
  return { fromWord: source.fromWord, toWord: source.toWord };
}
export function rewriteAuthoritySource(
  fixture: AuthorityRawFixture,
  source: BusinessWordSpan,
  from: string,
  to: string,
): void {
  const text = fixture.words
    .slice(source.fromWord, source.toWord + 1)
    .map((word) => word.text)
    .join(' ');
  if (!text.includes(from)) throw new Error(`Absent source claim: ${from}`);
  const tokens = text.replace(from, to).split(/\s+/u);
  if (tokens.length !== source.toWord - source.fromWord + 1)
    throw new Error('Source mutation must preserve literal word indices');
  tokens.forEach((text, offset) => {
    fixture.words[source.fromWord + offset].text = text;
  });
}
interface AuthoritySourceNegative {
  recipeId: string;
  name: string;
  fixture: AuthorityRawFixture;
}
function negative(
  recipeId: string,
  name: string,
  mutate: (fixture: AuthorityRawFixture) => void,
): AuthoritySourceNegative {
  const fixture = authorityFixture(recipeId);
  mutate(fixture);
  return { recipeId, name, fixture };
}
function actionSwap(fixture: AuthorityRawFixture): void {
  authorityRawAt(fixture, 'action').label = 'Release funds'; // Present in setup, not the actual claim.
}
function finalSuccess(fixture: AuthorityRawFixture): void {
  const fromWord = fixture.raw.resolveWord;
  if (typeof fromWord !== 'number') throw new Error('Missing resolve word');
  fixture.words[fromWord].text = 'Approved';
  fixture.raw.outcome = 'Approved';
}

/** Each OP has its own actor/action, state and source-boundary failures. */
export const AUTHORITY_SOURCE_NEGATIVES: AuthoritySourceNegative[] = [
  negative('OP-09', 'actor present in setup but not the delegated principal', (f) => {
    f.raw.subject = 'Send report';
  }),
  negative('OP-09', 'capability alone cannot grant permission', (f) => {
    const source = authoritySource(f, 'permissions', 0, 'source');
    authorityRawAt(f, 'permissions', 0).source = {
      fromWord: source.fromWord,
      toWord: source.fromWord + 5,
    };
  }),
  negative('OP-09', 'capability state swapped with permission', (f) => {
    authorityRawAt(f, 'permissions', 0).capability = 'permitted';
  }),
  negative('OP-09', 'denial promoted to permission', (f) => {
    authorityRawAt(f, 'permissions', 1).permission = 'permitted';
  }),
  negative('OP-09', 'action named elsewhere is not the permission target', (f) => {
    authorityRawAt(f, 'permissions', 0, 'action').label = 'Release funds';
  }),
  negative('OP-09', 'permission source transplanted from another action', (f) => {
    authorityRawAt(f, 'permissions', 0).source = authoritySource(f, 'permissions', 1, 'source');
  }),
  negative('OP-09', 'scope is not actor/action bound', (f) => {
    rewriteAuthoritySource(
      f,
      authoritySource(f, 'scope', 'source'),
      'Bot scope for Send report',
      'Lead scope for Send report',
    );
  }),
  negative('OP-09', 'unstated date cannot be invented from scene time', (f) => {
    authorityRawAt(f, 'expiry').state = 'stated';
    authorityRawAt(f, 'expiry').value = '30 June 2026';
  }),
  negative('OP-09', 'denied final state cannot become success', finalSuccess),

  negative('OP-11', 'wrong principal can appear in setup', (f) => {
    authorityRawAt(f, 'actor').label = 'Send report';
  }),
  negative('OP-11', 'action named elsewhere is not the limit target', actionSwap),
  negative('OP-11', 'ability does not resolve pending permission', (f) => {
    f.raw.permission = 'permitted';
  }),
  negative('OP-11', 'condition omitted', (f) => {
    delete f.raw.actionCondition;
  }),
  negative('OP-11', 'pending condition cannot satisfy itself', (f) => {
    authorityRawAt(f, 'actionCondition').state = 'satisfied';
  }),
  negative('OP-11', 'known limit missing its quantity basis', (f) => {
    delete authorityRawAt(f, 'limits', 0, 'measurement').basis;
  }),
  negative('OP-11', 'basis belongs to actor rather than action', (f) => {
    authorityRawAt(f, 'limits', 0, 'measurement', 'basis').subjectId = 'bot';
  }),
  negative('OP-11', 'denominator cannot be guessed', (f) => {
    authorityRawAt(f, 'limits', 0, 'measurement', 'basis').denominator = null;
  }),
  negative('OP-11', 'threshold direction cannot flip', (f) => {
    authorityRawAt(f, 'limits', 0).operator = 'at-least';
  }),
  negative('OP-11', 'limit source moved to unrelated check beat', (f) => {
    authorityRawAt(f, 'limits', 0).source = {
      fromWord: f.raw.checkWord,
      toWord: f.raw.resolveWord,
    };
  }),
  negative('OP-11', 'pending permission cannot acquire a successful final hold', finalSuccess),

  negative('OP-12', 'action named elsewhere is not the exception target', actionSwap),
  negative('OP-12', 'performer is not automatically approver', (f) => {
    authorityRawAt(f, 'roles').approverId = 'bot';
  }),
  negative('OP-12', 'approver is not automatically accountable', (f) => {
    authorityRawAt(f, 'roles').accountableOwnerId = 'lead';
  }),
  negative('OP-12', 'role source does not identify reviewer state', (f) => {
    authorityRawAt(f, 'review').source = authoritySource(f, 'roles', 'source');
  }),
  negative('OP-12', 'pending review cannot turn into approval', (f) => {
    authorityRawAt(f, 'review').state = 'approved';
  }),
  negative('OP-12', 'declared review is not observed monitoring', (f) => {
    f.raw.evidence = 'source-stated';
  }),
  negative('OP-12', 'cost cannot be copied from retry to review', (f) => {
    f.raw.reviewCost = structuredClone(f.raw.retryCost);
  }),
  negative('OP-12', 'known review cost requires its basis', (f) => {
    delete authorityRawAt(f, 'reviewCost').basis;
  }),
  negative('OP-12', 'unknown cost is not fabricated zero', (f) => {
    authorityRawAt(f, 'reviewCost').state = 'unknown';
    authorityRawAt(f, 'reviewCost').amount = { minorUnits: 0, currency: 'USD' };
    delete authorityRawAt(f, 'reviewCost').basis;
  }),
  negative('OP-12', 'final review cannot become completed monitoring', finalSuccess),

  negative('OP-13', 'named actor cannot replace the source event actor', (f) => {
    f.raw.actors = [
      ...(Array.isArray(f.raw.actors) ? f.raw.actors : []),
      { id: 'lead', label: 'Lead', source: authoritySource(f, 'actors', 0, 'source') },
    ];
    authorityRawAt(f, 'events', 0).actorId = 'lead';
  }),
  negative('OP-13', 'action present in setup cannot replace the task action', actionSwap),
  negative('OP-13', 'declared audit is not live telemetry', (f) => {
    f.raw.evidence = 'source-stated';
  }),
  negative('OP-13', 'execution is not an audit declaration', (f) => {
    authorityRawAt(f, 'events', 0).verb = 'executes';
  }),
  negative('OP-13', 'event source cannot be another event', (f) => {
    authorityRawAt(f, 'events', 0).source = authoritySource(f, 'events', 1, 'source');
  }),
  negative('OP-13', 'declared order cannot reverse source order', (f) => {
    if (Array.isArray(f.raw.events)) f.raw.events.reverse();
  }),
  negative('OP-13', 'revision cannot be invented', (f) => {
    authorityRawAt(f, 'record').version = 'R2';
  }),
  negative('OP-13', 'event cannot invent a time from animation beats', (f) => {
    authorityRawAt(f, 'events', 0).date = '30 June 2026';
  }),

  negative('OP-14', 'action named elsewhere is not the classified action', actionSwap),
  negative('OP-14', 'performer must exist in the source actors', (f) => {
    f.raw.performerId = 'lead';
  }),
  negative('OP-14', 'irreversible cannot be presented as reversible', (f) => {
    authorityRawAt(f, 'reversibility').state = 'reversible';
  }),
  negative('OP-14', 'classification source cannot be aftermath source', (f) => {
    authorityRawAt(f, 'reversibility').source = authoritySource(f, 'consequence', 'source');
  }),
  negative('OP-14', 'stated consequence cannot be relabeled unknown', (f) => {
    authorityRawAt(f, 'consequence').state = 'unknown';
  }),
  negative('OP-14', 'invented legal interpretation is not an aftermath', (f) => {
    authorityRawAt(f, 'consequence').label = 'Legal liability';
  }),
  negative('OP-14', 'no permission inferred from classification', (f) => {
    f.raw.permission = 'permitted';
  }),

  negative('OP-15', 'action named elsewhere is not the transfer target', actionSwap),
  negative('OP-15', 'performer and approver cannot swap without source evidence', (f) => {
    authorityRawAt(f, 'roles').performerId = 'lead';
    authorityRawAt(f, 'roles').approverId = 'bot';
  }),
  negative('OP-15', 'recipient is not automatically accountable', (f) => {
    authorityRawAt(f, 'roles').accountableOwnerId = 'analyst';
  }),
  negative('OP-15', 'approver cannot replace transfer sender', (f) => {
    f.raw.fromId = 'lead';
  }),
  negative('OP-15', 'accountable owner cannot replace transfer recipient', (f) => {
    f.raw.toId = 'owner';
  }),
  negative('OP-15', 'pending transfer cannot be accepted by elapsed time', (f) => {
    authorityRawAt(f, 'transfer').state = 'accepted';
  }),
  negative('OP-15', 'approval roles cannot stand in for a transfer claim', (f) => {
    authorityRawAt(f, 'transfer').source = authoritySource(f, 'roles', 'source');
  }),
  negative('OP-15', 'configured transfer is not an executed action', (f) => {
    f.raw.observedExecution = true;
  }),
  negative('OP-15', 'pending transfer keeps its unresolved final hold', finalSuccess),

  negative('OP-16', 'action named elsewhere is not the constrained action', actionSwap),
  negative('OP-16', 'requirements cannot be bound to another actor', (f) => {
    authorityRawAt(f, 'actor').label = 'Release funds';
  }),
  negative('OP-16', 'known requirement missing denominator basis', (f) => {
    delete authorityRawAt(f, 'requirements', 0, 'measurement').basis;
  }),
  negative('OP-16', 'no population or period conversion', (f) => {
    authorityRawAt(f, 'requirements', 1, 'measurement', 'basis').period = 'May';
    rewriteAuthoritySource(
      f,
      authoritySource(f, 'requirements', 1, 'source'),
      'during June',
      'during May',
    );
  }),
  negative('OP-16', 'compatible numbers cannot invent a conflict', (f) => {
    authorityRawAt(f, 'requirements', 1, 'measurement').value = 1;
    rewriteAuthoritySource(
      f,
      authoritySource(f, 'requirements', 1, 'source'),
      'at least 3',
      'at least 1',
    );
  }),
  negative('OP-16', 'collision must quote the actual requirements', (f) => {
    authorityRawAt(f, 'collision').source = authoritySource(f, 'requirements', 0, 'source');
  }),
  negative('OP-16', 'conflict cannot infer a winner', (f) => {
    authorityRawAt(f, 'collision').state = 'resolved';
  }),
  negative('OP-16', 'final hold cannot resolve the conflict', finalSuccess),
  negative('OP-16', 'frozen collision presentation is diagram only', (f) => {
    f.raw.visualMode = 'hybrid';
  }),

  negative('OP-74', 'action named elsewhere is not the policy target', actionSwap),
  negative('OP-74', 'policy record from another actor is unrelated', (f) => {
    rewriteAuthoritySource(
      f,
      authoritySource(f, 'policy', 'source'),
      'Bot Send report uses',
      'Lead Send report uses',
    );
  }),
  negative('OP-74', 'policy record from another action is unrelated', (f) => {
    rewriteAuthoritySource(
      f,
      authoritySource(f, 'policy', 'source'),
      'Bot Send report uses',
      'Bot Release funds uses',
    );
  }),
  negative('OP-74', 'dated condition cannot disappear', (f) => {
    delete f.raw.conditions;
  }),
  negative('OP-74', 'date arrival cannot satisfy a pending condition', (f) => {
    authorityRawAt(f, 'conditions', 0).state = 'satisfied';
  }),
  negative('OP-74', 'unknown date is not an invented deadline', (f) => {
    authorityRawAt(f, 'conditions', 2, 'date').state = 'stated';
    authorityRawAt(f, 'conditions', 2, 'date').value = '30 June 2026';
  }),
  negative('OP-74', 'dates cannot swap between conditions', (f) => {
    authorityRawAt(f, 'conditions', 0).date = structuredClone(
      authorityRawAt(f, 'conditions', 1, 'date'),
    );
  }),
  negative('OP-74', 'relationship must quote all actual conditions', (f) => {
    authorityRawAt(f, 'relationship').source = authoritySource(f, 'conditions', 0, 'source');
  }),
  negative('OP-74', 'unresolved dates cannot become compatible', (f) => {
    authorityRawAt(f, 'relationship').state = 'compatible';
  }),
  negative('OP-74', 'pending dated conditions keep the whole final hold', finalSuccess),
];
