// workspace.js — SynthXis Research Agent

const MAX_PAGES = 10;

const COLUMNS = {
  1: { body:'body-1', url:'url-1', file:'file-1', title:'title-1' },
  2: { body:'body-2', url:'url-2', file:'file-2', title:'title-2' },
  3: { body:'body-3', url:'url-3', file:'file-3', title:'title-3' },
};

const paragraphRegistry = {};
const paperTextStore    = {};

// ── PDF.js ───────────────────────────────────────────────────────────────────
function initialisePdfJs() {
  if (!window.pdfjsLib) {
    console.error('pdf.min.js not found');
    return false;
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    chrome.runtime.getURL('pdf.worker.min.js');
  console.log('✓ PDF.js ready');
  return true;
}

// ── Utilities ────────────────────────────────────────────────────────────────
const truncate = (s, max=40) => s.length > max ? s.slice(0,max-1)+'…' : s;

function setTitle(n, text) {
  const el = document.getElementById(COLUMNS[n].title);
  if (el) el.textContent = truncate(text);
}

function showSpinner(el) {
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;
                justify-content:center;height:200px;gap:12px;">
      <div class="spinner"></div>
      <span style="font-size:12px;color:#aaa;">Loading…</span>
    </div>`;
}

function showColError(el, msg) {
  el.innerHTML = `
    <div style="padding:24px;color:#c0392b;font-size:12px;line-height:1.7;">
      <strong>Could not load paper</strong><br>${msg}
    </div>`;
}

// ── Reset column ─────────────────────────────────────────────────────────────
function resetColumn(n) {
  const ids = COLUMNS[n];
  Object.keys(paragraphRegistry)
    .filter(k => k.startsWith(`${n}-`))
    .forEach(k => delete paragraphRegistry[k]);
  Object.keys(paperTextStore)
    .filter(k => k.startsWith(`${n}-`))
    .forEach(k => delete paperTextStore[k]);
  setTitle(n, `Paper ${n}`);
  document.getElementById(ids.body).innerHTML = `
    <div class="drop-zone" id="drop-${n}">
      <div class="drop-icon">📄</div>
      <p class="drop-label">Drop a PDF or paste a URL</p>
      <p class="drop-sub">Drag a file here, paste a URL, or pick a file</p>
      <div class="url-row">
        <input type="text" class="url-input" id="${ids.url}"
               placeholder="Paste any URL or DOI…" />
        <label class="file-pick-btn" title="Choose a PDF file">
          📎<input type="file" class="file-input" id="${ids.file}"
                   accept=".pdf,application/pdf" />
        </label>
      </div>
    </div>`;
  attachColumnListeners(n);
}

// ── PDF rendering ─────────────────────────────────────────────────────────────
async function renderPdf(n, source, suggestedTitle) {
  const bodyEl = document.getElementById(COLUMNS[n].body);
  showSpinner(bodyEl);
  if (!window.pdfjsLib) {
    showColError(bodyEl, 'PDF.js not loaded.');
    return;
  }
  let pdf;
  try {
    pdf = await window.pdfjsLib.getDocument(
      typeof source === 'string' ? { url: source } : { data: source }
    ).promise;
  } catch(e) {
    showColError(bodyEl, `Could not parse PDF: ${e.message}`);
    return;
  }

  const container = document.createElement('div');
  container.style.cssText = 'padding:12px;display:flex;flex-direction:column;gap:8px;';
  bodyEl.innerHTML = '';
  bodyEl.appendChild(container);

  // Title extraction
  let title = suggestedTitle || `Paper ${n}`;
  try {
    const pg    = await pdf.getPage(1);
    const tc    = await pg.getTextContent();
    const lines = tc.items.map(i => i.str.trim()).filter(s => s.length > 6);
    if (lines.length) {
      const best = [...lines.slice(0,5)].sort((a,b) => b.length - a.length)[0];
      if (best && best.length > 10) title = best;
    }
  } catch(_) {}
  setTitle(n, title);

  Object.keys(paperTextStore)
    .filter(k => k.startsWith(`${n}-`))
    .forEach(k => delete paperTextStore[k]);

  const total = Math.min(pdf.numPages, MAX_PAGES);

  for (let p = 1; p <= total; p++) {
    const page     = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.4 });

    // Extract and store text content
    try {
      const tc       = await page.getTextContent();
      const pageText = tc.items.map(i => i.str).join(' ').replace(/\s+/g,' ').trim();
      paperTextStore[`${n}-${p}`] = pageText;
    } catch(_) {
      paperTextStore[`${n}-${p}`] = '';
    }

    // Wrapper — position:relative so the highlight overlay sits inside it
    const wrapper = document.createElement('div');
    wrapper.dataset.paper = String(n);
    wrapper.dataset.para  = String(p);
    wrapper.style.cssText = `
      position:relative;
      border:1px solid #eee;
      border-radius:4px;
      overflow:hidden;
      background:#fff;`;

    const canvas = document.createElement('canvas');
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    canvas.style.cssText = 'display:block;width:100%;height:auto;';
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
    paragraphRegistry[`${n}-${p}`] = wrapper;

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;color:#bbb;text-align:center;padding:4px 0;background:#fafaf8;';
    lbl.textContent = `Page ${p} of ${pdf.numPages}`;
    wrapper.appendChild(lbl);
  }

  if (pdf.numPages > MAX_PAGES) {
    const note = document.createElement('div');
    note.style.cssText = 'font-size:11px;color:#aaa;text-align:center;padding:12px;';
    note.textContent = `Showing first ${MAX_PAGES} of ${pdf.numPages} pages.`;
    container.appendChild(note);
  }

  console.log(`✓ Paper ${n}: ${total} pages rendered`);
}

// ── Text/webpage rendering ────────────────────────────────────────────────────
function renderText(n, text, title) {
  const bodyEl = document.getElementById(COLUMNS[n].body);
  setTitle(n, title);
  const container = document.createElement('div');
  container.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:0;';
  bodyEl.innerHTML = '';
  bodyEl.appendChild(container);
  text.split(/\n{2,}/).filter(p => p.trim()).forEach((para, i) => {
    const div = document.createElement('div');
    div.dataset.paper = String(n);
    div.dataset.para  = String(i + 1);
    div.style.cssText = 'font-size:13px;line-height:1.7;color:#222;padding:8px 0;border-bottom:1px solid #f0ede8;';
    div.textContent = para.trim();
    container.appendChild(div);
    paragraphRegistry[`${n}-${i+1}`] = div;
  });
}

// ── URL loading ───────────────────────────────────────────────────────────────
function normaliseUrl(raw) {
  let url = raw.trim();
  if (!url.startsWith('http')) url = 'https://' + url;
  const arxiv = url.match(/arxiv\.org\/abs\/([^\s?#]+)/);
  if (arxiv) return `https://arxiv.org/pdf/${arxiv[1]}.pdf`;
  const doi = url.match(/^(?:https?:\/\/)?(?:doi:)?(10\.\d{4,}\/\S+)/);
  if (doi) return `https://doi.org/${doi[1]}`;
  return url;
}

function extractReadableText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  ['script','style','nav','header','footer','aside','noscript']
    .forEach(t => doc.querySelectorAll(t).forEach(el => el.remove()));
  const main = doc.querySelector('main,article,[role="main"],.content') || doc.body;
  return (main?.innerText || main?.textContent || '').trim();
}

function extractHtmlTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

async function loadFromUrl(n, rawUrl) {
  const bodyEl = document.getElementById(COLUMNS[n].body);
  showSpinner(bodyEl);
  const url = normaliseUrl(rawUrl);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
      await renderPdf(n, await res.arrayBuffer(),
        url.split('/').pop().replace(/[?#].*$/,'').replace(/\.pdf$/i,''));
    } else {
      const html = await res.text();
      renderText(n, extractReadableText(html), extractHtmlTitle(html) || url);
    }
  } catch(e) {
    const isCors = e.message.includes('Failed to fetch') ||
                   e.message.includes('NetworkError') ||
                   e.message === 'Load failed';
    showColError(bodyEl, isCors
      ? `CORS blocked — download and use 📎 instead.<br><em style="color:#aaa;">${url}</em>`
      : e.message);
  }
}

async function handleFile(n, file) {
  const bodyEl = document.getElementById(COLUMNS[n].body);
  if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
    showColError(bodyEl, 'Only PDF files are supported.');
    return;
  }
  await renderPdf(n, await file.arrayBuffer(), file.name.replace(/\.pdf$/i,''));
}

// ── Column listeners ──────────────────────────────────────────────────────────
function attachColumnListeners(n) {
  const bodyEl = document.getElementById(COLUMNS[n].body);
  bodyEl.addEventListener('dragover', e => {
    e.preventDefault();
    bodyEl.querySelector('.drop-zone')?.classList.add('drag-over');
  });
  bodyEl.addEventListener('dragleave', () => {
    bodyEl.querySelector('.drop-zone')?.classList.remove('drag-over');
  });
  bodyEl.addEventListener('drop', async e => {
    e.preventDefault();
    bodyEl.querySelector('.drop-zone')?.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) await handleFile(n, file);
  });
  bodyEl.addEventListener('keydown', async e => {
    if (e.key !== 'Enter' || !e.target.classList.contains('url-input')) return;
    const url = e.target.value.trim();
    if (url) await loadFromUrl(n, url);
  });
  bodyEl.addEventListener('change', async e => {
    if (!e.target.classList.contains('file-input')) return;
    const file = e.target.files[0];
    if (file) await handleFile(n, file);
  });
}

// ── Inject CSS ────────────────────────────────────────────────────────────────
function injectSpinnerCss() {
  const s = document.createElement('style');
  s.textContent = `
    @keyframes spin { to { transform:rotate(360deg); } }
    .spinner {
      width:28px;height:28px;border:3px solid #eee;
      border-top-color:#5b3de8;border-radius:50%;
      animation:spin 0.7s linear infinite;
    }
    @keyframes pulse-text { 0%,100%{opacity:1} 50%{opacity:0.5} }
    .agent-loading {
      display:flex;flex-direction:column;align-items:center;gap:10px;padding:20px 0;
    }
    .agent-loading-text {
      font-size:12px;color:#999;animation:pulse-text 2s ease-in-out infinite;
    }

    /* ── Page highlight overlay ──
       A clean full-width band over the canvas, flush with the wrapper edges.
       Uses paper colour, fades out smoothly after 3 seconds. */
    .page-highlight-bar {
      position:absolute;
      left:0;
      right:0;
      pointer-events:none;
      border-radius:0;
      transition:opacity 1s ease;
      z-index:10;
    }
    .page-highlight-bar.fade-out { opacity:0; }

    /* Paper colour variants */
    .page-highlight-bar.p1 {
      background:rgba(67,97,238,0.18);
      border-top:2px solid rgba(67,97,238,0.55);
      border-bottom:2px solid rgba(67,97,238,0.55);
    }
    .page-highlight-bar.p2 {
      background:rgba(224,92,92,0.18);
      border-top:2px solid rgba(224,92,92,0.55);
      border-bottom:2px solid rgba(224,92,92,0.55);
    }
    .page-highlight-bar.p3 {
      background:rgba(22,160,133,0.18);
      border-top:2px solid rgba(22,160,133,0.55);
      border-bottom:2px solid rgba(22,160,133,0.55);
    }

    /* Webpage paragraph highlight */
    .para-highlighted {
      background:rgba(67,97,238,0.1);
      outline:2px solid rgba(67,97,238,0.4);
      border-radius:4px;
      transition:background 1s, outline 1s;
    }
    .para-highlighted.fade-out {
      background:transparent !important;
      outline-color:transparent !important;
    }
  `;
  document.head.appendChild(s);
}

// ── Highlight a section of a PDF page ────────────────────────────────────────
// Draws a clean coloured band across the relevant portion of the page.
// For the first page: highlights the top third (abstract/intro area).
// For middle pages:   highlights the middle two thirds (body text area).
// For last pages:     highlights the bottom third (conclusion area).
// This reliably covers the cited content without any coordinate mismatch.
function highlightPageSection(wrapper, pageNum, totalPages, paperNum) {
  // Remove any existing highlight on this wrapper
  wrapper.querySelectorAll('.page-highlight-bar').forEach(el => el.remove());

  const canvas = wrapper.querySelector('canvas');
  if (!canvas) return;

  // Determine which vertical section to highlight based on page position
  // This gives a visually meaningful band — not a random box
  let topPct, heightPct;
  const relPos = pageNum / Math.max(totalPages, 1);

  if (relPos <= 0.15) {
    // First pages — title/abstract area: top strip
    topPct    = 8;
    heightPct = 35;
  } else if (relPos >= 0.85) {
    // Last pages — conclusion/references: bottom strip
    topPct    = 55;
    heightPct = 35;
  } else {
    // Middle pages — body text: large middle band
    topPct    = 12;
    heightPct = 76;
  }

  // Convert percentage to pixels based on actual rendered canvas height
  const canvasH = canvas.offsetHeight || canvas.height;
  const topPx   = Math.round(canvasH * topPct    / 100);
  const highPx  = Math.round(canvasH * heightPct / 100);

  const bar = document.createElement('div');
  bar.className = `page-highlight-bar p${paperNum}`;
  bar.style.top    = `${topPx}px`;
  bar.style.height = `${highPx}px`;
  wrapper.appendChild(bar);

  // Pulse the border briefly to draw the eye
  bar.animate([
    { opacity: 0   },
    { opacity: 1   },
    { opacity: 0.7 },
    { opacity: 1   }
  ], { duration: 600, easing: 'ease-in-out' });

  // Fade out after 3.5 seconds
  setTimeout(() => {
    bar.classList.add('fade-out');
    setTimeout(() => bar.remove(), 1100);
  }, 3500);
}

// ══════════════════════════════════════════════════════════════════════════════
// SINGLE DOMContentLoaded
// ══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  console.log('✓ DOMContentLoaded fired');

  initialisePdfJs();
  injectSpinnerCss();

  [1,2,3].forEach(n => attachColumnListeners(n));

  document.querySelectorAll('.paper-close').forEach(btn => {
    btn.addEventListener('click', () => resetColumn(parseInt(btn.dataset.col, 10)));
  });

  const panel        = document.getElementById('agentPanel');
  const handle       = document.getElementById('agentHandle');
  const pill         = document.getElementById('agentPill');
  const minBtn       = document.getElementById('minimiseBtn');
  const closeBtn     = document.getElementById('closePanelBtn');
  const customChip   = document.getElementById('customChip');
  const customInput  = document.getElementById('customQuestion');
  const runBtn       = document.getElementById('runBtn');
  const resultsCont  = document.getElementById('resultsContainer');
  const resultsEmpty = document.getElementById('resultsEmpty');
  const chips        = document.querySelectorAll('.chip:not(.chip-custom)');

  // ── Drag ──────────────────────────────────────────────────────────────────
  let dragging=false, ox=0, oy=0;
  handle.addEventListener('mousedown', e => {
    if (e.target.closest('.handle-controls, button, input, label')) return;
    dragging = true;
    const r = panel.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    panel.style.right='auto'; panel.style.bottom='auto';
    panel.style.left=r.left+'px'; panel.style.top=r.top+'px';
    panel.style.transition='none';
    document.body.style.userSelect='none';
    handle.style.cursor='grabbing';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    panel.style.left = Math.max(0, Math.min(e.clientX-ox, window.innerWidth -panel.offsetWidth )) + 'px';
    panel.style.top  = Math.max(0, Math.min(e.clientY-oy, window.innerHeight-panel.offsetHeight)) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging=false;
    document.body.style.userSelect='';
    handle.style.cursor='grab';
  });

  // ── Minimise ──────────────────────────────────────────────────────────────
  const minimise = () => { panel.style.display='none'; pill.style.display='flex'; };
  const expand   = () => { pill.style.display='none';  panel.style.display='flex'; };
  minBtn.addEventListener('click', minimise);
  closeBtn.addEventListener('click', minimise);
  pill.addEventListener('click', expand);

  // ── Chips ─────────────────────────────────────────────────────────────────
  chips.forEach(c => c.addEventListener('click', () => c.classList.toggle('active')));
  customChip.addEventListener('click', () => customInput.focus());

  let resultCount = 0;

  // ── getActiveQuestions ────────────────────────────────────────────────────
  window.getActiveQuestions = () => {
    const active = [...chips]
      .filter(c => c.classList.contains('active'))
      .map(c => c.dataset.question);
    const custom = customInput.value.trim();
    if (custom) active.push(custom);
    return active;
  };

  // ── renderResult ──────────────────────────────────────────────────────────
  window.renderResult = (question, answer, sources) => {
    resultsEmpty.style.display = 'none';
    const card = document.createElement('div');
    card.className = 'result-card';

    const hdr = document.createElement('div');
    hdr.className='result-card-header'; hdr.textContent=question;

    const body = document.createElement('div');
    body.className='result-answer'; body.textContent=answer;

    const row = document.createElement('div');
    row.className='result-chips-row';

    if (!sources || !sources.length) {
      const inf = document.createElement('span');
      inf.className='source-chip sc-inference';
      inf.textContent='agent inference · not sourced';
      row.appendChild(inf);
    } else {
      sources.forEach(src => {
        const sc = document.createElement('span');
        sc.className=`source-chip sc-p${src.paper}`;
        sc.textContent=`↗ P${src.paper} · para ${src.para}${src.approximate?'~':''}`;
        if (src.approximate) sc.style.opacity='0.7';
        sc.addEventListener('click', () => {
          window.jumpToParagraph(src.paper, src.para);
        });
        row.appendChild(sc);
      });
    }

    card.append(hdr, body, row);
    resultsCont.appendChild(card);
    resultCount++;
    document.getElementById('pillCount').textContent = resultCount;
  };

  // ── jumpToParagraph ───────────────────────────────────────────────────────
  window.jumpToParagraph = (paperNum, paraIndex) => {
    const el = paragraphRegistry[`${paperNum}-${paraIndex}`];
    if (!el) return;

    // Scroll the page into view
    el.scrollIntoView({ behavior:'smooth', block:'center' });

    setTimeout(() => {
      // Check if this is a PDF canvas page or a text paragraph
      const canvas = el.querySelector('canvas');
      if (canvas) {
        // PDF page — draw a clean section highlight bar
        // Count total pages loaded for this paper to determine position
        const totalPages = Object.keys(paragraphRegistry)
          .filter(k => k.startsWith(`${paperNum}-`)).length;
        highlightPageSection(el, paraIndex, totalPages, paperNum);
      } else {
        // Webpage text paragraph — highlight the whole block
        el.classList.remove('para-highlighted','fade-out');
        void el.offsetWidth;
        el.classList.add('para-highlighted');
        setTimeout(() => {
          el.classList.add('fade-out');
          setTimeout(() => el.classList.remove('para-highlighted','fade-out'), 1100);
        }, 3500);
      }
    }, 450);
  };

  // ── clearResults ──────────────────────────────────────────────────────────
  window.clearResults = () => {
    resultsCont.innerHTML='';
    resultsEmpty.style.display='block';
    resultCount=0;
    document.getElementById('pillCount').textContent=0;
  };

  // ── No-key banner ─────────────────────────────────────────────────────────
  function showNoKeyBanner() {
    resultsEmpty.style.display='none';
    if (document.getElementById('noKeyBanner')) return;
    const b = document.createElement('div');
    b.id='noKeyBanner'; b.className='no-key-banner';
    b.innerHTML=`<strong>⚙</strong> Add your free Groq API key in
      <strong>settings</strong> to run SynthXis.<br>
      <span style="font-size:11px;color:#bbb;">Get one free at console.groq.com</span>`;
    resultsCont.prepend(b);
  }

  chrome.storage.local.get('groq_api_key', r => {
    if (!r.groq_api_key) showNoKeyBanner();
  });

  // ── Extract paper text ────────────────────────────────────────────────────
  function extractPaperText(paperNumber) {
    const titleEl = document.getElementById(`title-${paperNumber}`);
    const title   = titleEl?.textContent.trim() || `Paper ${paperNumber}`;
    const CHAR_BUDGET = 15000;

    const storeKeys = Object.keys(paperTextStore)
      .filter(k => k.startsWith(`${paperNumber}-`))
      .sort((a,b) => parseInt(a.split('-')[1],10) - parseInt(b.split('-')[1],10));

    if (storeKeys.length > 0) {
      const paragraphs = [];
      let totalChars   = 0;
      for (const k of storeKeys) {
        if (totalChars >= CHAR_BUDGET) break;
        const raw       = paperTextStore[k];
        const remaining = CHAR_BUDGET - totalChars;
        const text      = raw.slice(0, remaining).trim();
        if (text.length > 20) {
          paragraphs.push({ paraIndex: parseInt(k.split('-')[1],10), text });
          totalChars += text.length;
        }
      }
      if (paragraphs.length > 0) {
        console.log(`Paper ${paperNumber}: ${paragraphs.length} pages, ~${Math.round(totalChars/4)} tokens`);
        return { paperNumber, title, paragraphs };
      }
    }

    const paraEls = document.querySelectorAll(`[data-paper="${paperNumber}"][data-para]`);
    if (!paraEls.length) return null;
    const paragraphs = [];
    let totalChars   = 0;
    paraEls.forEach(el => {
      if (totalChars >= CHAR_BUDGET) return;
      const raw  = (el.innerText || el.textContent || '').replace(/Page \d+ of \d+/g,'').trim();
      const text = raw.slice(0, CHAR_BUDGET - totalChars);
      if (text.length > 20) {
        paragraphs.push({ paraIndex: parseInt(el.dataset.para,10), text });
        totalChars += text.length;
      }
    });
    return paragraphs.length > 0 ? { paperNumber, title, paragraphs } : null;
  }

  // ── Build user message ────────────────────────────────────────────────────
  function buildUserMessage(papers, questions) {
    let msg = '';
    papers.forEach(p => {
      msg += `=== PAPER ${p.paperNumber}: ${p.title} ===\n`;
      p.paragraphs.forEach(para => {
        msg += `Para ${para.paraIndex}: ${para.text}\n`;
      });
      msg += '\n';
    });
    msg += 'QUESTIONS TO ANSWER:\n';
    questions.forEach((q,i) => { msg += `${i+1}. ${q}\n`; });
    msg += `\nRespond ONLY with this exact JSON — no markdown:
{
  "findings": [
    {
      "question": "question label",
      "answer": "analysis with inline citations like [P1·para3]",
      "sources": [{ "paper": 1, "para": 3 }]
    }
  ]
}`;
    return msg;
  }

  // ── Call Groq API ─────────────────────────────────────────────────────────
  async function callAI(apiKey, systemPrompt, userMessage) {
    const estTokens = Math.round((systemPrompt.length + userMessage.length) / 4);
    console.log(`Sending ~${estTokens.toLocaleString()} tokens to Groq`);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role:'system', content: systemPrompt },
          { role:'user',   content: userMessage  }
        ],
        temperature: 0.2,
        response_format: { type:'json_object' }
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status===401) throw new Error('API key rejected — check console.groq.com');
      if (res.status===429) throw new Error('Rate limit — wait 60 seconds and try again');
      throw new Error(`Groq error ${res.status}: ${errText.slice(0,120)}`);
    }

    const data = await res.json();
    const raw  = data?.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty response from Groq — try again');
    return raw;
  }

  function showAgentLoading() {
    resultsEmpty.style.display='none';
    resultsCont.innerHTML=`
      <div class="agent-loading">
        <div class="spinner"></div>
        <div class="agent-loading-text">SynthXis is reading your papers…</div>
      </div>`;
  }

  function showAgentError(msg) {
    resultsCont.innerHTML=`
      <div style="padding:14px;font-size:12px;color:#c0392b;line-height:1.65;
                  border:1px solid #f5c6c6;border-radius:8px;background:#fff8f8;">
        <strong>SynthXis error</strong><br>${msg}
      </div>`;
  }

  // ── Run agent ─────────────────────────────────────────────────────────────
  async function runAgent() {
    const { groq_api_key: key } = await chrome.storage.local.get('groq_api_key');
    if (!key) {
      showNoKeyBanner();
      document.getElementById('settingsPopover').style.cssText =
        'display:flex;flex-direction:column;gap:8px;position:fixed;' +
        'bottom:80px;right:24px;width:260px;background:#fff;' +
        'border:1px solid #e0ddd8;border-radius:11px;padding:14px;' +
        'z-index:9999;box-shadow:0 8px 28px rgba(0,0,0,0.15);';
      return;
    }

    const questions = window.getActiveQuestions();
    if (!questions.length) { alert('Select at least one question chip.'); return; }

    const papers = [1,2,3]
      .map(extractPaperText)
      .filter(p => p !== null && p.paragraphs.length > 0);
    if (!papers.length) { alert('Load at least one paper first.'); return; }

    console.log(`SynthXis: ${papers.length} paper(s), ${questions.length} question(s)`);
    showAgentLoading();
    runBtn.disabled=true; runBtn.textContent='Analysing… ↻';

    const systemPrompt =
      `You are SynthXis, a research analysis agent. You have been given ${papers.length} ` +
      `academic paper${papers.length>1?'s':''}. For each question provide structured analysis. ` +
      `Cite paragraphs inline as [P1·para3] or [P2·para7]. Be precise and scholarly. ` +
      `Do not fabricate citations. Respond ONLY with valid JSON, no markdown.`;

    try {
      const raw = await callAI(key, systemPrompt, buildUserMessage(papers, questions));
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch(_) {
        const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (m) parsed = JSON.parse(m[1]);
        else throw new Error('Response was not valid JSON — try again');
      }

      const findings = parsed?.findings;
      if (!Array.isArray(findings) || !findings.length)
        throw new Error('No findings returned — try again');

      resultsCont.innerHTML='';
      findings.forEach(f => {
        window.renderResult(f.question, f.answer,
          (f.sources||[]).map(s => ({
            paper: parseInt(s.paper,10),
            para:  parseInt(s.para, 10),
            approximate: s.approximate||false
          })));
      });

    } catch(e) {
      console.error('SynthXis error:', e);
      showAgentError(e.message);
    } finally {
      runBtn.disabled=false;
      runBtn.textContent='Run ↗';
    }
  }

  runBtn.addEventListener('click', runAgent);
  console.log('✓ SynthXis ready');

  // ── Settings ──────────────────────────────────────────────────────────────
  setTimeout(() => {
    const settingsBtn     = document.getElementById('settingsBtn');
    const settingsPopover = document.getElementById('settingsPopover');
    const apiKeyInput     = document.getElementById('apiKeyInput');
    const saveApiKeyBtn   = document.getElementById('saveApiKeyBtn');
    const settingsSaved   = document.getElementById('settingsSaved');

    function openSettings() {
      settingsPopover.style.cssText =
        'display:flex;flex-direction:column;gap:8px;position:fixed;' +
        'bottom:80px;right:24px;width:260px;background:#fff;' +
        'border:1px solid #e0ddd8;border-radius:11px;padding:14px;' +
        'z-index:9999;box-shadow:0 8px 28px rgba(0,0,0,0.15);';
      settingsSaved.style.display = 'none';
      chrome.storage.local.get('groq_api_key', r => {
        if (r.groq_api_key) apiKeyInput.value = r.groq_api_key;
      });
    }

    function closeSettings() {
      settingsPopover.style.display = 'none';
    }

    settingsBtn.addEventListener('click', e => {
      e.stopPropagation();
      settingsPopover.style.display === 'flex' ? closeSettings() : openSettings();
    });

    saveApiKeyBtn.addEventListener('click', () => {
      const key = apiKeyInput.value.trim();
      if (!key) {
        apiKeyInput.style.borderColor = '#c0392b';
        setTimeout(() => { apiKeyInput.style.borderColor = ''; }, 1500);
        return;
      }
      chrome.storage.local.set({ groq_api_key: key }, () => {
        settingsSaved.style.display = 'block';
        document.getElementById('noKeyBanner')?.remove();
        setTimeout(() => {
          settingsSaved.style.display = 'none';
          closeSettings();
        }, 1500);
      });
    });

    document.addEventListener('click', e => {
      if (settingsPopover.style.display === 'flex' &&
          !settingsPopover.contains(e.target) &&
          e.target !== settingsBtn) {
        closeSettings();
      }
    });

    console.log('✓ Settings listeners attached');
  }, 0);

});