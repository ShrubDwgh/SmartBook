import { api } from './api.js';
import { escapeHtml } from './utils.js';

// Riwayat percakapan disimpan di memori browser saja (tidak dipersist ke server),
// jadi tetap ada selama tab ini terbuka, tapi hilang saat reload.
let history = [];

export async function renderSecretary(container) {
  container.innerHTML = `
    <div class="page-header"><h1>AI Secretary</h1></div>
    <div class="chat-shell">
      <div class="chat-messages" id="chatMessages">
        ${history.length ? history.map(renderBubble).join('') : chatEmptyState()}
      </div>
      <form class="chat-input-row" id="chatForm">
        <textarea id="chatInput" placeholder="Tanya atau perintahkan sesuatu, mis. &quot;Apa yang belum selesai di Panelify?&quot;" rows="1"></textarea>
        <button type="submit" class="btn-primary" id="chatSendBtn">Kirim</button>
      </form>
    </div>
  `;

  const messagesEl = document.getElementById('chatMessages');
  const input = document.getElementById('chatInput');
  scrollToBottom(messagesEl);
  input.focus();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('chatForm').requestSubmit();
    }
  });

  container.onsubmit = async (e) => {
    if (e.target.id !== 'chatForm') return;
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    history.push({ role: 'user', content: text });
    messagesEl.insertAdjacentHTML('beforeend', renderBubble({ role: 'user', content: text }));
    input.value = '';
    scrollToBottom(messagesEl);

    const sendBtn = document.getElementById('chatSendBtn');
    sendBtn.disabled = true;
    const typingId = `typing-${Date.now()}`;
    messagesEl.insertAdjacentHTML(
      'beforeend',
      `<div class="chat-typing" id="${typingId}">AI Secretary sedang memeriksa data…</div>`
    );
    scrollToBottom(messagesEl);

    try {
      const { reply, actions } = await api.post('/api/ai/secretary', {
        message: text,
        history: history.slice(0, -1),
      });
      document.getElementById(typingId)?.remove();
      history.push({ role: 'assistant', content: reply });
      messagesEl.insertAdjacentHTML('beforeend', renderBubble({ role: 'assistant', content: reply, actions }));
    } catch (err) {
      document.getElementById(typingId)?.remove();
      messagesEl.insertAdjacentHTML(
        'beforeend',
        `<div class="chat-bubble assistant">Maaf, terjadi kendala: ${escapeHtml(err.message)}</div>`
      );
    } finally {
      sendBtn.disabled = false;
      scrollToBottom(messagesEl);
    }
  };
}

function renderBubble(msg) {
  const actionsHtml = (msg.actions || []).map((a) => `<span class="chat-action-tag">${escapeHtml(a)}</span>`).join('');
  return `
    <div class="chat-bubble ${msg.role}">${escapeHtml(msg.content)}</div>
    ${actionsHtml ? `<div class="chat-actions">${actionsHtml}</div>` : ''}
  `;
}

function chatEmptyState() {
  return `
    <div class="chat-empty">
      <p><strong>AI Secretary</strong> bekerja di atas data SmartBook Anda ketika diminta — bukan chatbot umum, dan tidak bisa membaca Secrets Vault.</p>
      <p class="muted" style="margin-top:8px;font-size:13px;">Contoh: "Apa yang belum selesai di Panelify?" atau "Simpan ini sebagai update Panelify: …".</p>
    </div>
  `;
}

function scrollToBottom(el) {
  el.scrollTop = el.scrollHeight;
}
