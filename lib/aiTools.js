/**
 * Tool/function yang boleh dipanggil oleh AI Secretary.
 *
 * PENTING (keamanan & privasi):
 * - Setiap fungsi executor di bawah menerima `uid` dari luar (dari token yang
 *   sudah diverifikasi di api/ai/secretary.js), BUKAN dari argumen tool-call.
 *   Artinya AI tidak mungkin "diperintah" (lewat isi catatan yang jahat/prompt
 *   injection, misalnya) untuk membaca atau mengubah data user lain.
 * - TIDAK ADA tool untuk membaca/mengubah Secrets Vault. AI Secretary sama
 *   sekali tidak diberi akses ke koleksi "secrets".
 */

const projectsService = require('./projectsService');
const notesService = require('./notesService');
const tasksService = require('./tasksService');
const categoriesService = require('./categoriesService');

const MAX_NOTE_CONTENT_FOR_AI = 4000;

function truncate(text, max) {
  if (!text) return text;
  return text.length > max ? `${text.slice(0, max)}\n...(dipotong, catatan lebih panjang dari ini)` : text;
}

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'list_projects',
      description: 'Ambil daftar semua proyek milik user beserta status dan progress-nya. Gunakan ini dulu jika kamu perlu tahu projectId dari sebuah nama proyek.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project',
      description: 'Ambil detail satu proyek: deskripsi, progress, checklist (termasuk mana yang belum selesai), dan catatan terbaru di proyek itu.',
      parameters: {
        type: 'object',
        properties: { projectId: { type: 'string', description: 'ID proyek, didapat dari list_projects.' } },
        required: ['projectId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: 'Cari catatan milik user berdasarkan kata kunci, dan/atau filter proyek/kategori/tag. Hasilnya berupa cuplikan (bukan isi lengkap) — pakai get_note untuk membaca isi lengkap satu catatan.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kata kunci pencarian bebas (judul/isi/kategori/tag/nama proyek).' },
          projectId: { type: 'string', description: 'Batasi pencarian ke satu proyek tertentu.' },
          category: { type: 'string', description: 'Batasi ke kategori tertentu, mis. "Bug" atau "Update".' },
          tag: { type: 'string', description: 'Batasi ke catatan yang memiliki tag ini.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_note',
      description: 'Baca isi lengkap satu catatan berdasarkan noteId (dapatkan noteId dari search_notes terlebih dahulu).',
      parameters: {
        type: 'object',
        properties: { noteId: { type: 'string' } },
        required: ['noteId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description: 'Ambil daftar kategori catatan yang tersedia untuk user ini, supaya bisa memilih kategori yang valid saat membuat/mengubah catatan.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_note',
      description: 'Buat catatan baru. HANYA panggil ini jika user secara eksplisit meminta sesuatu disimpan sebagai catatan.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Judul singkat yang deskriptif. Buat sendiri jika user tidak memberi judul.' },
          content: { type: 'string', description: 'Isi catatan.' },
          projectId: { type: 'string', description: 'Proyek tujuan, dapatkan dari list_projects.' },
          category: { type: 'string', description: 'Salah satu kategori dari list_categories. Jika ragu, pilih yang paling cocok atau "Lainnya".' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tag opsional.' },
          isTask: { type: 'boolean', description: 'true jika catatan ini juga harus muncul sebagai item checklist di proyeknya.' },
        },
        required: ['title', 'content', 'projectId', 'category'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_note',
      description: 'Ubah catatan yang sudah ada (judul/isi/kategori/tag/status tugas). HANYA panggil jika user secara eksplisit meminta perubahan pada catatan tertentu.',
      parameters: {
        type: 'object',
        properties: {
          noteId: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          category: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          isTask: { type: 'boolean' },
        },
        required: ['noteId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Tambahkan satu item checklist baru ke sebuah proyek. HANYA panggil jika user secara eksplisit meminta checklist/tugas baru dibuat.',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          title: { type: 'string', description: 'Deskripsi singkat tugas, mis. "Testing login".' },
        },
        required: ['projectId', 'title'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Ubah judul checklist dan/atau tandai selesai/belum selesai. HANYA panggil jika user secara eksplisit meminta ini.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Didapat dari checklist pada get_project.' },
          completed: { type: 'boolean' },
          title: { type: 'string' },
        },
        required: ['taskId'],
        additionalProperties: false,
      },
    },
  },
];

/**
 * Jalankan satu tool call. Mengembalikan { result, summary }.
 * `result` dikirim balik ke OpenAI sebagai output tool.
 * `summary` (jika ada) adalah kalimat singkat untuk ditampilkan ke user sebagai
 * konfirmasi aksi yang dilakukan (hanya diisi untuk tool yang mengubah data).
 */
async function executeTool(uid, name, args = {}) {
  switch (name) {
    case 'list_projects': {
      const projects = await projectsService.listProjects(uid);
      return {
        result: projects.map((p) => ({ id: p.id, name: p.name, status: p.status, progress: p.progress })),
      };
    }

    case 'get_project': {
      const project = await projectsService.getProject(uid, args.projectId);
      return {
        result: {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          progress: project.progress,
          checklist: project.checklist.map((t) => ({ id: t.id, title: t.title, completed: t.completed })),
          recentNotes: project.recentNotes.map((n) => ({ id: n.id, title: n.title, category: n.category })),
        },
      };
    }

    case 'search_notes': {
      const notes = await notesService.searchNotes(uid, {
        query: args.query,
        projectId: args.projectId,
        category: args.category,
        tag: args.tag,
        limit: 10,
      });
      return {
        result: notes.map((n) => ({
          id: n.id,
          title: n.title,
          snippet: truncate(n.content, 200),
          projectName: n.projectName,
          category: n.category,
          tags: n.tags,
          isTask: n.isTask,
        })),
      };
    }

    case 'get_note': {
      const note = await notesService.getNote(uid, args.noteId);
      return {
        result: {
          id: note.id,
          title: note.title,
          content: truncate(note.content, MAX_NOTE_CONTENT_FOR_AI),
          projectName: note.projectName,
          category: note.category,
          tags: note.tags,
          isTask: note.isTask,
        },
      };
    }

    case 'list_categories': {
      const categories = await categoriesService.listCategories(uid);
      return { result: categories };
    }

    case 'create_note': {
      const note = await notesService.createNote(uid, args);
      return {
        result: { id: note.id, title: note.title, category: note.category, projectName: note.projectName },
        summary: `Catatan baru dibuat: "${note.title}" (proyek: ${note.projectName}, kategori: ${note.category}).`,
      };
    }

    case 'update_note': {
      const { noteId, ...changes } = args;
      const note = await notesService.updateNote(uid, noteId, changes);
      return {
        result: { id: note.id, title: note.title, category: note.category },
        summary: `Catatan "${note.title}" diperbarui.`,
      };
    }

    case 'create_task': {
      const task = await tasksService.createTask(uid, { projectId: args.projectId, title: args.title });
      return {
        result: { id: task.id, title: task.title, completed: task.completed },
        summary: `Checklist baru ditambahkan: "${task.title}".`,
      };
    }

    case 'update_task': {
      const { taskId, ...changes } = args;
      const task = await tasksService.updateTask(uid, taskId, changes);
      let summary = `Checklist "${task.title}" diperbarui.`;
      if (typeof changes.completed === 'boolean') {
        summary = changes.completed
          ? `Checklist "${task.title}" ditandai selesai.`
          : `Checklist "${task.title}" ditandai belum selesai.`;
      }
      return { result: { id: task.id, title: task.title, completed: task.completed }, summary };
    }

    default:
      return { result: { error: `Tool "${name}" tidak dikenal.` } };
  }
}

module.exports = { toolDefinitions, executeTool };
