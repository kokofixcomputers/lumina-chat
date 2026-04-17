export const config = {
  runtime: 'edge',
};

export default function handler(req: Request) {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return new Response(JSON.stringify({ sha }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}