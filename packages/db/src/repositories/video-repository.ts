import {and, desc, eq, inArray} from 'drizzle-orm';

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
export class VideoRepository {
  constructor(private readonly db: Database) {}

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

  listAssets(videoId: string): Promise<Asset[]> {
    return this.db.select().from(assets).where(eq(assets.videoId, videoId));
  }

  // Timeline

  async addEvent(videoId: string, stage: string, message: string): Promise<void> {
    await this.db.insert(videoEvents).values({videoId, stage, message});
  }

  listEvents(videoId: string): Promise<VideoEvent[]> {
    return this.db
      .select()
      .from(videoEvents)
      .where(eq(videoEvents.videoId, videoId))
      .orderBy(videoEvents.createdAt);
  }
}
