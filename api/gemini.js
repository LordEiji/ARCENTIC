export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { messages, tools } = req.body;

        const systemMsg = messages.find(m => m.role === 'system');
        const chatMessages = messages.filter(m => m.role !== 'system');

        // Build contents, merging consecutive same-role messages
        const rawContents = [];
        for (const m of chatMessages) {
            if (m.role === 'tool') {
                rawContents.push({
                    role: 'user',
                    parts: [{ functionResponse: { name: m.name || 'tool', response: { result: m.content } } }]
                });
            } else if (m.role === 'assistant') {
                if (m.tool_calls && m.tool_calls.length) {
                    rawContents.push({
                        role: 'model',
                        parts: m.tool_calls.map(tc => ({
                            functionCall: {
                                name: tc.function.name,
                                args: (() => { try { return JSON.parse(tc.function.arguments || '{}'); } catch(e) { return {}; } })()
                            }
                        }))
                    });
                } else {
                    rawContents.push({ role: 'model', parts: [{ text: m.content || ' ' }] });
                }
            } else {
                const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                rawContents.push({ role: 'user', parts: [{ text: text || ' ' }] });
            }
        }

        // Merge consecutive same-role messages (Gemini requires alternating)
        const contents = [];
        for (const item of rawContents) {
            const last = contents[contents.length - 1];
            if (last && last.role === item.role) {
                last.parts = [...last.parts, ...item.parts];
            } else {
                contents.push({ role: item.role, parts: [...item.parts] });
            }
        }

        // Convert tools
        let functionDeclarations = [];
        if (tools && tools.length) {
            functionDeclarations = tools.map(t => ({
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters
            }));
        }

        const geminiBody = {
            contents,
            generationConfig: { maxOutputTokens: 1024 }
        };
        if (systemMsg) {
            geminiBody.systemInstruction = { parts: [{ text: systemMsg.content }] };
        }
        if (functionDeclarations.length) {
            geminiBody.tools = [{ functionDeclarations }];
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody)
        });

        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch(e) {
            return res.status(500).json({ error: 'Gemini returned invalid JSON: ' + text.slice(0, 200) });
        }

        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || JSON.stringify(data) });
        }

        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];

        const funcParts = parts.filter(p => p.functionCall);
        const textParts = parts.filter(p => p.text);

        let openaiMsg;
        if (funcParts.length) {
            openaiMsg = {
                role: 'assistant',
                content: null,
                tool_calls: funcParts.map((p, i) => ({
                    id: 'call_' + i,
                    type: 'function',
                    function: {
                        name: p.functionCall.name,
                        arguments: JSON.stringify(p.functionCall.args || {})
                    }
                }))
            };
        } else {
            openaiMsg = {
                role: 'assistant',
                content: textParts.map(p => p.text).join('') || 'Maaf, tidak ada respons.'
            };
        }

        return res.status(200).json({ choices: [{ message: openaiMsg }] });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}