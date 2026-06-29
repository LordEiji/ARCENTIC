export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const body = req.body;
        body.model = 'google/gemini-2.0-flash-exp:free';

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
                'HTTP-Referer': 'https://arcentic.vercel.app',
                'X-Title': 'ARCENTIC'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}