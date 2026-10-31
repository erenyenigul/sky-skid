import '@fontsource-variable/grandstander';
import './presentation/hud/hud.css';
import { render } from 'preact';
import { Assets } from './presentation/scene/assets';
import { Stage } from './presentation/scene/stage';
import { GameController } from './presentation/gameController';
import { Hud } from './presentation/hud/Hud';

const stage = new Stage(document.querySelector<HTMLElement>('#stage')!);
const assets = await Assets.load();
await stage.start();
document.body.dataset.backend = stage.usesWebGPU ? 'webgpu' : 'webgl2-fallback';
stage.addSkyDecor(assets);

const game = new GameController(stage, assets);
render(<Hud game={game} />, document.querySelector('#hud')!);
