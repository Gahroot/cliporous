/** Private proof entry only. Its historical spec/media never enter the production import graph. */

import type React from 'react';
import { AbsoluteFill, Composition, OffthreadVideo, registerRoot, staticFile } from 'remotion';
import { BUILTIN_PALETTES } from '../../../../shared/palettes';
import { PROOF_BOARD } from './board-proof';
import { StoryBoard } from './StoryBoard';
import type { StoryBoardProps, StoryBoardSpec } from './types';

const FPS = 30;

// Adapt the legacy alias/actions here, leaving the original authored prototype untouched.
export const PROOF_SPEC: StoryBoardSpec = {
  ...PROOF_BOARD,
  props: PROOF_BOARD.props.map((prop) => ({
    ...prop,
    model: prop.model === 'bulb' ? 'lightbulb' : prop.model,
    action: 'activate',
  })),
};
type ProofBoardProps = StoryBoardProps & { speakerSrc?: string };
export const ProofBoard: React.FC<ProofBoardProps> = ({ skin, withSource, speakerSrc }) => {
  const source = speakerSrc ?? (withSource ? staticFile('proof-source.mp4') : undefined);
  return (
    <AbsoluteFill>
      {source && (
        <OffthreadVideo
          src={source}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <StoryBoard spec={PROOF_SPEC} style={skin} palette={BUILTIN_PALETTES[0]} />
    </AbsoluteFill>
  );
};

const ProofRoot: React.FC = () => (
  <Composition
    id="StoryBoardProof"
    component={ProofBoard}
    durationInFrames={Math.round(PROOF_BOARD.durationSec * FPS)}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={{ skin: 'ink', withSource: false } satisfies StoryBoardProps}
  />
);

registerRoot(ProofRoot);
