/** wheels: Reihenfolge VL, VR, HL, HR (Mischbereifung moeglich). */
export type Tire = { wheels?: (string | null)[]; front: string; rear: string; compound: string | null };

export type Car = {
  id: number;
  num: number | null;
  driver: string;
  vehicle: string;
  cls: string;
  place: number;
  player: boolean;
  control: number;
  speedKmh: number;
  lapDist: number;
  lapFrac: number | null;
  x: number;
  z: number;
  laps: number;
  sector: number | null;
  lapTime: number | null;
  lastLap: number | null;
  bestLap: number | null;
  lastS1: number | null;
  lastS2: number | null;
  lastS3: number | null;
  curS1: number | null;
  curS2: number | null;
  gapNext: number | null;
  gapLeader: number | null;
  inPits: boolean;
  pitState: number;
  pitStops: number;
  penalties: number;
  underFcy: boolean;
  yellowCause: boolean;
  finish: number;
  tire: Tire | null;
};

export type Session = {
  track: string;
  type: number;
  phase: number;
  yellowState: number;
  sectorFlags: number[];
  time: number;
  endTime: number;
  remaining: number;
  maxLaps: number;
  trackLength: number;
  rain: number;
  trackTemp: number;
  airTemp: number;
  cars: number;
};

export type Snapshot = {
  v: number;
  t: number;
  status: "live" | "idle";
  demo?: boolean;
  session: Session;
  cars: Car[];
};
