import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import {user} from './auth';
import {assetKind, renditionStatus, videoStatus} from './enums';

/** A video and its source file. Media facts come from ffprobe (Chapter 6). */
export const videos = pgTable(
  'videos',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, {onDelete: 'cascade'}),
    title: text().notNull(),
    status: videoStatus().notNull().default('created'),
    /** 0–100 across the whole pipeline. */
    progress: integer().notNull().default(0),
    error: text(),

    sourceKey: text(),
    sourceSizeBytes: bigint({mode: 'number'}),
    sourceContentType: text(),
    /** S3 multipart upload ID while uploading (Chapter 4). */
    uploadId: text(),

    durationMs: integer(),
    width: integer(),
    height: integer(),
    fps: doublePrecision(),
    videoCodec: text(),
    audioCodec: text(),
    hasAudio: boolean(),

    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
    uploadedAt: timestamp({withTimezone: true}),
    readyAt: timestamp({withTimezone: true}),
  },
  (t) => [
    index('videos_user_created_idx').on(t.userId, t.createdAt),
    index('videos_status_idx').on(t.status),
  ],
);

/** One quality level (e.g. 720p): encoded MP4, then HLS segments. */
export const renditions = pgTable(
  'renditions',
  {
    id: uuid().primaryKey().defaultRandom(),
    videoId: uuid()
      .notNull()
      .references(() => videos.id, {onDelete: 'cascade'}),
    name: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    videoBitrateKbps: integer().notNull(),
    audioBitrateKbps: integer().notNull(),
    status: renditionStatus().notNull().default('pending'),
    progress: integer().notNull().default(0),
    mp4Key: text(),
    playlistKey: text(),
    sizeBytes: bigint({mode: 'number'}),
    encodeMs: integer(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  (t) => [unique('renditions_video_name_uq').on(t.videoId, t.name)],
);

/** Images and sidecar files: poster, thumbnails, preview sprite and its VTT. */
export const assets = pgTable(
  'assets',
  {
    id: uuid().primaryKey().defaultRandom(),
    videoId: uuid()
      .notNull()
      .references(() => videos.id, {onDelete: 'cascade'}),
    kind: assetKind().notNull(),
    key: text().notNull(),
    contentType: text().notNull(),
    width: integer(),
    height: integer(),
    sizeBytes: bigint({mode: 'number'}),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  (t) => [index('assets_video_idx').on(t.videoId), unique('assets_key_uq').on(t.key)],
);

/** Timeline of what happened to a video, shown in the dashboard (Chapter 11). */
export const videoEvents = pgTable(
  'video_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    videoId: uuid()
      .notNull()
      .references(() => videos.id, {onDelete: 'cascade'}),
    stage: text().notNull(),
    message: text().notNull(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  (t) => [index('video_events_video_idx').on(t.videoId, t.createdAt)],
);
