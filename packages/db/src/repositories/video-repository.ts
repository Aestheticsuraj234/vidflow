import {and, desc, eq, inArray, sql} from 'drizzle-orm';

import type {Database} from '../client';
import {assets, renditions, videoEvents, videos, type VideoStatus} from '../schema';
import {allowedFrom} from '../video-state';

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type Rendition = typeof renditions.$inferSelect;
export type NewRendition = typeof renditions.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type VideoEvent = typeof videoEvents.$inferSelect;

/** Fields that may change together with a status move. */
export type VideoPatch = Partial<Omit<NewVideo, 'id' | 'userId' | 'status' | 'createdAt'>>;

/** Reads and writes videos, their renditions, assets and timeline. */
export interface VideoChange {
  videoId: string;
  /** Set when a timeline event was added. */
  event?: {stage: string; message: string};
}

export interface VideoRepositoryOptions {
  /**
   * Called after anything a viewer would see changes: status, progress, the
   * timeline. Chapter 10 publishes these to Redis for live updates.
   */
  onChange?: (change: VideoChange) => void;
}

export class VideoRepository {
  constructor(
    private readonly db: Database,
    private readonly options: VideoRepositoryOptions = {},
  ) {}

  private changed(change: VideoChange): void {
    try {
      this.options.onChange?.(change);
    } catch {
      // Live updates are best effort; never fail a write because of them.
    }
  }

  async create(input: Pick<NewVideo, 'userId' | 'title'> & VideoPatch): Promise<Video> {
    const [row] = await this.db.insert(videos).values(input).returning();
    if (!row) throw new Error('Failed to create video');
    return row;
  }

  async findById(id: string): Promise<Video | undefined> {
    const [row] = await this.db.select().from(videos).where(eq(videos.id, id));
    return row;
  }

  /** A video only if it belongs to `userId`. */
  async findForUser(id: string, userId: string): Promise<Video | undefined> {
    const [row] = await this.db
      .select()
      .from(videos)
      .where(and(eq(videos.id, id), eq(videos.userId, userId)));
    return row;
  }

  listByUser(userId: string, limit = 50, offset = 0): Promise<Video[]> {
    return this.db
      .select()
      .from(videos)
      .where(eq(videos.userId, userId))
      .orderBy(desc(videos.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Moves a video to `to` only from a state where that is legal, in one
   * conditional update. Returns the updated row, or undefined if the video
   * was not in a legal state (another worker moved it, or it was canceled).
   */
  async transition(
    id: string,
    to: VideoStatus,
    patch: VideoPatch = {},
  ): Promise<Video | undefined> {
    const [row] = await this.db
      .update(videos)
      .set({...patch, status: to})
      .where(and(eq(videos.id, id), inArray(videos.status, allowedFrom(to))))
      .returning();
    if (row) this.changed({videoId: id});
    return row;
  }

  /** Marks a video failed (from any non-final state) and records why. */
  async fail(id: string, error: string): Promise<Video | undefined> {
    const row = await this.transition(id, 'failed', {error: error.slice(0, 1000)});
    if (row) await this.addEvent(id, 'failed', error.slice(0, 1000));
    return row;
  }

  async update(id: string, patch: VideoPatch): Promise<void> {
    await this.db.update(videos).set(patch).where(eq(videos.id, id));
    this.changed({videoId: id});
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(videos).where(eq(videos.id, id));
  }

  // Renditions

  async createRenditions(rows: NewRendition[]): Promise<Rendition[]> {
    if (rows.length === 0) return [];
    return this.db.insert(renditions).values(rows).onConflictDoNothing().returning();
  }

  listRenditions(videoId: string): Promise<Rendition[]> {
    return this.db
      .select()
      .from(renditions)
      .where(eq(renditions.videoId, videoId))
      .orderBy(desc(renditions.height));
  }

  /**
   * Video progress while processing: 5% after probing, then up to 85% as the
   * renditions encode (their average), leaving the rest for packaging.
   */
  async refreshProgress(videoId: string): Promise<void> {
    await this.db.execute(sql`
      update videos set progress = greatest(progress, 5 + (
        select coalesce(round(avg(progress) * 0.8), 0)::int from renditions where video_id = ${videoId}
      ))
      where id = ${videoId} and status = 'processing'`);
    this.changed({videoId});
  }

  async findRendition(id: string): Promise<Rendition | undefined> {
    const [row] = await this.db.select().from(renditions).where(eq(renditions.id, id));
    return row;
  }

  async updateRendition(id: string, patch: Partial<NewRendition>): Promise<void> {
    await this.db.update(renditions).set(patch).where(eq(renditions.id, id));
  }

  // Assets

  async upsertAsset(asset: NewAsset): Promise<void> {
    await this.db
      .insert(assets)
      .values(asset)
      .onConflictDoUpdate({
        target: assets.key,
        set: {
          contentType: asset.contentType,
          width: asset.width,
          height: asset.height,
          sizeBytes: asset.sizeBytes,
        },
      });
  }

  /** Poster keys for a page of videos, in one query. */
  async posterKeys(videoIds: string[]): Promise<Map<string, string>> {
    if (videoIds.length === 0) return new Map();
    const rows = await this.db
      .select({videoId: assets.videoId, key: assets.key})
      .from(assets)
      .where(and(inArray(assets.videoId, videoIds), eq(assets.kind, 'poster')));
    return new Map(rows.map((r) => [r.videoId, r.key]));
  }

  listAssets(videoId: string): Promise<Asset[]> {
    return this.db.select().from(assets).where(eq(assets.videoId, videoId));
  }

  // Timeline

  async addEvent(videoId: string, stage: string, message: string): Promise<void> {
    await this.db.insert(videoEvents).values({videoId, stage, message});
    this.changed({videoId, event: {stage, message}});
  }

  listEvents(videoId: string): Promise<VideoEvent[]> {
    return this.db
      .select()
      .from(videoEvents)
      .where(eq(videoEvents.videoId, videoId))
      .orderBy(videoEvents.createdAt);
  }
}
