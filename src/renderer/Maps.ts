import { TheSkeld as TheSkeldRaw } from './the_skeld'
import { MiraHq as MiraHqRaw } from './mira_hq'
import { Polus as PolusRaw } from './polus'
import Ship from './Ship';

export const Empty = Ship.parse({ walls: [], windows: [], doors: [], cameras: [] });
export const TheSkeld = Ship.parse(TheSkeldRaw);
export const MiraHq = Ship.parse(MiraHqRaw);
export const Polus = Ship.parse(PolusRaw);