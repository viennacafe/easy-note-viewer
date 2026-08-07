const {app, BrowserWindow, dialog, ipcMain, shell, Menu, protocol, net} = require('electron');
const fs = require('fs');
const path = require('path');
const {pathToFileURL} = require('url');
const cheerio = require('cheerio');

let mainWindow;
let notesRoot = null;

protocol.registerSchemesAsPrivileged([{
    scheme: 'note-resource',
    privileges: {standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true}
}]);

function settingsPath() {
    return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
    try {
        const f = settingsPath();
        return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
    } catch {
        return {};
    }
}

function saveSettings() {
    const f = settingsPath();
    fs.mkdirSync(path.dirname(f), {recursive: true});
    fs.writeFileSync(f, JSON.stringify({notesRoot}, null, 2), 'utf8');
}

function restoreRoot() {
    const s = loadSettings();
    if (s.notesRoot && fs.existsSync(s.notesRoot) && fs.statSync(s.notesRoot).isDirectory()) notesRoot = path.resolve(s.notesRoot);
}

function isInsideRoot(p) {
    if (!notesRoot) return false;
    const r = path.resolve(notesRoot), c = path.resolve(p);
    return c === r || c.startsWith(r + path.sep);
}

function isHtmlFile(p) {
    return /\.html?$/i.test(p);
}

function walk(dir, base = dir) {
    let out = [];
    for (const e of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name, 'ko'))) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out = out.concat(walk(p, base)); else if (e.isFile() && isHtmlFile(e.name)) out.push({
            fullPath: p,
            relativePath: path.relative(base, p)
        });
    }
    return out;
}

function titleOf(p) {
    try {
        const $ = cheerio.load(fs.readFileSync(p, 'utf8'));
        return {
            "title": $('tr').eq(0).find('th').text().trim(),
            "date": $('tr').eq(1).find('td').text().trim(),
            "sender": $('tr').eq(2).find('td').text().trim()
        }
            //|| $('h1').first().text().trim() || path.basename(p, path.extname(p));
    } catch {
        return path.basename(p, path.extname(p));
    }
}

function registerProtocol() {
    protocol.handle('note-resource', async req => {
        try {
            if (!notesRoot) return new Response('쪽지 경로가 설정되지 않았습니다.', {status: 404});
            const u = new URL(req.url);
            if (u.hostname !== 'local') return new Response('허용되지 않은 호스트입니다.', {status: 403});
            const rel = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
            const target = path.resolve(notesRoot, rel);
            if (!isInsideRoot(target)) return new Response('쪽지 루트 밖의 리소스입니다.', {status: 403});
            if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return new Response('파일을 찾을 수 없습니다.', {status: 404});
            return net.fetch(pathToFileURL(target).href);
        } catch (e) {
            console.error(e);
            return new Response('리소스를 불러오지 못했습니다.', {status: 500});
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1500,
        height: 900,
        minWidth: 1000,
        minHeight: 650,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    mainWindow.setMenuBarVisibility(false);
    const u = process.env.VITE_DEV_SERVER_URL;
    u ? mainWindow.loadURL(u) : mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    restoreRoot();
    registerProtocol();
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('settings:get-root', () => ({root: notesRoot}));
ipcMain.handle('settings:set-root', (_e, p) => {
    const r = path.resolve(String(p || ''));
    if (!fs.existsSync(r) || !fs.statSync(r).isDirectory()) throw new Error('유효한 폴더가 아닙니다.');
    notesRoot = r;
    saveSettings();
    return {root: notesRoot};
});
ipcMain.handle('dialog:choose-root', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {properties: ['openDirectory']});
    if (r.canceled || !r.filePaths.length) return {canceled: true};
    notesRoot = path.resolve(r.filePaths[0]);
    saveSettings();
    return {canceled: false, root: notesRoot};
});
ipcMain.handle('notes:list-all', (_e, q = '') => {
    if (!notesRoot) return {items: [], total: 0};
    const kw = String(q).trim().toLowerCase();
    let items = walk(notesRoot).map(x => ({
        id: x.relativePath,
        title: titleOf(x.fullPath).title,
        date: titleOf(x.fullPath).date,
        sender: titleOf(x.fullPath).sender,
        name: path.basename(x.fullPath),
        relativePath: x.relativePath
    }));
    if (kw) items = items.filter(x => `${x.title} ${x.name} ${x.relativePath}`.toLowerCase().includes(kw));
    items.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    return {items, total: items.length};
});
ipcMain.handle('notes:read', (_e, rel) => {
    if (!notesRoot) throw new Error('쪽지 경로가 설정되지 않았습니다.');
    const p = path.resolve(notesRoot, String(rel || ''));
    if (!isInsideRoot(p) || !fs.existsSync(p) || !fs.statSync(p).isFile() || !isHtmlFile(p)) throw new Error('HTML 쪽지 파일을 찾을 수 없습니다.');
    return {html: fs.readFileSync(p, 'utf8'), relativePath: path.relative(notesRoot, p)};
});
ipcMain.handle('files:open', async (_e, {href, noteRelativePath}) => {
    const raw = String(href || '').trim();
    if (/^(https?:|mailto:)/i.test(raw)) {
        await shell.openExternal(raw);
        return {ok: true};
    }
    if (/^(javascript:|#|data:|blob:)/i.test(raw)) return {ok: false, ignored: true};
    const note = path.resolve(notesRoot, String(noteRelativePath || ''));
    if (!isInsideRoot(note)) throw new Error('허용되지 않은 쪽지 경로입니다.');
    const target = path.resolve(path.dirname(note), decodeURIComponent(raw.split(/[?#]/)[0]));
    if (!isInsideRoot(target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error('첨부파일을 찾을 수 없습니다.');
    const err = await shell.openPath(target);
    if (err) throw new Error(err);
    return {ok: true};
});
