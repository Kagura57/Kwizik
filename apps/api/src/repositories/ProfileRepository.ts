import { pool } from "../db/client";

export type TitlePreference = "romaji" | "english" | "mixed";

type Profile = {
  userId: string;
  displayName: string;
  titlePreference: TitlePreference;
  createdAtMs: number;
};

function normalizeTitlePreference(value: unknown): TitlePreference {
  if (value === "romaji" || value === "english" || value === "mixed") return value;
  return "mixed";
}

export class ProfileRepository {
  private readonly memoryProfiles = new Map<string, Profile>();

  private get dbEnabled() {
    const value = process.env.DATABASE_URL;
    return typeof value === "string" && value.trim().length > 0;
  }

  async upsertProfile(input: { userId: string; displayName: string }) {
    const trimmedDisplayName = input.displayName.trim();
    if (!trimmedDisplayName) return null;

    if (!this.dbEnabled) {
      const existing = this.memoryProfiles.get(input.userId);
      const profile: Profile = {
        userId: input.userId,
        displayName: trimmedDisplayName,
        titlePreference: existing?.titlePreference ?? "mixed",
        createdAtMs: existing?.createdAtMs ?? Date.now(),
      };
      this.memoryProfiles.set(input.userId, profile);
      return profile;
    }

    const result = await pool.query<{
      user_id: string;
      display_name: string;
      title_preference: TitlePreference;
      created_at: Date;
    }>(
      `
        insert into profiles (user_id, display_name)
        values ($1, $2)
        on conflict (user_id)
        do update set display_name = excluded.display_name
        returning user_id, display_name, title_preference, created_at
      `,
      [input.userId, trimmedDisplayName],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      userId: row.user_id,
      displayName: row.display_name,
      titlePreference: normalizeTitlePreference(row.title_preference),
      createdAtMs: row.created_at.getTime(),
    };
  }

  async getProfile(userId: string) {
    if (!this.dbEnabled) {
      return this.memoryProfiles.get(userId) ?? null;
    }

    const result = await pool.query<{
      user_id: string;
      display_name: string;
      title_preference: TitlePreference;
      created_at: Date;
    }>(
      `
        select user_id, display_name, title_preference, created_at
        from profiles
        where user_id = $1
        limit 1
      `,
      [userId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      userId: row.user_id,
      displayName: row.display_name,
      titlePreference: normalizeTitlePreference(row.title_preference),
      createdAtMs: row.created_at.getTime(),
    };
  }

  async updateTitlePreference(userId: string, titlePreference: TitlePreference) {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) return null;
    const normalizedPreference = normalizeTitlePreference(titlePreference);

    if (!this.dbEnabled) {
      const existing = this.memoryProfiles.get(normalizedUserId);
      if (!existing) return null;
      const next: Profile = {
        ...existing,
        titlePreference: normalizedPreference,
      };
      this.memoryProfiles.set(normalizedUserId, next);
      return next;
    }

    const result = await pool.query<{
      user_id: string;
      display_name: string;
      title_preference: TitlePreference;
      created_at: Date;
    }>(
      `
        update profiles
        set title_preference = $2
        where user_id = $1
        returning user_id, display_name, title_preference, created_at
      `,
      [normalizedUserId, normalizedPreference],
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      userId: row.user_id,
      displayName: row.display_name,
      titlePreference: normalizeTitlePreference(row.title_preference),
      createdAtMs: row.created_at.getTime(),
    };
  }
}

export const profileRepository = new ProfileRepository();
