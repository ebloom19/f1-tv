/**
 * Xtream Codes API shapes (pinned in SPEC.md). Pure types, no runtime code.
 */
export interface XtreamCredentials {
  baseUrl: string;
  username: string;
  password: string;
  label?: string;
}

export interface XtreamUserInfo {
  auth: number;
  status: string;
  exp_date: string | null;
  is_trial: string;
  active_cons: string;
  created_at: string;
  /** The panel returns this as a string, e.g. "1". */
  max_connections: string;
  allowed_output_formats: string[];
  message?: string;
}

export interface XtreamServerInfo {
  url: string;
  port: string;
  https_port: string;
  server_protocol: string;
  rtmp_port?: string;
  timezone: string;
  timestamp_now: number;
  time_now: string;
}

export interface XtreamAuthResponse {
  user_info: XtreamUserInfo;
  server_info: XtreamServerInfo;
}

export interface XtreamLiveCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface XtreamLiveStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string | null;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
}

export interface XtreamAccount {
  credentials: XtreamCredentials;
  userInfo: XtreamUserInfo;
  serverInfo: XtreamServerInfo;
  /** Parsed from user_info.max_connections; never below 1. */
  maxConnections: number;
  expiresAt: Date | null;
}

export type StreamFormat = 'm3u8' | 'ts';

export type PlaylistProbe =
  | { status: 'ok'; segments: number; targetDuration: number; edgeUrl: string; firstSegmentUrl: string }
  | { status: 'slot_busy'; httpStatus: number }
  | { status: 'offline'; httpStatus: number }
  | { status: 'error'; httpStatus?: number; message: string };
