(function () {
    'use strict';

    // ==========================================
    // CONFIG
    // ==========================================
    const DB_NAME = 'HitunginSensusDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'records';

    // ==========================================
    // DATABASE (IndexedDB)
    // ==========================================
    const DB = {
        db: null,

        async open() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                        store.createIndex('createdAt', 'createdAt', { unique: false });
                        store.createIndex('nama', 'namaKepalaKeluarga', { unique: false });
                    }
                };
                req.onsuccess = (e) => {
                    DB.db = e.target.result;
                    resolve(DB.db);
                };
                req.onerror = (e) => reject(e.target.error);
            });
        },

        async add(record) {
            return new Promise((resolve, reject) => {
                const tx = DB.db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.add(record);
                tx.oncomplete = () => resolve(record.id);
                tx.onerror = (e) => reject(e.target.error);
            });
        },

        async update(record) {
            return new Promise((resolve, reject) => {
                const tx = DB.db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.put(record);
                tx.oncomplete = () => resolve(record.id);
                tx.onerror = (e) => reject(e.target.error);
            });
        },

        async get(id) {
            return new Promise((resolve, reject) => {
                const tx = DB.db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = (e) => reject(e.target.error);
            });
        },

        async getAll() {
            return new Promise((resolve, reject) => {
                const tx = DB.db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = (e) => reject(e.target.error);
            });
        },

        async delete(id) {
            return new Promise((resolve, reject) => {
                const tx = DB.db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error);
            });
        },

        async count() {
            return new Promise((resolve, reject) => {
                const tx = DB.db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.count();
                req.onsuccess = () => resolve(req.result);
                req.onerror = (e) => reject(e.target.error);
            });
        }
    };

    // ==========================================
    // STATE
    // ==========================================
    let currentPage = 'home';
    let familyMemberCount = 0;
    let editingRecordId = null;
    let confirmCallback = null;

    // ==========================================
    // ROUTER
    // ==========================================
    function navigateTo(page) {
        // Deactivate all pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        // Activate target page
        const pageEl = document.getElementById('page-' + page);
        const navBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);

        if (pageEl) pageEl.classList.add('active');
        if (navBtn) navBtn.classList.add('active');

        currentPage = page;

        // Page-specific actions
        if (page === 'home') refreshDashboard();
        if (page === 'data') refreshDataList();
        if (page === 'form') initSignaturePad();

        // Scroll to top
        const content = pageEl && pageEl.querySelector('.page-content');
        if (content) content.scrollTop = 0;
    }

    // ==========================================
    // DASHBOARD
    // ==========================================
    async function refreshDashboard() {
        const records = await DB.getAll();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

        const todayCount = records.filter(r => new Date(r.createdAt) >= today).length;
        const weekCount = records.filter(r => new Date(r.createdAt) >= weekAgo).length;

        animateNumber('stat-total', records.length);
        animateNumber('stat-today', todayCount);
        animateNumber('stat-week', weekCount);

        // Recent list (latest 5)
        const recent = records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
        const recentList = document.getElementById('recent-list');
        const emptyHome = document.getElementById('empty-home');

        if (recent.length === 0) {
            recentList.innerHTML = '';
            recentList.appendChild(emptyHome);
            emptyHome.style.display = '';
        } else {
            recentList.innerHTML = recent.map(r => createDataCardHTML(r)).join('');
            attachDataCardListeners(recentList);
        }
    }

    function animateNumber(id, target) {
        const el = document.getElementById(id);
        if (!el) return;
        const current = parseInt(el.textContent) || 0;
        if (current === target) return;
        
        const duration = 400;
        const start = performance.now();
        
        function update(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(current + (target - current) * eased);
            if (progress < 1) requestAnimationFrame(update);
        }
        
        requestAnimationFrame(update);
    }

    // ==========================================
    // FORM
    // ==========================================
    function collectFormData() {
        const data = {
            id: editingRecordId || generateId(),
            createdAt: editingRecordId ? undefined : new Date().toISOString(), // preserve original
            updatedAt: new Date().toISOString(),

            // Kepala Keluarga
            namaKepalaKeluarga: val('f-nama'),
            nomorWhatsapp: val('f-whatsapp'),
            foto: {
                geotag: checked('f-foto-geotag'),
                kk: checked('f-foto-kk'),
                listrik: checked('f-foto-listrik'),
                ruangTamu: checked('f-foto-ruangtamu'),
                depanRumah: checked('f-foto-depanrumah')
            },

            // Anggota Keluarga
            anggotaKeluarga: collectFamilyMembers(),

            // Asset dan Rumah
            rumahMilik: val('f-rumah-milik'),
            sertifikat: val('f-sertifikat'),
            luasRumah: val('f-luas-rumah'),
            hargaSewa: numVal('f-harga-sewa'),
            toilet: val('f-toilet'),
            airMinum: val('f-air-minum'),
            dayaListrik: val('f-daya-listrik'),
            biayaListrik: numVal('f-biaya-listrik'),
            biayaInternet: numVal('f-biaya-internet'),
            belanjaMakan: numVal('f-belanja-makan'),
            biayaRutinBulanan: numVal('f-biaya-rutin'),
            biayaTidakRutin: numVal('f-biaya-tidak-rutin'),

            // Kepemilikan
            kepemilikan: {
                gas3kg: checked('f-gas3kg'),
                gas55kg: checked('f-gas55kg'),
                kulkas: checked('f-kulkas'),
                komputer: checked('f-komputer'),
                ac: checked('f-ac'),
                emas: checked('f-emas'),
                motor: { punya: checked('f-motor'), harga: numVal('f-motor-harga') },
                mobil: { punya: checked('f-mobil'), harga: numVal('f-mobil-harga') },
                tanah: { punya: checked('f-tanah'), lokasi: val('f-tanah-lokasi') },
                rumahLain: { punya: checked('f-rumah-lain'), lokasi: val('f-rumah-lokasi') }
            },

            // Usaha
            usaha: collectUsaha(),

            // Penyelesaian
            tandaTangan: getSignatureData(),
            stikerDitempel: checked('f-stiker'),
            catatan: val('f-catatan')
        };

        return data;
    }

    function collectFamilyMembers() {
        const members = [];
        const cards = document.querySelectorAll('.member-card');
        cards.forEach((card, i) => {
            const idx = card.dataset.index;
            members.push({
                no: i + 1,
                nama: val(`m-nama-${idx}`),
                lokasi: val(`m-lokasi-${idx}`),
                ijazah: val(`m-ijazah-${idx}`),
                masihSekolah: val(`m-sekolah-${idx}`),
                pekerjaan: val(`m-pekerjaan-${idx}`),
                gaji: numVal(`m-gaji-${idx}`),
                penyakit: val(`m-penyakit-${idx}`),
                nikah: val(`m-nikah-${idx}`),
                rek: val(`m-rek-${idx}`)
            });
        });
        return members;
    }

    function collectUsaha() {
        const types = [];
        const usahaIds = [
            'pertanian', 'perkebunan', 'peternakan', 'kehutanan', 'perikanan',
            'sewa-lahan', 'koskosan', 'konstruksi', 'online', 'keliling', 'jasa-pertanian'
        ];
        usahaIds.forEach(id => {
            if (checked(`f-usaha-${id}`)) {
                types.push(id.replace(/-/g, ' '));
            }
        });
        const lainnya = val('f-usaha-lainnya');
        if (lainnya) types.push(lainnya);
        return types;
    }

    function addFamilyMember(data) {
        familyMemberCount++;
        const idx = familyMemberCount;
        const container = document.getElementById('family-members');

        const html = `
        <div class="member-card" data-index="${idx}">
            <div class="member-card-header">
                <span class="member-number">Anggota #${container.children.length + 1}</span>
                <button type="button" class="btn-remove-member" onclick="window.App.removeMember(${idx})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="member-fields">
                <div class="form-group full-width">
                    <label for="m-nama-${idx}">Nama</label>
                    <input type="text" id="m-nama-${idx}" class="input-field" placeholder="Nama anggota" value="${esc(data?.nama)}">
                </div>
                <div class="form-group">
                    <label for="m-lokasi-${idx}">Lokasi</label>
                    <input type="text" id="m-lokasi-${idx}" class="input-field" placeholder="Lokasi" value="${esc(data?.lokasi)}">
                </div>
                <div class="form-group">
                    <label for="m-ijazah-${idx}">Ijazah</label>
                    <select id="m-ijazah-${idx}" class="input-field">
                        <option value="">-</option>
                        <option value="Tidak ada" ${data?.ijazah === 'Tidak ada' ? 'selected' : ''}>Tidak ada</option>
                        <option value="SD" ${data?.ijazah === 'SD' ? 'selected' : ''}>SD</option>
                        <option value="SMP" ${data?.ijazah === 'SMP' ? 'selected' : ''}>SMP</option>
                        <option value="SMA" ${data?.ijazah === 'SMA' ? 'selected' : ''}>SMA</option>
                        <option value="D3" ${data?.ijazah === 'D3' ? 'selected' : ''}>D3</option>
                        <option value="S1" ${data?.ijazah === 'S1' ? 'selected' : ''}>S1</option>
                        <option value="S2" ${data?.ijazah === 'S2' ? 'selected' : ''}>S2</option>
                        <option value="S3" ${data?.ijazah === 'S3' ? 'selected' : ''}>S3</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="m-sekolah-${idx}">Masih Sekolah</label>
                    <select id="m-sekolah-${idx}" class="input-field">
                        <option value="">-</option>
                        <option value="Ya" ${data?.masihSekolah === 'Ya' ? 'selected' : ''}>Ya</option>
                        <option value="Tidak" ${data?.masihSekolah === 'Tidak' ? 'selected' : ''}>Tidak</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="m-pekerjaan-${idx}">Pekerjaan</label>
                    <input type="text" id="m-pekerjaan-${idx}" class="input-field" placeholder="Pekerjaan" value="${esc(data?.pekerjaan)}">
                </div>
                <div class="form-group">
                    <label for="m-gaji-${idx}">Gaji</label>
                    <input type="number" id="m-gaji-${idx}" class="input-field" placeholder="Rp" value="${data?.gaji || ''}">
                </div>
                <div class="form-group">
                    <label for="m-penyakit-${idx}">Penyakit</label>
                    <input type="text" id="m-penyakit-${idx}" class="input-field" placeholder="-" value="${esc(data?.penyakit)}">
                </div>
                <div class="form-group">
                    <label for="m-nikah-${idx}">Nikah</label>
                    <select id="m-nikah-${idx}" class="input-field">
                        <option value="">-</option>
                        <option value="Belum" ${data?.nikah === 'Belum' ? 'selected' : ''}>Belum</option>
                        <option value="Menikah" ${data?.nikah === 'Menikah' ? 'selected' : ''}>Menikah</option>
                        <option value="Cerai" ${data?.nikah === 'Cerai' ? 'selected' : ''}>Cerai</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="m-rek-${idx}">Rek. Bank</label>
                    <select id="m-rek-${idx}" class="input-field">
                        <option value="">-</option>
                        <option value="Ada" ${data?.rek === 'Ada' ? 'selected' : ''}>Ada</option>
                        <option value="Tidak" ${data?.rek === 'Tidak' ? 'selected' : ''}>Tidak</option>
                    </select>
                </div>
            </div>
        </div>`;

        container.insertAdjacentHTML('beforeend', html);
        updateMemberCount();
    }

    function removeMember(idx) {
        const card = document.querySelector(`.member-card[data-index="${idx}"]`);
        if (card) {
            card.style.opacity = '0';
            card.style.transform = 'translateX(-20px)';
            card.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                card.remove();
                renumberMembers();
                updateMemberCount();
            }, 300);
        }
    }

    function renumberMembers() {
        document.querySelectorAll('.member-card').forEach((card, i) => {
            const numEl = card.querySelector('.member-number');
            if (numEl) numEl.textContent = `Anggota #${i + 1}`;
        });
    }

    function updateMemberCount() {
        const count = document.querySelectorAll('.member-card').length;
        const badge = document.getElementById('member-count');
        if (badge) badge.textContent = count;
    }

    function resetForm() {
        const form = document.getElementById('census-form');
        if (form) form.reset();
        
        document.getElementById('family-members').innerHTML = '';
        familyMemberCount = 0;
        updateMemberCount();
        editingRecordId = null;
        document.getElementById('edit-record-id').value = '';
        document.getElementById('btn-submit-text').textContent = 'Simpan Data';

        // Reset asset value fields
        ['f-motor-harga', 'f-mobil-harga', 'f-tanah-lokasi', 'f-rumah-lokasi'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = true;
        });

        // Clear signature
        clearSignature();

        // Collapse all sections except first
        document.querySelectorAll('.form-section').forEach((s, i) => {
            if (i === 0) s.classList.add('open');
            else s.classList.remove('open');
        });
    }

    function populateForm(record) {
        editingRecordId = record.id;
        document.getElementById('edit-record-id').value = record.id;
        document.getElementById('btn-submit-text').textContent = 'Update Data';

        // Kepala Keluarga
        setVal('f-nama', record.namaKepalaKeluarga);
        setVal('f-whatsapp', record.nomorWhatsapp);
        setCheck('f-foto-geotag', record.foto?.geotag);
        setCheck('f-foto-kk', record.foto?.kk);
        setCheck('f-foto-listrik', record.foto?.listrik);
        setCheck('f-foto-ruangtamu', record.foto?.ruangTamu);
        setCheck('f-foto-depanrumah', record.foto?.depanRumah);

        // Anggota Keluarga
        document.getElementById('family-members').innerHTML = '';
        familyMemberCount = 0;
        if (record.anggotaKeluarga && record.anggotaKeluarga.length > 0) {
            record.anggotaKeluarga.forEach(m => addFamilyMember(m));
        }

        // Asset dan Rumah
        setVal('f-rumah-milik', record.rumahMilik);
        setVal('f-sertifikat', record.sertifikat);
        setVal('f-luas-rumah', record.luasRumah);
        setVal('f-harga-sewa', record.hargaSewa);
        setVal('f-toilet', record.toilet);
        setVal('f-air-minum', record.airMinum);
        setVal('f-daya-listrik', record.dayaListrik);
        setVal('f-biaya-listrik', record.biayaListrik);
        setVal('f-biaya-internet', record.biayaInternet);
        setVal('f-belanja-makan', record.belanjaMakan);
        setVal('f-biaya-rutin', record.biayaRutinBulanan);
        setVal('f-biaya-tidak-rutin', record.biayaTidakRutin);

        // Kepemilikan
        const kp = record.kepemilikan || {};
        setCheck('f-gas3kg', kp.gas3kg);
        setCheck('f-gas55kg', kp.gas55kg);
        setCheck('f-kulkas', kp.kulkas);
        setCheck('f-komputer', kp.komputer);
        setCheck('f-ac', kp.ac);
        setCheck('f-emas', kp.emas);

        setCheck('f-motor', kp.motor?.punya);
        setVal('f-motor-harga', kp.motor?.harga);
        setCheck('f-mobil', kp.mobil?.punya);
        setVal('f-mobil-harga', kp.mobil?.harga);
        setCheck('f-tanah', kp.tanah?.punya);
        setVal('f-tanah-lokasi', kp.tanah?.lokasi);
        setCheck('f-rumah-lain', kp.rumahLain?.punya);
        setVal('f-rumah-lokasi', kp.rumahLain?.lokasi);

        // Enable/disable asset value fields
        toggleAssetField('f-motor', 'f-motor-harga');
        toggleAssetField('f-mobil', 'f-mobil-harga');
        toggleAssetField('f-tanah', 'f-tanah-lokasi');
        toggleAssetField('f-rumah-lain', 'f-rumah-lokasi');

        // Usaha
        const usahaIds = [
            'pertanian', 'perkebunan', 'peternakan', 'kehutanan', 'perikanan',
            'sewa-lahan', 'koskosan', 'konstruksi', 'online', 'keliling', 'jasa-pertanian'
        ];
        const usaha = record.usaha || [];
        usahaIds.forEach(id => {
            setCheck(`f-usaha-${id}`, usaha.includes(id.replace(/-/g, ' ')));
        });
        // Lainnya: anything not in predefined
        const predefined = usahaIds.map(id => id.replace(/-/g, ' '));
        const lainnya = usaha.filter(u => !predefined.includes(u)).join(', ');
        setVal('f-usaha-lainnya', lainnya);

        // Penyelesaian
        setCheck('f-stiker', record.stikerDitempel);
        setVal('f-catatan', record.catatan);

        // Open all sections when editing
        document.querySelectorAll('.form-section').forEach(s => s.classList.add('open'));
    }

    async function saveForm() {
        const data = collectFormData();

        if (!data.namaKepalaKeluarga.trim()) {
            showToast('Nama Kepala Keluarga wajib diisi!', 'error');
            return;
        }

        try {
            if (editingRecordId) {
                // Preserve original creation date
                const existing = await DB.get(editingRecordId);
                if (existing) data.createdAt = existing.createdAt;
                await DB.update(data);
                showToast('✅ Data berhasil diupdate!', 'success');
            } else {
                data.createdAt = new Date().toISOString();
                await DB.add(data);
                showToast('✅ Data berhasil disimpan!', 'success');
            }

            resetForm();
            navigateTo('home');
        } catch (err) {
            console.error('Save error:', err);
            showToast('❌ Gagal menyimpan data', 'error');
        }
    }

    // ==========================================
    // DATA LIST
    // ==========================================
    async function refreshDataList() {
        let records = await DB.getAll();
        const searchTerm = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
        const sortBy = document.getElementById('sort-select')?.value || 'newest';

        // Search filter
        if (searchTerm) {
            records = records.filter(r =>
                (r.namaKepalaKeluarga || '').toLowerCase().includes(searchTerm) ||
                (r.nomorWhatsapp || '').toLowerCase().includes(searchTerm)
            );
        }

        // Sort
        switch (sortBy) {
            case 'newest':
                records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'oldest':
                records.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                break;
            case 'name':
                records.sort((a, b) => (a.namaKepalaKeluarga || '').localeCompare(b.namaKepalaKeluarga || ''));
                break;
        }

        // Update count
        const countEl = document.getElementById('data-count');
        if (countEl) countEl.textContent = `${records.length} data`;

        // Render
        const listEl = document.getElementById('data-list');
        const emptyEl = document.getElementById('empty-data');

        if (records.length === 0) {
            listEl.innerHTML = '';
            listEl.appendChild(emptyEl);
            emptyEl.style.display = '';
        } else {
            listEl.innerHTML = records.map(r => createDataCardHTML(r)).join('');
            attachDataCardListeners(listEl);
        }
    }

    function createDataCardHTML(record) {
        const date = formatDate(record.createdAt);
        const memberCount = (record.anggotaKeluarga || []).length;
        const wa = record.nomorWhatsapp ? `📱 ${record.nomorWhatsapp}` : '';

        return `
        <div class="data-card" data-id="${record.id}">
            <div class="data-card-header">
                <span class="data-card-name">${esc(record.namaKepalaKeluarga || 'Tanpa Nama')}</span>
                <span class="data-card-date">${date}</span>
            </div>
            <div class="data-card-info">
                ${memberCount > 0 ? `<span class="data-card-tag tag-primary">👨‍👩‍👧‍👦 ${memberCount} anggota</span>` : ''}
                ${wa ? `<span class="data-card-tag">${wa}</span>` : ''}
                ${record.sertifikat ? `<span class="data-card-tag">📄 ${record.sertifikat}</span>` : ''}
            </div>
        </div>`;
    }

    function attachDataCardListeners(container) {
        container.querySelectorAll('.data-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                showRecordModal(id);
            });
        });
    }

    // ==========================================
    // MODAL: View Record
    // ==========================================
    async function showRecordModal(id) {
        const record = await DB.get(id);
        if (!record) return;

        const modal = document.getElementById('record-modal');
        const body = document.getElementById('modal-body');
        const title = document.getElementById('modal-title');

        title.textContent = record.namaKepalaKeluarga || 'Detail Data';

        let html = '';

        // Section: Kepala Keluarga
        html += `<div class="detail-section">`;
        html += `<div class="detail-section-title">👤 Kepala Keluarga</div>`;
        html += detailRow('Nama', record.namaKepalaKeluarga);
        html += detailRow('WhatsApp', record.nomorWhatsapp);
        const fotoItems = [];
        if (record.foto?.geotag) fotoItems.push('📍Geotag');
        if (record.foto?.kk) fotoItems.push('📄KK');
        if (record.foto?.listrik) fotoItems.push('⚡Listrik');
        if (record.foto?.ruangTamu) fotoItems.push('🛋️R.Tamu');
        if (record.foto?.depanRumah) fotoItems.push('🏠Depan');
        if (fotoItems.length > 0) html += detailRow('Foto', fotoItems.join(', '));
        html += `</div>`;

        // Section: Anggota Keluarga
        if (record.anggotaKeluarga && record.anggotaKeluarga.length > 0) {
            html += `<div class="detail-section">`;
            html += `<div class="detail-section-title">👨‍👩‍👧‍👦 Anggota Keluarga (${record.anggotaKeluarga.length})</div>`;
            record.anggotaKeluarga.forEach((m, i) => {
                html += `<div style="background:var(--surface-2);border-radius:8px;padding:10px;margin-bottom:8px;">`;
                html += `<div style="font-weight:700;font-size:0.8rem;color:var(--primary-light);margin-bottom:6px;">Anggota #${i + 1}${m.nama ? ': ' + esc(m.nama) : ''}</div>`;
                if (m.lokasi) html += detailRow('Lokasi', m.lokasi);
                if (m.ijazah) html += detailRow('Ijazah', m.ijazah);
                if (m.masihSekolah) html += detailRow('Sekolah', m.masihSekolah);
                if (m.pekerjaan) html += detailRow('Pekerjaan', m.pekerjaan);
                if (m.gaji) html += detailRow('Gaji', formatRupiah(m.gaji));
                if (m.penyakit) html += detailRow('Penyakit', m.penyakit);
                if (m.nikah) html += detailRow('Nikah', m.nikah);
                if (m.rek) html += detailRow('Rek. Bank', m.rek);
                html += `</div>`;
            });
            html += `</div>`;
        }

        // Section: Asset dan Rumah
        html += `<div class="detail-section">`;
        html += `<div class="detail-section-title">🏠 Asset dan Rumah</div>`;
        if (record.rumahMilik) html += detailRow('Rumah Milik', record.rumahMilik);
        if (record.sertifikat) html += detailRow('Sertifikat', record.sertifikat);
        if (record.luasRumah) html += detailRow('Luas Rumah', record.luasRumah);
        if (record.hargaSewa) html += detailRow('Harga Sewa/Bln', formatRupiah(record.hargaSewa));
        if (record.toilet) html += detailRow('Toilet', record.toilet);
        if (record.airMinum) html += detailRow('Air Minum', record.airMinum);
        if (record.dayaListrik) html += detailRow('Daya Listrik', record.dayaListrik);
        if (record.biayaListrik) html += detailRow('Biaya Listrik/Bln', formatRupiah(record.biayaListrik));
        if (record.biayaInternet) html += detailRow('Internet/Bln', formatRupiah(record.biayaInternet));
        if (record.belanjaMakan) html += detailRow('Makan/Hari', formatRupiah(record.belanjaMakan));
        if (record.biayaRutinBulanan) html += detailRow('Rutin/Bln', formatRupiah(record.biayaRutinBulanan));
        if (record.biayaTidakRutin) html += detailRow('Tidak Rutin/Thn', formatRupiah(record.biayaTidakRutin));
        html += `</div>`;

        // Section: Kepemilikan
        const kp = record.kepemilikan || {};
        const owned = [];
        if (kp.gas3kg) owned.push('🔥 Gas 3Kg');
        if (kp.gas55kg) owned.push('🔥 Gas 5.5Kg');
        if (kp.kulkas) owned.push('🧊 Kulkas');
        if (kp.komputer) owned.push('💻 Komputer');
        if (kp.ac) owned.push('❄️ AC');
        if (kp.emas) owned.push('💎 Emas');
        if (owned.length > 0 || kp.motor?.punya || kp.mobil?.punya || kp.tanah?.punya || kp.rumahLain?.punya) {
            html += `<div class="detail-section">`;
            html += `<div class="detail-section-title">📦 Kepemilikan</div>`;
            if (owned.length > 0) html += detailRow('Barang', owned.join(', '));
            if (kp.motor?.punya) html += detailRow('🏍️ Motor', kp.motor.harga ? formatRupiah(kp.motor.harga) : 'Ya');
            if (kp.mobil?.punya) html += detailRow('🚗 Mobil', kp.mobil.harga ? formatRupiah(kp.mobil.harga) : 'Ya');
            if (kp.tanah?.punya) html += detailRow('🌍 Tanah', kp.tanah.lokasi || 'Ya');
            if (kp.rumahLain?.punya) html += detailRow('🏘️ Rumah Lain', kp.rumahLain.lokasi || 'Ya');
            html += `</div>`;
        }

        // Section: Usaha
        if (record.usaha && record.usaha.length > 0) {
            html += `<div class="detail-section">`;
            html += `<div class="detail-section-title">💼 Usaha</div>`;
            html += detailRow('Jenis', record.usaha.join(', '));
            html += `</div>`;
        }

        // Section: Penyelesaian
        html += `<div class="detail-section">`;
        html += `<div class="detail-section-title">✍️ Penyelesaian</div>`;
        html += detailRow('Stiker', record.stikerDitempel ? '✅ Sudah' : '❌ Belum');
        if (record.catatan) html += detailRow('Catatan', record.catatan);
        if (record.tandaTangan && record.tandaTangan !== 'data:,') {
            html += `<div style="margin-top:8px;"><label style="font-size:0.8rem;color:var(--text-secondary);">Tanda Tangan:</label><img src="${record.tandaTangan}" style="width:100%;max-height:100px;object-fit:contain;border:1px solid var(--border);border-radius:8px;margin-top:4px;background:var(--surface-2);"></div>`;
        }
        html += `</div>`;

        // Date info
        html += `<div style="font-size:0.7rem;color:var(--text-muted);text-align:center;padding-top:8px;border-top:1px solid var(--border);">`;
        html += `Dibuat: ${formatDate(record.createdAt, true)}`;
        if (record.updatedAt !== record.createdAt) {
            html += ` · Diubah: ${formatDate(record.updatedAt, true)}`;
        }
        html += `</div>`;

        body.innerHTML = html;

        // Setup modal buttons
        document.getElementById('btn-modal-edit').onclick = () => {
            closeModal('record-modal');
            populateForm(record);
            navigateTo('form');
        };

        document.getElementById('btn-modal-delete').onclick = () => {
            showConfirm('Hapus Data?', `Data "${record.namaKepalaKeluarga}" akan dihapus permanen.`, async () => {
                await DB.delete(record.id);
                closeModal('record-modal');
                showToast('🗑️ Data berhasil dihapus', 'success');
                refreshDataList();
                refreshDashboard();
            });
        };

        modal.classList.remove('hidden');
    }

    function detailRow(label, value) {
        if (!value && value !== 0) return '';
        return `<div class="detail-row"><span class="label">${label}</span><span class="value">${esc(String(value))}</span></div>`;
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('hidden');
    }

    // ==========================================
    // CONFIRM DIALOG
    // ==========================================
    function showConfirm(title, message, callback) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        confirmCallback = callback;
        document.getElementById('confirm-dialog').classList.remove('hidden');
    }

    // ==========================================
    // EXPORT / IMPORT
    // ==========================================
    async function exportData() {
        const records = await DB.getAll();
        if (records.length === 0) {
            showToast('Tidak ada data untuk di-export', 'error');
            return;
        }

        const dataStr = JSON.stringify(records, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `sensus-data-${date}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast(`📤 ${records.length} data berhasil di-export!`, 'success');
    }

    async function importData(file) {
        try {
            const text = await file.text();
            const records = JSON.parse(text);

            if (!Array.isArray(records)) throw new Error('Format file tidak valid');

            let imported = 0;
            for (const record of records) {
                if (record.id && record.namaKepalaKeluarga) {
                    try {
                        // Check if exists
                        const existing = await DB.get(record.id);
                        if (existing) {
                            await DB.update(record);
                        } else {
                            await DB.add(record);
                        }
                        imported++;
                    } catch (e) {
                        console.warn('Skip record:', e);
                    }
                }
            }

            showToast(`📥 ${imported} data berhasil di-import!`, 'success');
            refreshDashboard();
            refreshDataList();
        } catch (err) {
            console.error('Import error:', err);
            showToast('❌ Gagal import: file tidak valid', 'error');
        }
    }

    // ==========================================
    // SIGNATURE PAD
    // ==========================================
    let signatureCanvas, signatureCtx;
    let isDrawing = false;
    let signatureInitialized = false;

    function initSignaturePad() {
        if (signatureInitialized) return;
        signatureCanvas = document.getElementById('signature-canvas');
        if (!signatureCanvas) return;

        signatureCtx = signatureCanvas.getContext('2d');

        // Wait for layout to be ready
        requestAnimationFrame(() => {
            resizeSignatureCanvas();
            signatureInitialized = true;
        });

        // Touch events
        signatureCanvas.addEventListener('touchstart', onDrawStart, { passive: false });
        signatureCanvas.addEventListener('touchmove', onDraw, { passive: false });
        signatureCanvas.addEventListener('touchend', onDrawEnd);

        // Mouse events
        signatureCanvas.addEventListener('mousedown', onDrawStart);
        signatureCanvas.addEventListener('mousemove', onDraw);
        signatureCanvas.addEventListener('mouseup', onDrawEnd);
        signatureCanvas.addEventListener('mouseleave', onDrawEnd);
    }

    function resizeSignatureCanvas() {
        if (!signatureCanvas) return;
        const rect = signatureCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        signatureCanvas.width = rect.width * dpr;
        signatureCanvas.height = rect.height * dpr;
        signatureCtx.scale(dpr, dpr);
        signatureCtx.strokeStyle = '#f0f0f8';
        signatureCtx.lineWidth = 2;
        signatureCtx.lineCap = 'round';
        signatureCtx.lineJoin = 'round';
    }

    function onDrawStart(e) {
        isDrawing = true;
        const pos = getDrawPos(e);
        signatureCtx.beginPath();
        signatureCtx.moveTo(pos.x, pos.y);
        e.preventDefault();
    }

    function onDraw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getDrawPos(e);
        signatureCtx.lineTo(pos.x, pos.y);
        signatureCtx.stroke();
    }

    function onDrawEnd() {
        isDrawing = false;
    }

    function getDrawPos(e) {
        const rect = signatureCanvas.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    }

    function clearSignature() {
        if (signatureCtx && signatureCanvas) {
            const dpr = window.devicePixelRatio || 1;
            signatureCtx.clearRect(0, 0, signatureCanvas.width / dpr, signatureCanvas.height / dpr);
        }
    }

    function getSignatureData() {
        if (!signatureCanvas) return '';
        return signatureCanvas.toDataURL('image/png');
    }

    // ==========================================
    // CALCULATOR (Tools - preserved from original)
    // ==========================================
    const currencyFormatter = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    });

    function formatRupiah(value) {
        return currencyFormatter.format(value);
    }

    function calculateExpenses() {
        const input = parseFloat(document.getElementById('daily-expense')?.value);
        const monthlyEl = document.getElementById('monthly-expense-result');
        const yearlyEl = document.getElementById('yearly-expense-result');

        if (isNaN(input) || input < 0) {
            if (monthlyEl) monthlyEl.textContent = 'Rp 0';
            if (yearlyEl) yearlyEl.textContent = 'Rp 0';
            return;
        }

        const daily = input * 1000;
        if (monthlyEl) monthlyEl.textContent = formatRupiah(daily * 30);
        if (yearlyEl) yearlyEl.textContent = formatRupiah(daily * 365);
    }

    function calculateWages() {
        const wage = parseFloat(document.getElementById('employee-wage')?.value);
        const count = parseFloat(document.getElementById('employee-count')?.value);
        const monthlyEl = document.getElementById('monthly-wage-result');
        const yearlyEl = document.getElementById('yearly-wage-result');

        if (isNaN(wage) || isNaN(count) || wage < 0 || count < 0) {
            if (monthlyEl) monthlyEl.textContent = 'Rp 0';
            if (yearlyEl) yearlyEl.textContent = 'Rp 0';
            return;
        }

        const wageRp = wage * 1000;
        const emp = Math.floor(count);
        const monthly = wageRp * emp;

        if (monthlyEl) monthlyEl.textContent = formatRupiah(monthly);
        if (yearlyEl) yearlyEl.textContent = formatRupiah(monthly * 12);
    }

    // ==========================================
    // TOAST
    // ==========================================
    let toastTimer = null;

    function showToast(message, type) {
        const toast = document.getElementById('toast');
        const msgEl = document.getElementById('toast-message');
        if (!toast || !msgEl) return;

        if (toastTimer) clearTimeout(toastTimer);

        msgEl.textContent = message;
        toast.className = 'toast show';
        if (type === 'success') toast.classList.add('toast-success');
        if (type === 'error') toast.classList.add('toast-error');

        toastTimer = setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }

    // ==========================================
    // UTILITIES
    // ==========================================
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    function val(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function numVal(id) {
        const v = parseFloat(val(id));
        return isNaN(v) ? 0 : v;
    }

    function checked(id) {
        const el = document.getElementById(id);
        return el ? el.checked : false;
    }

    function setVal(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    }

    function setCheck(id, value) {
        const el = document.getElementById(id);
        if (el) el.checked = !!value;
    }

    function esc(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr, full) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
        if (full) {
            return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        return `${d.getDate()} ${months[d.getMonth()]}`;
    }

    function toggleAssetField(checkboxId, fieldId) {
        const cb = document.getElementById(checkboxId);
        const field = document.getElementById(fieldId);
        if (cb && field) {
            field.disabled = !cb.checked;
            if (!cb.checked) field.value = '';
        }
    }

    // ==========================================
    // EVENT LISTENERS & INIT
    // ==========================================
    document.addEventListener('DOMContentLoaded', async () => {
        // Open database
        await DB.open();

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => navigateTo(btn.dataset.page));
        });

        // Quick action buttons
        document.getElementById('btn-new-form')?.addEventListener('click', () => {
            resetForm();
            navigateTo('form');
        });

        document.getElementById('btn-see-all')?.addEventListener('click', () => navigateTo('data'));

        // Form section toggles
        document.querySelectorAll('.form-section-header').forEach(header => {
            header.addEventListener('click', () => {
                header.parentElement.classList.toggle('open');
            });
        });

        // Add family member
        document.getElementById('btn-add-member')?.addEventListener('click', () => addFamilyMember());

        // Form submit
        document.getElementById('census-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            saveForm();
        });

        // Reset form
        document.getElementById('btn-reset-form')?.addEventListener('click', () => {
            showConfirm('Reset Form?', 'Semua isian form akan dihapus.', () => {
                resetForm();
                closeModal('confirm-dialog');
                showToast('Form telah direset', 'success');
            });
        });

        // Clear signature
        document.getElementById('btn-clear-signature')?.addEventListener('click', clearSignature);

        // Asset checkbox -> enable value field
        const assetPairs = [
            ['f-motor', 'f-motor-harga'],
            ['f-mobil', 'f-mobil-harga'],
            ['f-tanah', 'f-tanah-lokasi'],
            ['f-rumah-lain', 'f-rumah-lokasi']
        ];
        assetPairs.forEach(([cbId, fieldId]) => {
            document.getElementById(cbId)?.addEventListener('change', () => toggleAssetField(cbId, fieldId));
        });

        // Search
        document.getElementById('search-input')?.addEventListener('input', (e) => {
            const clearBtn = document.getElementById('btn-clear-search');
            if (clearBtn) clearBtn.style.display = e.target.value ? '' : 'none';
            refreshDataList();
        });

        document.getElementById('btn-clear-search')?.addEventListener('click', () => {
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = '';
            document.getElementById('btn-clear-search').style.display = 'none';
            refreshDataList();
        });

        // Sort
        document.getElementById('sort-select')?.addEventListener('change', refreshDataList);

        // Export
        document.getElementById('btn-export')?.addEventListener('click', exportData);

        // Import
        document.getElementById('btn-import')?.addEventListener('click', () => {
            document.getElementById('import-file-input')?.click();
        });

        document.getElementById('import-file-input')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                importData(file);
                e.target.value = '';
            }
        });

        // Modal close
        document.getElementById('btn-close-modal')?.addEventListener('click', () => closeModal('record-modal'));

        document.getElementById('record-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'record-modal') closeModal('record-modal');
        });

        // Confirm dialog
        document.getElementById('btn-confirm-cancel')?.addEventListener('click', () => {
            closeModal('confirm-dialog');
            confirmCallback = null;
        });

        document.getElementById('btn-confirm-ok')?.addEventListener('click', () => {
            closeModal('confirm-dialog');
            if (confirmCallback) {
                confirmCallback();
                confirmCallback = null;
            }
        });

        // Calculator listeners
        document.getElementById('daily-expense')?.addEventListener('input', calculateExpenses);
        document.getElementById('employee-wage')?.addEventListener('input', calculateWages);
        document.getElementById('employee-count')?.addEventListener('input', calculateWages);

        // PWA Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(err => {
                console.log('SW registration failed:', err);
            });
        }

        // Initial load
        refreshDashboard();

        // Expose for inline onclick handlers
        window.App = { removeMember };
    });

})();
