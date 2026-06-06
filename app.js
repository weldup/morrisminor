/**
 * Morris Minor Workshop Manual & Parts Catalogue PWA
 * Client-side search using Lunr.js
 */

let searchIndex = null;
let documents = [];
let currentFilter = 'all';

const searchInput = document.getElementById('searchInput');
const resultsEl = document.getElementById('results');
const welcomeEl = document.getElementById('welcome');
const statusEl = document.getElementById('searchStatus');
const loadingEl = document.getElementById('loading');
const modalEl = document.getElementById('imageModal');
const modalImg = document.getElementById('modalImage');
const chapterListEl = document.getElementById('chapterList');

// Initialize
async function init() {
    loadingEl.hidden = false;

    try {
        // Load search data
        const response = await fetch('data/search_data.json');
        documents = await response.json();

        // Build Lunr index
        searchIndex = lunr(function () {
            this.ref('id');
            this.field('title', { boost: 10 });
            this.field('chapter', { boost: 5 });
            this.field('body');

            // Add pipeline for better matching
            this.pipeline.remove(lunr.stemmer);
            this.pipeline.remove(lunr.stopWordFilter);

            documents.forEach(doc => {
                this.add({
                    id: doc.id,
                    title: doc.title,
                    chapter: doc.chapter,
                    body: doc.body.substring(0, 2000), // limit index size
                });
            });
        });

        // Build chapter browse list
        buildChapterList();

        loadingEl.hidden = true;
        statusEl.textContent = `${documents.length} sections loaded`;
    } catch (err) {
        loadingEl.querySelector('p').textContent = 'Error loading data: ' + err.message;
        console.error(err);
    }
}

function buildChapterList() {
    const chapters = {};
    documents.forEach(doc => {
        if (doc.type === 'manual') {
            if (!chapters[doc.chapter_code]) {
                chapters[doc.chapter_code] = doc.chapter;
            }
        }
    });

    let html = '<h3>Browse by Chapter</h3><div class="chapter-list">';
    Object.entries(chapters).forEach(([code, name]) => {
        html += `<div class="chapter-link" data-chapter="${code}">${name}</div>`;
    });
    html += '</div>';
    chapterListEl.innerHTML = html;

    // Click handlers
    chapterListEl.querySelectorAll('.chapter-link').forEach(el => {
        el.addEventListener('click', () => {
            const code = el.dataset.chapter;
            showChapter(code);
        });
    });
}

function showChapter(chapterCode) {
    const filtered = documents.filter(d => d.chapter_code === chapterCode);
    displayResults(filtered, `${filtered[0]?.chapter || chapterCode}`);
    welcomeEl.hidden = true;
    searchInput.value = '';
    statusEl.textContent = `${filtered.length} sections in ${filtered[0]?.chapter || chapterCode}`;
}

// Search
let searchTimeout = null;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(performSearch, 200);
});

function performSearch() {
    const query = searchInput.value.trim();

    if (!query) {
        welcomeEl.hidden = false;
        resultsEl.innerHTML = '';
        resultsEl.appendChild(welcomeEl);
        statusEl.textContent = `${documents.length} sections loaded`;
        return;
    }

    welcomeEl.hidden = true;

    if (!searchIndex) return;

    try {
        // Try wildcard search for partial matches
        let results = searchIndex.search(query + '*');
        
        // If no results with wildcard, try exact
        if (results.length === 0) {
            results = searchIndex.search(query);
        }

        // Also try with wildcard prefix for part numbers
        if (results.length === 0) {
            results = searchIndex.search('*' + query + '*');
        }

        // Map results to documents
        let matched = results.map(r => {
            const doc = documents.find(d => d.id === r.ref);
            return doc ? { ...doc, score: r.score } : null;
        }).filter(Boolean);

        // Apply filter
        if (currentFilter !== 'all') {
            matched = matched.filter(d => d.type === currentFilter);
        }

        statusEl.textContent = `${matched.length} result${matched.length !== 1 ? 's' : ''} for "${query}"`;
        displayResults(matched, query);
    } catch (e) {
        // Lunr syntax error - try as plain term
        try {
            const results = searchIndex.search(query.replace(/[^a-zA-Z0-9 ]/g, ''));
            let matched = results.map(r => {
                const doc = documents.find(d => d.id === r.ref);
                return doc ? { ...doc, score: r.score } : null;
            }).filter(Boolean);

            if (currentFilter !== 'all') {
                matched = matched.filter(d => d.type === currentFilter);
            }

            statusEl.textContent = `${matched.length} result${matched.length !== 1 ? 's' : ''}`;
            displayResults(matched, query);
        } catch (e2) {
            statusEl.textContent = 'Search error';
        }
    }
}

function displayResults(docs, query) {
    if (docs.length === 0) {
        resultsEl.innerHTML = '<p style="text-align:center; color:#555; padding:2rem;">No results found. Try different terms.</p>';
        return;
    }

    const html = docs.slice(0, 50).map(doc => renderCard(doc, query)).join('');
    resultsEl.innerHTML = html;

    // Attach event listeners
    resultsEl.querySelectorAll('.expand-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const body = btn.previousElementSibling;
            if (body.classList.contains('expanded')) {
                body.classList.remove('expanded');
                btn.textContent = 'Show more';
            } else {
                // Load full content if available
                const docId = btn.dataset.docId;
                const doc = documents.find(d => d.id === docId);
                if (doc) {
                    // For parts catalogue entries, show full parts table
                    if (doc.parts && doc.parts.length > 0) {
                        body.innerHTML = renderPartsTableFull(doc.parts, searchInput.value.trim());
                    } else if (doc.type === 'manual') {
                        body.innerHTML = formatManualText(doc.full_text, searchInput.value.trim());
                    } else if (doc.full_text && doc.full_text.length > 2000) {
                        if (doc.type === 'birmingham') {
                            const lines = doc.full_text.split('\n');
                            body.innerHTML = lines.map(l => highlightText(l, searchInput.value.trim())).join('<br>');
                        } else {
                            body.innerHTML = highlightText(doc.full_text, searchInput.value.trim());
                        }
                    }
                }
                body.classList.add('expanded');
                btn.textContent = 'Show less';
            }
        });
    });

    resultsEl.querySelectorAll('.image-thumb').forEach(img => {
        img.addEventListener('click', () => openModal(img.dataset.src));
    });
}

function renderCard(doc, query) {
    const isManual = doc.type === 'manual';
    const isBirmingham = doc.type === 'birmingham';
    const typeLabel = isManual ? 'Manual' : isBirmingham ? 'Birmingham' : 'ESM Parts';
    const typeClass = isManual ? '' : isBirmingham ? ' birmingham' : ' catalogue';

    // Highlight matching text
    let bodyHtml = '';
    if (isManual) {
        bodyHtml = formatManualText(doc.full_text.substring(0, 2000), query);
    } else if (doc.parts && doc.parts.length > 0) {
        bodyHtml = renderPartsTable(doc.parts, query);
    } else if (isBirmingham) {
        // Birmingham OCR text - preserve line formatting
        const lines = doc.full_text.substring(0, 2000).split('\n');
        bodyHtml = lines.map(l => highlightText(l, query)).join('<br>');
    } else {
        bodyHtml = highlightText(doc.full_text.substring(0, 2000), query);
    }

    // Images
    let imagesHtml = '';
    if (doc.images && doc.images.length > 0) {
        const thumbs = doc.images.slice(0, 4).map(src =>
            `<img class="image-thumb" src="${src}" data-src="${src}" alt="Diagram" loading="lazy" onerror="this.style.display='none'">`
        ).join('');
        imagesHtml = `<div class="image-row">${thumbs}</div>`;
    }

    const pageInfo = doc.pages && doc.pages.length ? `Page ${doc.pages.join(', ')}` : '';

    return `
        <div class="result-card${typeClass}">
            <span class="type-badge">${typeLabel}</span>
            <div class="title">${highlightText(doc.title, query)}</div>
            <div class="chapter">${doc.chapter}${pageInfo ? ' · ' + pageInfo : ''}</div>
            <div class="body">${bodyHtml}</div>
            <button class="expand-btn" data-doc-id="${doc.id}">Show more</button>
            ${imagesHtml}
        </div>
    `;
}

function renderPartsTable(parts, query) {
    const rows = parts.slice(0, 20).map(p =>
        `<tr><td>${highlightText(p.part_number, query)}</td><td>${highlightText(p.esm_order || '', query)}</td><td>${highlightText(p.illus_no || '', query)}</td><td>${highlightText(p.description, query)}</td></tr>`
    ).join('');

    let extra = '';
    if (parts.length > 20) {
        extra = `<tr><td colspan="4" style="color:#555; font-style:italic;">...and ${parts.length - 20} more parts</td></tr>`;
    }

    return `<table class="parts-table"><thead><tr><th>Part No.</th><th>ESM Order</th><th>Ill.</th><th>Description</th></tr></thead><tbody>${rows}${extra}</tbody></table>`;
}

function renderPartsTableFull(parts, query) {
    const rows = parts.map(p =>
        `<tr><td>${highlightText(p.part_number, query)}</td><td>${highlightText(p.esm_order || '', query)}</td><td>${highlightText(p.illus_no || '', query)}</td><td>${highlightText(p.description, query)}</td></tr>`
    ).join('');

    return `<table class="parts-table"><thead><tr><th>Part No.</th><th>ESM Order</th><th>Ill.</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function formatManualText(text, query) {
    if (!text) return '';
    
    const lines = text.split('\n');
    let html = '';
    let keyItems = [];
    let paragraphLines = [];
    
    function flushParagraph() {
        if (paragraphLines.length > 0) {
            html += `<p>${highlightText(paragraphLines.join(' '), query)}</p>`;
            paragraphLines = [];
        }
    }
    
    function flushKeyItems() {
        if (keyItems.length > 0) {
            // Sort by number and display as a compact list
            keyItems.sort((a, b) => a.num - b.num);
            html += '<div class="key-list">';
            keyItems.forEach(item => {
                html += `<span class="key-item"><b>${item.num}.</b> ${highlightText(item.desc, query)}</span>`;
            });
            html += '</div>';
            keyItems = [];
        }
    }
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip junk lines (single chars, OCR noise, decorative borders)
        if (line.length <= 2) continue;
        if (/^[~:;$!|.*\-\s#i{}()\[\]\\\/I]+$/.test(line)) continue;
        if (/^[0-9]{1,3}$/.test(line) && !paragraphLines.length) continue; // stray numbers
        if (line.startsWith('Morris Minor') && line.includes('Issue')) continue;
        if (line.startsWith('SCOTTYS')) continue;
        
        // Extract numbered key items: "3. Circlip" or "34. Lubricator for upper link"
        // Handle multiple items on one line (3-column layout)
        const keyMatches = [...line.matchAll(/(\d{1,3})\s*[\.\·•]\s*([A-Za-z][A-Za-z\s\-\(\)\/,'""]+?)(?=\d{1,3}\s*[\.\·•]|$)/g)];
        if (keyMatches.length > 0) {
            flushParagraph();
            keyMatches.forEach(m => {
                const num = parseInt(m[1]);
                const desc = m[2].trim().replace(/[\.\s]+$/, '');
                if (desc.length > 1 && num < 200) {
                    keyItems.push({ num, desc });
                }
            });
            continue;
        }
        
        // Also catch single key items like "3 . arc:lip." with OCR noise
        const singleKey = line.match(/^(\d{1,3})\s*[\.\·•:]\s*(.+)/);
        if (singleKey && parseInt(singleKey[1]) < 200 && singleKey[2].length > 2) {
            flushParagraph();
            const desc = singleKey[2].trim().replace(/[\.\s]+$/, '');
            if (desc.length > 1 && /[a-zA-Z]/.test(desc)) {
                keyItems.push({ num: parseInt(singleKey[1]), desc });
            }
            continue;
        }
        
        // Section headings (ALL CAPS, meaningful length)
        if (line.length > 5 && line === line.toUpperCase() && /^[A-Z][A-Z\s,\-\(\)\/\.]+$/.test(line)) {
            flushParagraph();
            flushKeyItems();
            html += `<p class="section-heading"><strong>${highlightText(line, query)}</strong></p>`;
            continue;
        }
        
        // Figure references
        if (/^Fig\.\s/i.test(line)) {
            flushParagraph();
            flushKeyItems();
            html += `<p class="fig-ref"><em>${highlightText(line, query)}</em></p>`;
            continue;
        }
        
        // Section references like "Section K.14" at start
        if (/^Section\s+(No\.\s*)?[A-Z]{1,3}\.\d/i.test(line)) {
            flushParagraph();
            flushKeyItems();
            html += `<p class="section-ref">${highlightText(line, query)}</p>`;
            continue;
        }
        
        // Regular paragraph text (must have some letters)
        if (/[a-zA-Z]{2,}/.test(line) && line.length > 5) {
            flushKeyItems();
            paragraphLines.push(line);
        }
    }
    
    flushParagraph();
    flushKeyItems();
    
    return html || '<p>(No readable text)</p>';
}

function highlightText(text, query) {
    if (!query || !text) return escapeHtml(text || '');
    const escaped = escapeHtml(text);
    const terms = query.split(/\s+/).filter(t => t.length > 1);
    let result = escaped;
    terms.forEach(term => {
        const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
        result = result.replace(regex, '<mark>$1</mark>');
    });
    return result;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Modal with pinch-zoom and pan
let currentZoom = 1;
let panX = 0, panY = 0;
let imgW = 0, imgH = 0;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const modalBody = modalEl.querySelector('.modal-body');

function openModal(src) {
    modalImg.src = src;
    modalEl.hidden = false;
    currentZoom = 1;
    panX = 0;
    panY = 0;
    document.body.style.overflow = 'hidden';
    modalImg.onload = () => {
        imgW = modalImg.naturalWidth;
        imgH = modalImg.naturalHeight;
        fitImage();
    };
}

function fitImage() {
    const bw = modalBody.clientWidth;
    const bh = modalBody.clientHeight;
    const scale = Math.min(bw / imgW, bh / imgH);
    // Position image centered at scale 1
    const displayW = imgW * scale;
    const displayH = imgH * scale;
    modalImg.style.width = displayW + 'px';
    modalImg.style.height = displayH + 'px';
    panX = (bw - displayW) / 2;
    panY = (bh - displayH) / 2;
    currentZoom = 1;
    updateTransform();
}

function updateTransform() {
    modalImg.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
}

function clampPan() {
    const bw = modalBody.clientWidth;
    const bh = modalBody.clientHeight;
    const w = modalImg.clientWidth * currentZoom;
    const h = modalImg.clientHeight * currentZoom;
    
    if (w <= bw) {
        panX = (bw - modalImg.clientWidth) / 2;
    } else {
        const minX = bw - w;
        const maxX = 0;
        panX = Math.min(maxX, Math.max(minX, panX));
    }
    if (h <= bh) {
        panY = (bh - modalImg.clientHeight) / 2;
    } else {
        const minY = bh - h;
        const maxY = 0;
        panY = Math.min(maxY, Math.max(minY, panY));
    }
}

function closeModal() {
    modalEl.hidden = true;
    modalImg.src = '';
    currentZoom = 1;
    document.body.style.overflow = '';
}

// Close button
modalEl.querySelector('.modal-close').addEventListener('click', closeModal);

// Double-tap to toggle zoom
let lastTap = 0;
modalImg.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
        if (currentZoom > 1.1) {
            currentZoom = 1;
            fitImage();
        } else {
            // Zoom to 3x centered on tap point
            const rect = modalImg.getBoundingClientRect();
            const tapX = e.clientX - rect.left;
            const tapY = e.clientY - rect.top;
            const newZoom = 3;
            panX -= tapX * (newZoom - currentZoom);
            panY -= tapY * (newZoom - currentZoom);
            currentZoom = newZoom;
            clampPan();
            updateTransform();
        }
        e.preventDefault();
    } else {
        // Single tap on background area closes
        if (e.target === modalBody) {
            closeModal();
        }
    }
    lastTap = now;
});

// Touch handling for pinch-zoom and pan
let touches = [];
let lastDist = 0;
let lastCenter = null;
let isPinching = false;

modalBody.addEventListener('touchstart', (e) => {
    touches = Array.from(e.touches);
    if (touches.length === 2) {
        isPinching = true;
        lastDist = getTouchDist(touches);
        lastCenter = getTouchCenter(touches);
        e.preventDefault();
    } else if (touches.length === 1 && currentZoom > 1.1) {
        lastCenter = { x: touches[0].clientX, y: touches[0].clientY };
        e.preventDefault();
    }
}, { passive: false });

modalBody.addEventListener('touchmove', (e) => {
    touches = Array.from(e.touches);
    
    if (touches.length === 2) {
        // Pinch zoom
        const dist = getTouchDist(touches);
        const center = getTouchCenter(touches);
        
        if (lastDist > 0) {
            const scale = dist / lastDist;
            const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * scale));
            
            // Zoom toward pinch center
            const rect = modalImg.getBoundingClientRect();
            const cx = center.x - rect.left;
            const cy = center.y - rect.top;
            
            const zoomDelta = newZoom / currentZoom;
            panX -= cx * (zoomDelta - 1);
            panY -= cy * (zoomDelta - 1);
            currentZoom = newZoom;
        }
        
        // Pan with pinch center movement
        if (lastCenter) {
            panX += center.x - lastCenter.x;
            panY += center.y - lastCenter.y;
        }
        
        lastDist = dist;
        lastCenter = center;
        clampPan();
        updateTransform();
        e.preventDefault();
    } else if (touches.length === 1 && currentZoom > 1.1) {
        // Single finger pan when zoomed
        const touch = touches[0];
        if (lastCenter) {
            panX += touch.clientX - lastCenter.x;
            panY += touch.clientY - lastCenter.y;
            clampPan();
            updateTransform();
        }
        lastCenter = { x: touch.clientX, y: touch.clientY };
        e.preventDefault();
    }
}, { passive: false });

modalBody.addEventListener('touchend', (e) => {
    touches = Array.from(e.touches);
    if (touches.length < 2) {
        isPinching = false;
        lastDist = 0;
    }
    if (touches.length === 1) {
        lastCenter = { x: touches[0].clientX, y: touches[0].clientY };
    } else {
        lastCenter = null;
    }
});

function getTouchDist(t) {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(t) {
    return {
        x: (t[0].clientX + t[1].clientX) / 2,
        y: (t[0].clientY + t[1].clientY) / 2,
    };
}

// Mouse wheel zoom (desktop)
modalBody.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = modalImg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    const delta = e.deltaY > 0 ? 0.85 : 1.18;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * delta));
    
    const zoomDelta = newZoom / currentZoom;
    panX -= mx * (zoomDelta - 1);
    panY -= my * (zoomDelta - 1);
    currentZoom = newZoom;
    
    clampPan();
    updateTransform();
}, { passive: false });

// Filters
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        performSearch();
    });
});

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('SW registration failed:', err);
    });
}

// Start
init();
