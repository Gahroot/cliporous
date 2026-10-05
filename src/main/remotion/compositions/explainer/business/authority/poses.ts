import type { AuthorityPermissionState } from '../assets/authority-poses';
import { type BusinessClock, businessPhases } from '../motion';
import {
  type AuthorityPanel,
  authorityDeclaration,
  authorityReadability,
  authorityStatus,
} from './readability';
import type { AuthorityBusinessScene, AuthorityPermission } from './types';

export type { AuthorityFact, AuthorityPanel } from './readability';
export { AUTHORITY_BODY, authorityFacts, authorityLines, authorityPages } from './readability';

export interface AuthorityCardPose {
  id: string;
  permission: AuthorityPermission;
  state: AuthorityPermissionState;
  focus: number;
}
export interface BusinessAuthorityPose {
  opacity: number;
  binderOpen: number;
  binderRevision: 0;
  gateAccepted: number;
  cards: AuthorityCardPose[];
  status: string;
  declaration: string;
  /** All source text remains present; detail pages do not rewrite any facts. */
  pages: AuthorityPanel[][];
  pageIndex: number;
  observedExecution: false;
}

function card(id: string, permission: AuthorityPermission, focus: number): AuthorityCardPose {
  return {
    id,
    permission,
    focus,
    state: permission === 'permitted' ? 'allowed' : permission === 'denied' ? 'denied' : 'unknown',
  };
}

/** Frame-seekable detail reading plus restrained model reveals; nothing updates a source state. */
export function sampleBusinessAuthority(
  scene: AuthorityBusinessScene,
  clock: BusinessClock,
): BusinessAuthorityPose {
  const p = businessPhases(clock);
  const reading = authorityReadability(scene);
  const pages = reading.pages;
  const slot =
    reading.secondsPerPage > 0 && Number.isFinite(p.time)
      ? Math.floor((p.time - reading.readingStart) / reading.secondsPerPage + 1e-10)
      : 0;
  const cards =
    scene.preset === 'permissions'
      ? scene.permissions.map((entry) => card(entry.action.id, entry.permission, p.response))
      : scene.preset === 'action-limits'
        ? [card(scene.action.id, scene.permission, p.response)]
        : [];
  return {
    opacity: p.setup,
    binderOpen: p.response,
    binderRevision: 0, // One supplied guidance version, not a fabricated older/newer model iteration.
    gateAccepted:
      scene.preset === 'accountable-transfer' && scene.transfer.state === 'accepted' ? p.check : 0,
    cards,
    status: authorityStatus(scene),
    declaration: authorityDeclaration(scene),
    pages,
    pageIndex: Math.max(0, Math.min(pages.length - 1, slot)),
    observedExecution: false,
  };
}
