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
  /**
   * True when the feed is (heuristically) HEVC carried in an MPEG-TS segment. Apple's HLS does not
   * support HEVC-in-TS, so AVPlayer on iOS/tvOS plays the audio over a black frame. Such feeds play
   * fine on Android (ExoPlayer). Used to keep them out of the default pick and to warn on Apple.
   */
  appleVideoUnsupported?: boolean;
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
