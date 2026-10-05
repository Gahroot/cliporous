import type { ReactElement } from 'react';
import { ComputingScene } from './computing/Scene';
import { DecisionsScene } from './decisions/Scene';
import { GeometryScene } from './geometry/Scene';
import { PhysicalScene } from './physical/Scene';
import { ProbabilityScene } from './probability/Scene';
import { QuantitiesScene } from './quantities/Scene';
import { ReasoningScene } from './reasoning/Scene';
import { RelationshipsScene } from './relationships/Scene';
import { RepresentationsScene } from './representations/Scene';
import { TemporalScene } from './temporal/Scene';
import type { ExpansionScene } from './types';

export function ExpansionSceneView({
  scene,
}: {
  scene: ExpansionScene;
}): ReactElement<{ scene: ExpansionScene }> {
  switch (scene.storyId) {
    case '01':
    case '02':
    case '03':
    case '04':
    case '05':
    case '06':
    case '07':
    case '08':
      return <ReasoningScene scene={scene} />;
    case '09':
    case '10':
    case '11':
    case '12':
    case '13':
    case '14':
    case '15':
    case '16':
      return <ProbabilityScene scene={scene} />;
    case '17':
    case '18':
    case '19':
    case '20':
    case '21':
    case '22':
    case '23':
    case '24':
      return <QuantitiesScene scene={scene} />;
    case '25':
    case '26':
    case '27':
    case '28':
    case '29':
    case '30':
    case '31':
    case '32':
      return <DecisionsScene scene={scene} />;
    case '33':
    case '34':
    case '35':
    case '36':
    case '37':
    case '38':
    case '39':
    case '40':
      return <RelationshipsScene scene={scene} />;
    case '41':
    case '42':
    case '43':
    case '44':
    case '45':
    case '46':
    case '47':
    case '48':
      return <TemporalScene scene={scene} />;
    case '49':
    case '50':
    case '51':
    case '52':
    case '53':
    case '54':
    case '55':
    case '56':
      return <RepresentationsScene scene={scene} />;
    case '57':
    case '58':
    case '59':
    case '60':
    case '61':
    case '62':
    case '63':
    case '64':
      return <GeometryScene scene={scene} />;
    case '65':
    case '66':
    case '67':
    case '68':
    case '69':
    case '70':
    case '71':
    case '72':
      return <ComputingScene scene={scene} />;
    case '73':
    case '74':
    case '75':
    case '76':
    case '77':
    case '78':
    case '79':
    case '80':
      return <PhysicalScene scene={scene} />;
  }
}
