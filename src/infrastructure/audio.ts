import { Howl } from 'howler';

const SOUNDS = {
  coin: 0.5,
  jump: 0.35,
  land: 0.4,
  fall: 0.5,
  break: 0.45,
  'tile-match': 0.6,
  'tile-swap': 0.4,
  click1: 0.5,
  switch2: 0.5,
  rollover1: 0.3,
} as const;

export type SoundName = keyof typeof SOUNDS;

const howls = new Map(
  (Object.entries(SOUNDS) as [SoundName, number][]).map(([name, volume]) => [
    name,
    new Howl({ src: [`${import.meta.env.BASE_URL}assets/sounds/${name}.ogg`], volume }),
  ]),
);

export function playSound(name: SoundName, rate = 1) {
  const howl = howls.get(name)!;
  howl.rate(rate, howl.play());
}
