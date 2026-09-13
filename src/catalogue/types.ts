export type ChannelKind = 'world' | 'onboard' | 'data' | 'tracker' | 'hidden';
export type SourceTag = 'PPV' | 'UK' | 'DE' | 'SKY' | 'OTHER';
export type Quality = 'SD' | 'HD' | 'FHD' | 'UHD' | 'HEVC' | '50FPS' | 'UNKNOWN';
export type TeamId =
  | 'mclaren'
  | 'ferrari'
  | 'redbull'
  | 'mercedes'
  | 'astonmartin'
  | 'alpine'
  | 'williams'
  | 'racingbulls'
  | 'haas'
  | 'sauber'
  | 'cadillac'
  | 'unknown';

export type Language = 'EN' | 'ES' | 'FR' | 'DE' | 'IT';

export interface DriverRef {
  abbr: string;
  fullName: string;
  lastName: string;
  team: string;
  teamId: TeamId;
  color: string;
}

export interface F1Channel {
  kind: ChannelKind;
  streamId: number;
  rawName: string;
  label: string;
  source: SourceTag;
  quality: Quality;
  language?: Language;
  categoryId: string;
  driver?: DriverRef;
  rank: number;
}

export interface DriverEntry extends DriverRef {
  primary: F1Channel;
  alternates: F1Channel[];
}

export interface F1Catalogue {
  worldFeeds: F1Channel[];
  defaultWorldFeed: F1Channel | null;
  drivers: DriverEntry[];
  data: F1Channel[];
  hidden: F1Channel[];
  fetchedAt: number;
}
