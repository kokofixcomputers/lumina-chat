import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const { action, email, data } = await req.json();

    // Create table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS user_data (
        email TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    if (action === 'get') {
      const result = await sql`SELECT data, updated_at FROM user_data WHERE email = ${email}`;
      if (result.length === 0) {
        return new Response(JSON.stringify({ exists: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ exists: true, data: result[0].data, updatedAt: result[0].updated_at }), { status: 200 });
    }

    if (action === 'save') {
      await sql`
        INSERT INTO user_data (email, data, updated_at)
        VALUES (${email}, ${JSON.stringify(data)}, NOW())
        ON CONFLICT (email)
        DO UPDATE SET data = ${JSON.stringify(data)}, updated_at = NOW()
      `;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    if (action === 'delete') {
      await sql`DELETE FROM user_data WHERE email = ${email}`;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ error: 'Database unavailable', disabled: true }), { status: 500 });
  }
}
