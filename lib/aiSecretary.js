const { toolDefinitions, executeTool } = require('./aiTools');

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_TOOL_ITERATIONS = 5;
const MAX_HISTORY_MESSAGES = 20;

const SYSTEM_PROMPT = `Kamu adalah "AI Secretary" di aplikasi SmartBook: asisten yang bekerja di atas data SmartBook milik user ini (proyek, catatan, checklist), bukan chatbot umum yang berdiri sendiri.

Aturan penting yang harus selalu kamu ikuti:
1. Hanya gunakan tool yang benar-benar relevan dengan permintaan user saat ini. Jangan membaca/mengambil data yang tidak diminta.
2. Kamu TIDAK memiliki akses ke Secrets Vault (password, API key, token). Jika user bertanya soal itu, katakan dengan jelas bahwa itu di luar akses kamu demi keamanan, dan arahkan user membukanya sendiri di halaman Secrets.
3. HANYA buat atau ubah catatan/checklist ketika user secara eksplisit memintanya (mis. "simpan ini sebagai...", "tandai selesai", "buatkan checklist untuk..."). Untuk pertanyaan biasa, cukup jawab berdasarkan data yang kamu baca, jangan mengubah apa pun.
4. Jika user menyebut proyek/catatan dengan nama (bukan ID), cari ID-nya dulu lewat list_projects/search_notes sebelum bertindak. Jangan menebak ID.
5. Saat membuat catatan tanpa judul eksplisit dari user, buatkan judul singkat yang deskriptif dari isinya. Pilih kategori paling sesuai dari list_categories (pakai "Lainnya" hanya jika benar-benar tidak jelas).
6. Jawab singkat, jelas, dan langsung ke inti seperti sekretaris yang efisien — hindari basa-basi panjang.
7. Balas dalam bahasa yang sama dengan pesan user.`;

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

async function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error('AI Secretary belum dikonfigurasi di server (OPENAI_API_KEY kosong).');
    err.statusCode = 500;
    throw err;
  }
  // Model bisa diganti lewat env var OPENAI_MODEL tanpa mengubah kode,
  // mis. ke model OpenAI yang lebih baru jika tersedia untuk akun Anda.
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  let response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, tools: toolDefinitions, tool_choice: 'auto' }),
    });
  } catch (networkErr) {
    console.error('[aiSecretary] Gagal menghubungi OpenAI:', networkErr);
    const err = new Error('AI Secretary sedang tidak bisa dihubungi, coba lagi sebentar lagi.');
    err.statusCode = 502;
    throw err;
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('[aiSecretary] OpenAI mengembalikan error', response.status, errText);
    const err = new Error('AI Secretary sedang bermasalah, coba lagi sebentar lagi.');
    err.statusCode = 502;
    throw err;
  }

  return response.json();
}

/**
 * Jalankan satu putaran percakapan dengan AI Secretary.
 * `history` = riwayat chat sebelumnya dari sisi client (disimpan di memori browser,
 * tidak dipersist di server) berupa array [{ role: 'user'|'assistant', content }].
 */
async function runSecretary(uid, message, history) {
  const cleanMessage = (message || '').trim();
  if (!cleanMessage) {
    const err = new Error('Pesan tidak boleh kosong.');
    err.statusCode = 400;
    throw err;
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...sanitizeHistory(history),
    { role: 'user', content: cleanMessage },
  ];

  const actions = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await callOpenAI(messages);
    const assistantMessage = data.choices && data.choices[0] && data.choices[0].message;

    if (!assistantMessage) {
      const err = new Error('AI Secretary tidak memberikan balasan.');
      err.statusCode = 502;
      throw err;
    }

    const toolCalls = assistantMessage.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return { reply: assistantMessage.content || '', actions };
    }

    messages.push(assistantMessage);

    for (const call of toolCalls) {
      let args = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch (e) {
        args = {};
      }

      let output;
      try {
        // uid berasal dari token yang sudah diverifikasi di lapisan API, BUKAN dari `args`.
        output = await executeTool(uid, call.function.name, args);
      } catch (err) {
        output = { result: { error: err.message || 'Terjadi kesalahan saat menjalankan aksi.' } };
      }

      if (output.summary) actions.push(output.summary);

      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output.result) });
    }
  }

  return {
    reply: 'Maaf, permintaan ini butuh terlalu banyak langkah. Coba pecah jadi permintaan yang lebih spesifik, ya.',
    actions,
  };
}

module.exports = { runSecretary };
