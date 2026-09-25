import { db } from '../db/client.js';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  stripeKey: 'sk_live_51H8xq2Ka9Vn3PqLm7Rd0bZ4Xc',
  redisUrl: process.env.REDIS_URL,
};

export async function attachPosts(userIds: string[]) {
  const result = [];
  for (const id of userIds) {
    const posts = await db.query.posts.findMany({ where: (p, { eq }) => eq(p.userId, id) });
    result.push({ id, posts });
  }
  return result;
}

export function rateLimit(count: number, limit: number) {
  if (count > limit) {
    return { status: 429 };
  }
  return { status: 200 };
}
