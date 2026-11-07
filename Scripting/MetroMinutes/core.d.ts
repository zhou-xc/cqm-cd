export type Direction = "up" | "down";
export interface Preferences { stationID: string; lineID: string; direction: Direction; mode: "minutes" | "timer"; dark: boolean }
export interface Station { stationID: string; stationName: string; lineID: string; lineName: string; upLabel: string; downLabel: string }
export interface Train { arrival: number; departure: number; destination: string }
export interface Snapshot { version: number; stationID: string; lineID: string; fetchedAt: number; up: Train[]; down: Train[] }
export const STATIONS: Station[];
declare const core: {
  MAX_AGE: number;
  defaults: Preferences;
  clock(ms: number, seconds?: boolean): string;
  parseDate(value: unknown): number | null;
  normalize(value: unknown, now: number): Train[];
  stationFor(p: Preferences): Station;
  preferences(p?: Partial<Preferences>): Preferences;
  resolveParameter(input: unknown, saved: Preferences): Preferences;
  parameter(p: Preferences): string;
  fresh(s: Snapshot | null, now: number): boolean;
  trains(s: Snapshot | null, dir: Direction, now: number): Train[];
  label(station: Station, dir: Direction, trains: Train[]): string;
  requestSpec(p: Preferences, now: number, uuid: () => string): { url: string; body: string; headers: Record<string, string> };
  decode(raw: string, headers?: Record<string, string>): unknown;
  snapshot(result: unknown, p: Preferences, now: number): Snapshot;
  officialURL(p: Preferences): string;
};
export default core;
